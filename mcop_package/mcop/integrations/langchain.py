"""MCOP ↔ LangChain integration shim (Python).

Implements the LangChain ``BaseChatMessageHistory`` shape without taking
a runtime dependency on ``langchain`` or ``langchain_core``. So a
project that already imports LangChain can drop the returned object
straight into a chain, e.g.

.. code-block:: python

    from mcop.integrations import create_mcop_langchain_memory

    memory = create_mcop_langchain_memory(session_id="agent-007")
    runnable_with_history = RunnableWithMessageHistory(
        runnable, lambda _: memory
    )

Behind the shim, every ``add_messages`` call funnels through the MCOP
triad: encode → resonate → record → etch. So a LangChain agent's
conversational history becomes Merkle-rooted, replayable, and
resonance-queryable with zero behavioural change to the agent itself.

Mirrors `src/integrations/langchain.ts` 1:1.
"""

from __future__ import annotations

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
    "BaseLangChainMessage",
    "MCOPLangChainMemory",
    "create_mcop_langchain_memory",
]

LangChainRole = Literal["human", "ai", "system", "tool", "function", "generic"]


@dataclass(frozen=True)
class BaseLangChainMessage:
    """LangChain's modern message shape (subset; framework-agnostic)."""

    type: LangChainRole
    content: str
    name: Optional[str] = None
    additional_kwargs: Optional[Dict[str, Any]] = None
    provenance: Optional[MCOPProvenance] = None


@dataclass
class MCOPLangChainMemory:
    """MCOP-backed LangChain ``BaseChatMessageHistory`` implementation."""

    session_id: str = "mcop-langchain-default"
    etch_every_message: bool = True
    triad_options: Optional[MCOPTriadOptions] = None
    _history: List[BaseLangChainMessage] = field(default_factory=list)
    _triad: Optional[MCOPTriad] = None

    def __post_init__(self) -> None:
        self._triad = ensure_triad(self.triad_options)

    @property
    def messages(self) -> List[BaseLangChainMessage]:
        """LangChain's canonical accessor for current message history."""
        return list(self._history)

    def get_messages(self) -> List[BaseLangChainMessage]:
        return list(self._history)

    def add_messages(
        self, messages: Sequence[BaseLangChainMessage]
    ) -> None:
        for message in messages:
            self._history.append(self._record_message(message))

    def add_message(self, message: BaseLangChainMessage) -> None:
        self._history.append(self._record_message(message))

    def clear(self) -> None:
        self._history.clear()

    def recall_by_resonance(self, query: str) -> Dict[str, Any]:
        triad = self._require_triad()
        _, resonance = recall_from_triad(triad, query)
        if resonance.trace is None:
            return {"score": resonance.score, "message": None}
        target_id = resonance.trace.id
        for message in self._history:
            kwargs = message.additional_kwargs or {}
            if kwargs.get("mcop_stigmergy_trace_id") == target_id:
                return {"score": resonance.score, "message": message}
        return {"score": resonance.score, "message": None}

    @property
    def triad_handle(self) -> MCOPTriad:
        return self._require_triad()

    def _record_message(
        self, message: BaseLangChainMessage
    ) -> BaseLangChainMessage:
        if not self.etch_every_message:
            return BaseLangChainMessage(
                type=message.type,
                content=message.content,
                name=message.name,
                additional_kwargs=message.additional_kwargs,
            )
        triad = self._require_triad()
        recorded = record_into_triad(
            triad,
            message.content,
            metadata={
                **(message.additional_kwargs or {}),
                "mcop_session_id": self.session_id,
                "mcop_role": message.type,
            },
            note=f"mcop-langchain:{self.session_id}:{message.type}",
        )
        return BaseLangChainMessage(
            type=message.type,
            content=message.content,
            name=message.name,
            additional_kwargs={
                **(message.additional_kwargs or {}),
                "mcop_stigmergy_trace_id": recorded.trace.id,
                "mcop_etch_hash": recorded.etch.hash,
            },
            provenance=recorded.provenance,
        )

    def _require_triad(self) -> MCOPTriad:
        if self._triad is None:
            self._triad = ensure_triad(self.triad_options)
        return self._triad


def create_mcop_langchain_memory(
    session_id: str = "mcop-langchain-default",
    etch_every_message: bool = True,
    triad_options: Optional[MCOPTriadOptions] = None,
) -> MCOPLangChainMemory:
    """Factory matching the rest of the integrations namespace."""
    return MCOPLangChainMemory(
        session_id=session_id,
        etch_every_message=etch_every_message,
        triad_options=triad_options,
    )
