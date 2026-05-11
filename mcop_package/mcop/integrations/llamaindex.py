# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
# Carve-out from repo-wide BUSL-1.1; see LICENSE-MIT-INTEGRATIONS for full terms.
"""MCOP ↔ LlamaIndex integration shim (Python).

Implements the LlamaIndex ``BasePydanticVectorStore`` / ``VectorStore``
shape without taking a runtime dependency on ``llama_index``.

Mirrors `src/integrations/llamaIndex.ts` 1:1.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from .triad_harness import (
    MCOPProvenance,
    MCOPTriad,
    MCOPTriadOptions,
    ensure_triad,
    recall_from_triad,
    record_into_triad,
)

__all__ = [
    "MCOPLlamaIndexNode",
    "MCOPLlamaIndexQuery",
    "MCOPLlamaIndexQueryResult",
    "MCOPLlamaIndexVectorStore",
    "create_mcop_llamaindex_vector_store",
    "mcop_llamaindex_node_from_text",
]


@dataclass(frozen=True)
class MCOPLlamaIndexNode:
    """LlamaIndex ``BaseNode`` subset."""

    id_: str
    text: str
    metadata: Optional[Dict[str, Any]] = None
    embedding: Optional[Sequence[float]] = None
    provenance: Optional[MCOPProvenance] = None


@dataclass(frozen=True)
class MCOPLlamaIndexQuery:
    query_str: Optional[str] = None
    query_embedding: Optional[Sequence[float]] = None
    similarity_top_k: int = 5


@dataclass(frozen=True)
class MCOPLlamaIndexQueryResult:
    nodes: List[MCOPLlamaIndexNode]
    similarities: List[float]
    ids: List[str]


@dataclass
class MCOPLlamaIndexVectorStore:
    """MCOP-backed LlamaIndex ``BaseVectorStore`` implementation."""

    default_top_k: int = 5
    triad_options: Optional[MCOPTriadOptions] = None
    stores_text: bool = True
    is_embedding_query: bool = True
    _nodes: Dict[str, MCOPLlamaIndexNode] = field(default_factory=dict)
    _nodes_by_trace_id: Dict[str, str] = field(default_factory=dict)
    _triad: Optional[MCOPTriad] = None

    def __post_init__(self) -> None:
        self._triad = ensure_triad(self.triad_options)

    def add(self, nodes: Sequence[MCOPLlamaIndexNode]) -> List[str]:
        ids: List[str] = []
        triad = self._require_triad()
        for node in nodes:
            recorded = record_into_triad(
                triad,
                node.text,
                metadata={
                    **(node.metadata or {}),
                    "mcop_llamaindex_node_id": node.id_,
                },
                note=f"mcop-llamaindex:{node.id_}",
            )
            stored = MCOPLlamaIndexNode(
                id_=node.id_,
                text=node.text,
                metadata={
                    **(node.metadata or {}),
                    "mcop_stigmergy_trace_id": recorded.trace.id,
                    "mcop_etch_hash": recorded.etch.hash,
                },
                embedding=node.embedding or recorded.trace.context,
                provenance=recorded.provenance,
            )
            self._nodes[stored.id_] = stored
            self._nodes_by_trace_id[recorded.trace.id] = stored.id_
            ids.append(stored.id_)
        return ids

    def delete(self, ref_doc_id: str) -> None:
        if ref_doc_id not in self._nodes:
            return
        del self._nodes[ref_doc_id]
        for trace_id, node_id in list(self._nodes_by_trace_id.items()):
            if node_id == ref_doc_id:
                del self._nodes_by_trace_id[trace_id]

    def query(self, query: MCOPLlamaIndexQuery) -> MCOPLlamaIndexQueryResult:
        if not query.query_str:
            return MCOPLlamaIndexQueryResult(nodes=[], similarities=[], ids=[])
        triad = self._require_triad()
        _, resonance = recall_from_triad(triad, query.query_str)
        if resonance.trace is None:
            return MCOPLlamaIndexQueryResult(nodes=[], similarities=[], ids=[])
        node_id = self._nodes_by_trace_id.get(resonance.trace.id)
        if node_id is None or node_id not in self._nodes:
            return MCOPLlamaIndexQueryResult(nodes=[], similarities=[], ids=[])
        node = self._nodes[node_id]
        top_k = max(1, query.similarity_top_k or self.default_top_k)
        nodes = [node][:top_k]
        return MCOPLlamaIndexQueryResult(
            nodes=nodes,
            similarities=[resonance.score][:top_k],
            ids=[node.id_][:top_k],
        )

    def persist(self) -> None:
        """No-op for the in-memory shim — host triad owns persistence."""

    def size(self) -> int:
        return len(self._nodes)

    @property
    def triad_handle(self) -> MCOPTriad:
        return self._require_triad()

    def _require_triad(self) -> MCOPTriad:
        if self._triad is None:
            self._triad = ensure_triad(self.triad_options)
        return self._triad


def create_mcop_llamaindex_vector_store(
    default_top_k: int = 5,
    triad_options: Optional[MCOPTriadOptions] = None,
) -> MCOPLlamaIndexVectorStore:
    return MCOPLlamaIndexVectorStore(
        default_top_k=default_top_k, triad_options=triad_options
    )


def mcop_llamaindex_node_from_text(
    text: str, metadata: Optional[Dict[str, Any]] = None
) -> MCOPLlamaIndexNode:
    return MCOPLlamaIndexNode(id_=str(uuid.uuid4()), text=text, metadata=metadata)
