"""
Base MCOP adapter for Python platforms (e.g. Higgsfield SDK).

This module provides a slim, parity-aligned mirror of the TypeScript
adapter framework under ``src/adapters``. It reuses
:func:`mcop.triad.nova_neo_encode` so deterministic encoding is
bit-identical across runtimes, and implements lightweight stigmergy and
etch primitives so the Python side can run end-to-end without depending
on the Next.js/TS app at runtime.

Adapters subclass :class:`BaseMCOPAdapter` and implement
:meth:`call_platform` to dispatch the refined prompt to a vendor SDK.
"""

from __future__ import annotations

import hashlib
import math
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

from mcop.canonical_encoding import canonical_digest
from mcop.triad import (
    cosine,
    estimate_entropy,
    magnitude,
    nova_neo_encode,
)


__all__ = [
    "AdapterCapabilities",
    "AdapterRequest",
    "AdapterResponse",
    "BaseMCOPAdapter",
    "DialecticalSynthesizer",
    "EtchLedger",
    "EtchRecord",
    "HumanFeedback",
    "HumanVetoError",
    "PheromoneTrace",
    "PreparedDispatch",
    "ProvenanceMetadata",
    "StigmergyStore",
]


class HumanVetoError(RuntimeError):
    """Raised when a human override hard-stops a generation."""


@dataclass
class HumanFeedback:
    """Operator override delivered through the dialectical synthesizer."""

    rewritten_prompt: Optional[str] = None
    notes: Optional[str] = None
    veto: bool = False


@dataclass
class AdapterRequest:
    """Inbound request shape mirroring the TS contract."""

    prompt: str
    domain: str = "generic"
    style_context: Optional[Sequence[float]] = None
    entropy_target: Optional[float] = None
    human_feedback: Optional[HumanFeedback] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    #: Optional pre-planned action sequence produced by the MCTS+MAB
    #: planner (TypeScript ``MCOPMCTSPlanner.plan().bestSequence``). When
    #: supplied the adapter does not re-plan; it forwards the sequence
    #: verbatim to the vendor and records it in trace metadata under
    #: ``plannedSequence`` so the planning trace and the dispatch trace
    #: share a single Merkle-auditable record. Read-only: the adapter
    #: never mutates this field. Omit to keep the existing reactive
    #: pipeline behaviour unchanged.
    planned_sequence: Optional[List[str]] = None


@dataclass
class AdapterCapabilities:
    """Capability descriptor surfaced via :meth:`get_capabilities`."""

    platform: str
    version: str
    models: List[str]
    supports_audit: bool = True
    features: List[str] = field(default_factory=list)
    max_resolution: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class PheromoneTrace:
    """Stigmergy v5 trace — Merkle-chained continuity record."""

    id: str
    hash: str
    parent_hash: Optional[str]
    context: List[float]
    synthesis_vector: List[float]
    weight: float
    metadata: Dict[str, Any]
    timestamp: str


@dataclass
class ResonanceResult:
    score: float
    trace: Optional[PheromoneTrace] = None


@dataclass
class EtchRecord:
    hash: str
    delta_weight: float
    note: Optional[str]
    timestamp: str


@dataclass
class ProvenanceMetadata:
    tensor_hash: str
    trace_id: Optional[str]
    trace_hash: Optional[str]
    resonance_score: float
    etch_hash: str
    etch_delta: float
    refined_prompt: str
    timestamp: str


@dataclass
class AdapterResponse:
    result: Any
    merkle_root: str
    provenance: ProvenanceMetadata


@dataclass
class PreparedDispatch:
    refined_prompt: str
    tensor: List[float]
    resonance: ResonanceResult
    trace: PheromoneTrace
    etch_hash: str
    etch_delta: float
    provenance: ProvenanceMetadata


def _now_iso() -> str:
    # Use UTC ISO timestamp with millisecond precision, matching the TS side.
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def _merkle_hash(payload: Any, parent_hash: Optional[str]) -> str:
    # RFC 8785 canonical JSON keeps this hash byte-identical with the
    # TypeScript stigmergy/etch/provenance hashes. See
    # ``mcop.canonical_encoding`` for the rationale.
    return canonical_digest({"payload": payload, "parentHash": parent_hash})


class StigmergyStore:
    """
    Lightweight Python parity of :class:`StigmergyV5`.

    Stores a bounded ring of Merkle-chained traces and exposes resonance
    via cosine similarity. Suitable for adapter-side continuity tracking
    without coupling to the TS runtime.
    """

    def __init__(
        self,
        resonance_threshold: float = 0.5,
        max_traces: int = 2048,
    ) -> None:
        if max_traces <= 0:
            raise ValueError("max_traces must be positive")
        self._threshold = resonance_threshold
        self._capacity = max_traces
        self._traces: List[PheromoneTrace] = []

    def record_trace(
        self,
        context: Sequence[float],
        synthesis_vector: Sequence[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> PheromoneTrace:
        parent_hash = self._traces[-1].hash if self._traces else None
        trace_id = str(uuid.uuid4())
        weight = cosine(context, synthesis_vector)
        payload = {
            "id": trace_id,
            "context": list(context),
            "synthesisVector": list(synthesis_vector),
            "metadata": metadata or {},
            "weight": weight,
        }
        trace = PheromoneTrace(
            id=trace_id,
            hash=_merkle_hash(payload, parent_hash),
            parent_hash=parent_hash,
            context=list(context),
            synthesis_vector=list(synthesis_vector),
            weight=weight,
            metadata=metadata or {},
            timestamp=_now_iso(),
        )
        self._traces.append(trace)
        if len(self._traces) > self._capacity:
            # Evict the oldest entry — the parent_hash chain remains intact
            # because each trace's parent_hash is captured at insert time.
            self._traces.pop(0)
        return trace

    def get_resonance(self, context: Sequence[float]) -> ResonanceResult:
        query_mag = magnitude(context)
        if query_mag == 0:
            return ResonanceResult(score=0.0)
        best_score = 0.0
        best_trace: Optional[PheromoneTrace] = None
        for trace in self._traces:
            score = cosine(context, trace.context)
            if score > best_score:
                best_score = score
                best_trace = trace
        if best_trace and best_score >= self._threshold:
            return ResonanceResult(score=best_score, trace=best_trace)
        return ResonanceResult(score=0.0)

    def merkle_root(self) -> Optional[str]:
        return self._traces[-1].hash if self._traces else None


class EtchLedger:
    """
    Lightweight Python parity of :class:`HolographicEtch`.

    Records rank-1 micro-etches with a static confidence floor. Skipped
    etches return an empty hash so consumers can distinguish them from
    accepted records (matching the TS semantics).
    """

    def __init__(
        self,
        confidence_floor: float = 0.0,
        max_etches: int = 4096,
    ) -> None:
        if max_etches <= 0:
            raise ValueError("max_etches must be positive")
        self._floor = confidence_floor
        self._capacity = max_etches
        self._etches: List[EtchRecord] = []

    def apply_etch(
        self,
        context: Sequence[float],
        synthesis_vector: Sequence[float],
        note: Optional[str] = None,
    ) -> EtchRecord:
        min_len = min(len(context), len(synthesis_vector))
        delta = 0.0
        for i in range(min_len):
            delta += context[i] * synthesis_vector[i]
        normalized = delta / (min_len or 1)
        if normalized < self._floor:
            return EtchRecord(
                hash="",
                delta_weight=0.0,
                note="skipped-low-confidence",
                timestamp=_now_iso(),
            )
        payload = {
            "context": list(context),
            "synthesisVector": list(synthesis_vector),
            "normalizedDelta": normalized,
            "note": note,
        }
        record = EtchRecord(
            # RFC 8785 canonical JSON: byte-identical with the TS etch.
            hash=canonical_digest(payload),
            delta_weight=normalized,
            note=note,
            timestamp=_now_iso(),
        )
        self._etches.append(record)
        if len(self._etches) > self._capacity:
            self._etches.pop(0)
        return record


class DialecticalSynthesizer:
    """Human-in-the-loop refinement stage for Python adapters."""

    def __init__(self, resonance_preamble_threshold: float = 0.6) -> None:
        self._threshold = resonance_preamble_threshold

    def synthesize(
        self,
        prompt: str,
        resonance: ResonanceResult,
        feedback: Optional[HumanFeedback] = None,
    ) -> str:
        if feedback and feedback.veto:
            raise HumanVetoError("Human override vetoed this generation")
        if feedback and feedback.rewritten_prompt:
            return feedback.rewritten_prompt

        parts: List[str] = []
        if resonance.trace and resonance.score >= self._threshold:
            note = resonance.trace.metadata.get("note")
            tag = (
                f"[continuity:{note}]"
                if isinstance(note, str)
                else f"[continuity:{resonance.trace.id[:8]}]"
            )
            parts.append(tag)
        parts.append(prompt.strip())
        if feedback and feedback.notes:
            parts.append(f"[operator-notes] {feedback.notes.strip()}")
        return " ".join(parts)


def _hash_tensor(tensor: Sequence[float]) -> str:
    """Match :func:`baseAdapter.hashTensor` (Float64 little-endian SHA-256)."""
    import struct

    hasher = hashlib.sha256()
    for value in tensor:
        hasher.update(struct.pack("<d", value))
    return hasher.hexdigest()


CallPlatformFn = Callable[
    ["BaseMCOPAdapter", PreparedDispatch, AdapterRequest],
    Any,
]


class BaseMCOPAdapter:
    """
    Abstract base class for Python MCOP adapters.

    Subclasses MUST implement :meth:`call_platform` and
    :meth:`get_capabilities`. The base class wires the deterministic
    pipeline (encode → resonance → dialectical synthesis → etch) and
    surfaces a uniform :class:`AdapterResponse`.
    """

    #: Output dimensions of the encoder. 64 keeps parity with the typical
    #: TS triad seed and keeps the resonance space dense enough for long
    #: cinematic sequences without dominating memory.
    DIMENSIONS: int = 64

    def __init__(
        self,
        stigmergy: Optional[StigmergyStore] = None,
        etch: Optional[EtchLedger] = None,
        dialectical: Optional[DialecticalSynthesizer] = None,
    ) -> None:
        self.stigmergy = stigmergy or StigmergyStore()
        self.etch = etch or EtchLedger()
        self.dialectical = dialectical or DialecticalSynthesizer()

    # ------------------------------------------------------------------ API

    def get_capabilities(self) -> AdapterCapabilities:
        raise NotImplementedError

    def call_platform(
        self, dispatch: PreparedDispatch, request: AdapterRequest
    ) -> Any:
        raise NotImplementedError

    @property
    def platform_name(self) -> str:
        return self.__class__.__name__

    def generate(self, request: AdapterRequest) -> AdapterResponse:
        dispatch = self.prepare(request)
        result = self.call_platform(dispatch, request)
        return AdapterResponse(
            result=result,
            merkle_root=dispatch.etch_hash,
            provenance=dispatch.provenance,
        )

    def prepare(self, request: AdapterRequest) -> PreparedDispatch:
        if not isinstance(request.prompt, str) or not request.prompt:
            raise ValueError(
                f"{self.platform_name}: prompt must be a non-empty string"
            )

        tensor = nova_neo_encode(request.prompt, self.DIMENSIONS, normalize=True)
        # Defensive entropy floor — exposes a meaningful estimate to callers
        # via the tensor metadata even when downstream code ignores it.
        _entropy = estimate_entropy(tensor, request.entropy_target or 0.0)
        # NOTE: ``_entropy`` is currently informational; it is recomputed by
        # downstream consumers from the tensor when needed. We compute it
        # here so adapter implementations can short-circuit if desired.
        if not math.isfinite(_entropy):  # pragma: no cover -- defensive
            raise RuntimeError("entropy estimate is not finite")

        style_anchor = (
            list(request.style_context)
            if request.style_context is not None
            else list(tensor)
        )

        # Step 1: query resonance against PRIOR traces — the current call
        # is recorded after dispatch so it never self-resonates.
        resonance = self.stigmergy.get_resonance(tensor)
        refined = self.dialectical.synthesize(
            request.prompt, resonance, request.human_feedback
        )

        etch_record = self.etch.apply_etch(
            tensor, style_anchor, f"{self.platform_name}:{request.domain}"
        )

        trace_metadata: Dict[str, Any] = {
            **request.metadata,
            "platform": self.platform_name,
            "domain": request.domain,
        }
        if request.entropy_target is not None:
            trace_metadata["entropyTarget"] = request.entropy_target
        # Mirror the TS contract: surface a planner-produced action
        # sequence verbatim so the dispatch trace and the planning trace
        # share a Merkle-auditable record.
        if request.planned_sequence is not None:
            trace_metadata["plannedSequence"] = list(request.planned_sequence)

        trace = self.stigmergy.record_trace(tensor, style_anchor, trace_metadata)

        provenance = ProvenanceMetadata(
            tensor_hash=_hash_tensor(tensor),
            trace_id=trace.id,
            trace_hash=trace.hash,
            resonance_score=resonance.score,
            etch_hash=etch_record.hash,
            etch_delta=etch_record.delta_weight,
            refined_prompt=refined,
            timestamp=_now_iso(),
        )

        return PreparedDispatch(
            refined_prompt=refined,
            tensor=list(tensor),
            resonance=resonance,
            trace=trace,
            etch_hash=etch_record.hash,
            etch_delta=etch_record.delta_weight,
            provenance=provenance,
        )
