"""M-COP v3.3 — Automated Evidence Retrieval

This module ships the *automated evidence retrieval* surface that the
Guardian v0.1 calibration language pointed to as the logical next step
after the deterministic grounding index landed. The goal is two-fold:

1.  Reduce the manual overhead of populating ``Hypothesis.evidence`` by
    exposing a plug-in :class:`EvidenceRetriever` contract that engines
    and adapters can call from inside their reasoning loops.
2.  Preserve **human primacy** — every retriever advertises an
    ``allows_human_override`` flag and the engine *never* uses retrieved
    evidence to silently override a maintainer or human reviewer's
    explicit Evidence. Retrieved items are added alongside, never on top
    of, human-supplied evidence.

The default backend is a deterministic, in-memory cosine retriever
built on the same token-bag vocabulary the rest of the framework uses
for parity. Production deployments can swap in an embedding-backed
retriever (BM25, FAISS, OpenSearch, …) by subclassing
:class:`EvidenceRetriever` — the engine talks to the abstract surface
only.
"""

from __future__ import annotations

import math
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .mcop_types import Evidence, Hypothesis, Problem

__all__ = [
    "RetrieverConfig",
    "RetrievalResult",
    "EvidenceRetriever",
    "InMemoryEvidenceRetriever",
    "CompositeEvidenceRetriever",
    "build_query_from_hypothesis",
]


_TOKEN_RE = re.compile(r"[A-Za-z0-9']+")


def _tokenize(text: str) -> List[str]:
    """Lower-cased word-boundary tokenizer used for deterministic
    cosine similarity. Kept simple so cross-runtime parity with the
    TypeScript retriever is trivial to maintain."""
    return [t.lower() for t in _TOKEN_RE.findall(text or "")]


def _bag_of_tokens(text: str) -> Dict[str, int]:
    bag: Dict[str, int] = {}
    for token in _tokenize(text):
        bag[token] = bag.get(token, 0) + 1
    return bag


def _cosine(a: Dict[str, int], b: Dict[str, int]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in a.keys() & b.keys())
    if dot == 0:
        return 0.0
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def build_query_from_hypothesis(
    hypothesis: Hypothesis, problem: Optional[Problem] = None
) -> str:
    """Project a hypothesis (+ optional problem) into a retrieval query.

    The hypothesis content carries the strongest signal; we splice in
    the problem description as low-weight context so retrievers can
    disambiguate similar phrasings across different problems.
    """
    parts: List[str] = [hypothesis.content or ""]
    if problem is not None and problem.description:
        parts.append(problem.description)
    return " ".join(p for p in parts if p)


@dataclass
class RetrieverConfig:
    """Configuration applied to every retrieve() call.

    ``min_similarity`` filters out candidates that don't clear a
    relevance bar — the engine never multiplies their weight against
    grounding, so noisy hits are silently dropped instead of poisoning
    the grounding index.
    """

    top_k: int = 5
    min_similarity: float = 0.10
    # Default evidence weight when the underlying corpus does not
    # supply one. Conservative on purpose — the GroundingCalculator
    # decays this further via the evidence-hierarchy weights.
    default_weight: float = 0.5
    # When True the retriever is allowed to short-circuit on cached
    # results within a single solve() call. Cache scope is the
    # retriever instance; the engine never persists it.
    cache_within_call: bool = True
    # ALWAYS True for the default retrievers. Subclasses that wish to
    # add hard policy guards on retrieved evidence (e.g. a
    # safety-filter retriever) may set this to False — the engine then
    # treats their output as advisory and routes blocking decisions to
    # a human reviewer.
    allows_human_override: bool = True


@dataclass
class RetrievalResult:
    """A single retrieval hit, ranked by similarity.

    ``similarity`` is the deterministic cosine score against the query,
    while ``evidence`` is the Evidence dataclass that will be attached
    to the requesting Hypothesis.
    """

    evidence: Evidence
    similarity: float
    retriever_name: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class EvidenceRetriever(ABC):
    """Abstract base for automated evidence retrievers.

    Subclasses implement :meth:`retrieve` and must remain pure with
    respect to their inputs (no global state). The engine calls into
    retrievers from inside its reasoning loop; any I/O should be
    bounded and respect the framework's stateless-harness contract.
    """

    name: str = "abstract"

    def __init__(self, config: Optional[RetrieverConfig] = None):
        self.config = config or RetrieverConfig()
        self._call_cache: Dict[str, List[RetrievalResult]] = {}

    @abstractmethod
    def retrieve(
        self,
        query: str,
        *,
        hypothesis: Optional[Hypothesis] = None,
        problem: Optional[Problem] = None,
        top_k: Optional[int] = None,
    ) -> List[RetrievalResult]:
        """Return ranked retrieval results for ``query``."""

    def retrieve_for_hypothesis(
        self,
        hypothesis: Hypothesis,
        problem: Optional[Problem] = None,
        top_k: Optional[int] = None,
    ) -> List[RetrievalResult]:
        """Convenience: build the query from the hypothesis and dispatch."""
        query = build_query_from_hypothesis(hypothesis, problem)
        return self.retrieve(
            query, hypothesis=hypothesis, problem=problem, top_k=top_k
        )

    def reset_cache(self) -> None:
        """Clear the per-call cache. The engine calls this between solve() runs."""
        self._call_cache.clear()


class InMemoryEvidenceRetriever(EvidenceRetriever):
    """Deterministic in-memory cosine retriever.

    Provided as the framework default so adapters can demonstrate
    automated retrieval end-to-end without a network dependency. The
    corpus is a list of ``Evidence`` dataclasses; relevance is plain
    token-bag cosine — the same primitive the parity guardian uses on
    other surfaces.
    """

    name = "in_memory_cosine"

    def __init__(
        self,
        corpus: Optional[Sequence[Evidence]] = None,
        config: Optional[RetrieverConfig] = None,
    ):
        super().__init__(config=config)
        self._corpus: List[Evidence] = list(corpus or [])
        self._bags: List[Dict[str, int]] = [
            _bag_of_tokens(e.content) for e in self._corpus
        ]

    def add(self, evidence: Evidence) -> None:
        """Append one Evidence item to the in-memory corpus."""
        self._corpus.append(evidence)
        self._bags.append(_bag_of_tokens(evidence.content))

    def extend(self, items: Iterable[Evidence]) -> None:
        for item in items:
            self.add(item)

    def __len__(self) -> int:
        return len(self._corpus)

    def retrieve(
        self,
        query: str,
        *,
        hypothesis: Optional[Hypothesis] = None,
        problem: Optional[Problem] = None,
        top_k: Optional[int] = None,
    ) -> List[RetrievalResult]:
        if not query or not self._corpus:
            return []

        if self.config.cache_within_call and query in self._call_cache:
            return self._call_cache[query]

        query_bag = _bag_of_tokens(query)
        scored: List[RetrievalResult] = []

        for evidence, bag in zip(self._corpus, self._bags):
            similarity = _cosine(query_bag, bag)
            if similarity < self.config.min_similarity:
                continue

            scored.append(
                RetrievalResult(
                    evidence=Evidence(
                        content=evidence.content,
                        source=evidence.source or self.name,
                        evidence_type=evidence.evidence_type,
                        weight=evidence.weight or self.config.default_weight,
                        metadata={
                            **evidence.metadata,
                            "retriever": self.name,
                            "similarity": similarity,
                        },
                    ),
                    similarity=similarity,
                    retriever_name=self.name,
                )
            )

        scored.sort(key=lambda r: r.similarity, reverse=True)
        limit = top_k or self.config.top_k
        results = scored[:limit]

        if self.config.cache_within_call:
            self._call_cache[query] = results

        return results


class CompositeEvidenceRetriever(EvidenceRetriever):
    """Fan-out retriever that calls many backends and merges results.

    Useful when an adapter wants to combine, say, a local corpus and a
    networked knowledge-base retriever. Results are de-duplicated by
    ``Evidence.content`` and ranked by max similarity across backends.
    """

    name = "composite"

    def __init__(
        self,
        retrievers: Sequence[EvidenceRetriever],
        config: Optional[RetrieverConfig] = None,
    ):
        super().__init__(config=config)
        if not retrievers:
            raise ValueError("CompositeEvidenceRetriever needs ≥1 backend")
        self._retrievers = list(retrievers)

    def retrieve(
        self,
        query: str,
        *,
        hypothesis: Optional[Hypothesis] = None,
        problem: Optional[Problem] = None,
        top_k: Optional[int] = None,
    ) -> List[RetrievalResult]:
        merged: Dict[str, RetrievalResult] = {}
        for retriever in self._retrievers:
            for result in retriever.retrieve(
                query,
                hypothesis=hypothesis,
                problem=problem,
                top_k=top_k,
            ):
                key = result.evidence.content
                # Keep the highest-similarity hit per evidence content
                existing = merged.get(key)
                if existing is None or result.similarity > existing.similarity:
                    merged[key] = result

        ranked = sorted(merged.values(), key=lambda r: r.similarity, reverse=True)
        limit = top_k or self.config.top_k
        return ranked[:limit]

    def reset_cache(self) -> None:
        super().reset_cache()
        for retriever in self._retrievers:
            retriever.reset_cache()
