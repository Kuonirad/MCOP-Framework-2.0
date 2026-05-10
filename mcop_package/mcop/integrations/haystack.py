"""MCOP ↔ Haystack integration shim (Python).

Implements the Haystack 2.x ``DocumentStore`` protocol shape without
taking a runtime dependency on ``haystack-ai``.

Mirrors `src/integrations/haystack.ts` 1:1.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Sequence

from .triad_harness import (
    MCOPProvenance,
    MCOPTriad,
    MCOPTriadOptions,
    ensure_triad,
    recall_from_triad,
    record_into_triad,
)

__all__ = [
    "MCOPHaystackDocument",
    "MCOPHaystackDocumentStore",
    "create_mcop_haystack_document_store",
    "mcop_haystack_document_from_content",
]

MCOPHaystackDuplicatePolicy = Literal["overwrite", "skip", "fail"]


@dataclass(frozen=True)
class MCOPHaystackDocument:
    id: str
    content: str
    meta: Optional[Dict[str, Any]] = None
    score: Optional[float] = None
    embedding: Optional[Sequence[float]] = None
    provenance: Optional[MCOPProvenance] = None


@dataclass
class MCOPHaystackDocumentStore:
    """MCOP-backed Haystack 2.x ``DocumentStore`` implementation."""

    default_policy: MCOPHaystackDuplicatePolicy = "overwrite"
    triad_options: Optional[MCOPTriadOptions] = None
    _documents: Dict[str, MCOPHaystackDocument] = field(default_factory=dict)
    _docs_by_trace_id: Dict[str, str] = field(default_factory=dict)
    _triad: Optional[MCOPTriad] = None

    def __post_init__(self) -> None:
        self._triad = ensure_triad(self.triad_options)

    def count_documents(self) -> int:
        return len(self._documents)

    def write_documents(
        self,
        documents: Sequence[MCOPHaystackDocument],
        policy: Optional[MCOPHaystackDuplicatePolicy] = None,
    ) -> int:
        effective = policy or self.default_policy
        triad = self._require_triad()
        written = 0
        for doc in documents:
            existing = self._documents.get(doc.id)
            if existing is not None:
                if effective == "fail":
                    raise ValueError(f"Duplicate document id: {doc.id}")
                if effective == "skip":
                    continue
            recorded = record_into_triad(
                triad,
                doc.content,
                metadata={
                    **(doc.meta or {}),
                    "mcop_haystack_document_id": doc.id,
                },
                note=f"mcop-haystack:{doc.id}",
            )
            stored = MCOPHaystackDocument(
                id=doc.id,
                content=doc.content,
                meta={
                    **(doc.meta or {}),
                    "mcop_stigmergy_trace_id": recorded.trace.id,
                    "mcop_etch_hash": recorded.etch.hash,
                },
                score=doc.score,
                embedding=doc.embedding or recorded.trace.context,
                provenance=recorded.provenance,
            )
            self._documents[stored.id] = stored
            self._docs_by_trace_id[recorded.trace.id] = stored.id
            written += 1
        return written

    def filter_documents(
        self, filters: Optional[Dict[str, Any]] = None
    ) -> List[MCOPHaystackDocument]:
        all_docs = list(self._documents.values())
        if not filters:
            return all_docs
        return [
            doc
            for doc in all_docs
            if all((doc.meta or {}).get(k) == v for k, v in filters.items())
        ]

    def delete_documents(self, document_ids: Sequence[str]) -> None:
        for doc_id in document_ids:
            self._documents.pop(doc_id, None)
            for trace_id, mapped_id in list(self._docs_by_trace_id.items()):
                if mapped_id == doc_id:
                    del self._docs_by_trace_id[trace_id]

    def recall_by_resonance(self, query: str) -> Dict[str, Any]:
        triad = self._require_triad()
        _, resonance = recall_from_triad(triad, query)
        if resonance.trace is None:
            return {"score": resonance.score, "document": None}
        doc_id = self._docs_by_trace_id.get(resonance.trace.id)
        document = self._documents.get(doc_id) if doc_id is not None else None
        return {"score": resonance.score, "document": document}

    @property
    def triad_handle(self) -> MCOPTriad:
        return self._require_triad()

    def _require_triad(self) -> MCOPTriad:
        if self._triad is None:
            self._triad = ensure_triad(self.triad_options)
        return self._triad


def create_mcop_haystack_document_store(
    default_policy: MCOPHaystackDuplicatePolicy = "overwrite",
    triad_options: Optional[MCOPTriadOptions] = None,
) -> MCOPHaystackDocumentStore:
    return MCOPHaystackDocumentStore(
        default_policy=default_policy, triad_options=triad_options
    )


def mcop_haystack_document_from_content(
    content: str, meta: Optional[Dict[str, Any]] = None
) -> MCOPHaystackDocument:
    return MCOPHaystackDocument(id=str(uuid.uuid4()), content=content, meta=meta)
