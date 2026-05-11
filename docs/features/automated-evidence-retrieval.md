# Automated Evidence Retrieval & Guardian Meta-Reasoner

**Status:** Shipped in MCOP v3.3.0 (Python) / v2.3.x core (TypeScript). Default
on for new engines; existing engines opt in by attaching a retriever or
constructing a `GuardianMetaReasoner`.

## Why

Manual evidence curation was the single largest source of overhead in the
v3.2 grounding loop. Maintainers had to hand-attach `Evidence` items to every
hypothesis before the `GroundingCalculator` could produce a meaningful
`grounding_index`. At the same time, the Guardian v0.1 calibration surface
hinted at a latent self-reflective capability — it knew the framework's
operative grounding threshold but only audited it post-hoc, never live.

v3.3 closes both gaps:

1. An `EvidenceRetriever` interface that the engine calls from inside its
   reasoning loop, so populating `Hypothesis.evidence` is automated by
   default while remaining override-able by humans.
2. A `GuardianMetaReasoner` that checks the framework's own grounding
   index in real time against a **configurable threshold (minimum 0.70 in
   strict mode)** and routes below-floor artefacts to a human reviewer.

## Human primacy contract

Both surfaces preserve the framework's human-primacy invariant:

- Retrievers expose `allows_human_override` / `allowsHumanOverride`. Retrieved
  evidence is appended; it never overwrites Evidence already attached by a
  human reviewer.
- The Guardian's verdicts are **additive**. They land on
  `Hypothesis.metadata['guardian']`, `ReasoningChain.metadata['guardian']`,
  and `Solution.metadata['guardian']`. The engine never silently drops a
  contested artefact; downstream UIs render the verdict so reviewers see
  it prominently.
- Sub-floor solutions surface as an explicit
  `key_uncertainties` badge (`Guardian contested (grounding 0.55 vs.
  threshold 0.70)`) so the deficit is impossible to miss.

## Python usage

```python
from mcop import (
    MCOPEngine, MCOPConfig, Problem, Evidence,
    InMemoryEvidenceRetriever, RetrieverConfig,
    GuardianMetaReasoner, GuardianConfig,
)

retriever = InMemoryEvidenceRetriever(
    corpus=[
        Evidence(
            content="Anthropogenic CO2 emissions are the dominant driver of climate change.",
            source="IPCC AR6",
            evidence_type="peer_reviewed",
            weight=0.95,
        ),
    ],
    config=RetrieverConfig(top_k=5, min_similarity=0.10),
)

guardian = GuardianMetaReasoner(
    GuardianConfig(min_grounding=0.75)  # any value ≥ 0.70 in strict mode
)

engine = MCOPEngine(
    MCOPConfig(grounding_threshold=0.75),
    evidence_retriever=retriever,
    guardian=guardian,
)

solution = engine.solve(Problem(description="What drives recent climate change?"))
print(solution.metadata["guardian"]["last_verdict"])
```

### Subclassing `EvidenceRetriever`

Plug a production retriever (BM25, FAISS, OpenSearch, …) by subclassing
`EvidenceRetriever` and implementing `retrieve()`. The engine talks to
the abstract surface only:

```python
class OpenSearchEvidenceRetriever(EvidenceRetriever):
    name = "opensearch"

    def retrieve(self, query, *, hypothesis=None, problem=None, top_k=None):
        hits = self._client.search(index="evidence", body={"query": {"match": {"content": query}}})
        return [
            RetrievalResult(
                evidence=Evidence(content=h["_source"]["content"], ...),
                similarity=h["_score"] / max_score,
                retriever_name=self.name,
            )
            for h in hits["hits"]["hits"][: top_k or self.config.top_k]
        ]
```

## TypeScript usage

```ts
import {
  CouncilScorer,
  InMemoryEvidenceRetriever,
  GuardianMetaReasoner,
} from '@kullailabs/mcop-core';

const retriever = new InMemoryEvidenceRetriever(
  [{ content: '…peer-reviewed claim…', evidenceType: 'peer_reviewed', weight: 0.9 }],
  { topK: 5, minSimilarity: 0.1 },
);
const guardian = new GuardianMetaReasoner({ minGrounding: 0.75 });

const score = CouncilScorer.score(councilOutput, { retriever, guardian });
if (score.guardian?.status === 'requires_human_review') {
  promptHumanReviewer(score.guardian);
}
```

## Configurable thresholds (minimum 0.70)

`GuardianConfig.min_grounding` is the operative threshold. In strict mode
(the default) constructing a `GuardianConfig` below `MIN_GROUNDING_FLOOR =
0.70` raises `ValueError`. Production deployments may dial **up** to 1.0;
dialing **down** requires the explicit opt-out:

```python
GuardianConfig(min_grounding=0.40, human_review_floor=0.20, strict_mode=False)
```

The TypeScript surface mirrors this contract via `strictMode: false`.

## Engine integration points

| Phase | Hook | Behaviour |
|-------|------|-----------|
| `_gather_evidence` | `evidence_retriever.retrieve_for_hypothesis(...)` | Retrieved Evidence is appended to the hypothesis. Synthetic baseline is the fallback when no retriever is attached or it returns nothing. |
| `_validate_chains` | `guardian.check_chain(chain)` | Verdict is written to `chain.metadata['guardian']`. |
| `solve()` (post-synthesis) | `guardian.check_solution(solution)` | Verdict is written to `solution.metadata['guardian']`; below-threshold solutions surface a Guardian badge in `key_uncertainties`. |
| After every `solve()` | `evidence_retriever.reset_cache()` | Per-call cache cleared so the engine stays reusable. |

## Backwards compatibility

- Engines constructed without an `evidence_retriever` keep the v3.2
  synthetic-baseline behaviour byte-for-byte.
- `enable_guardian=False` skips the Guardian sweep entirely.
- The default `grounding_threshold` rose from `0.40` to `0.70`. Callers
  that need the old behaviour can either set `grounding_threshold=0.40`
  explicitly (the engine respects whatever value they pass) and
  `enable_guardian=False`, or set `strict_mode=False` on a custom
  `GuardianConfig`.
