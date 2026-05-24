"""Shared MCOP triad harness used by the Python ecosystem-integration shims.

Mirrors `src/integrations/triadHarness.ts` 1:1. The encoder uses
``nova_neo_encode`` from ``mcop_package.mcop.triad`` for byte-identity
with the TypeScript runtime; the Stigmergy + Holographic Etch surfaces
are minimalist Python implementations that share the same Merkle-chain
shape (RFC 8785 canonical JSON via ``canonical_digest``) so a record
written through the Python shim is forensically equivalent to one
written through the TS shim.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..canonical_encoding import canonical_digest
from ..triad import nova_neo_encode

__all__ = [
    "MCOPEncoder",
    "MCOPEtchRecord",
    "MCOPHolographicEtch",
    "MCOPPheromoneTrace",
    "MCOPProvenance",
    "MCOPRecordResult",
    "MCOPResonanceResult",
    "MCOPStigmergy",
    "MCOPTriad",
    "MCOPTriadOptions",
    "ensure_triad",
    "recall_from_triad",
    "record_into_triad",
]


@dataclass(frozen=True)
class MCOPEncoder:
    """
    Wraps :func:`nova_neo_encode` with a fixed dimension.

    Exposes the same public surface as the TypeScript NovaNeoEncoder
    for organelle reconstruction parity:

        encoder.dimensions
        encoder.normalize
        encoder.backend
    """

    dimensions: int = 64
    normalize: bool = False
    backend: str = "hash"

    def encode(self, text: str) -> List[float]:
        return nova_neo_encode(text, self.dimensions, normalize=self.normalize)


@dataclass(frozen=True)
class MCOPPheromoneTrace:
    id: str
    hash: str
    parent_hash: Optional[str]
    context: List[float]
    synthesis_vector: List[float]
    weight: float
    metadata: Optional[Dict[str, Any]]
    timestamp: str


@dataclass(frozen=True)
class MCOPResonanceResult:
    score: float
    threshold_used: float
    trace: Optional[MCOPPheromoneTrace] = None


@dataclass
class MCOPStigmergy:
    """Minimalist Python sibling of ``StigmergyV5`` for the integration shims."""

    resonance_threshold: float = 0.55
    max_traces: int = 2048
    traces: List[MCOPPheromoneTrace] = field(default_factory=list)

    def record_trace(
        self,
        context: Sequence[float],
        synthesis_vector: Sequence[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MCOPPheromoneTrace:
        parent_hash = self.traces[-1].hash if self.traces else None
        trace_id = str(uuid.uuid4())
        weight = _cosine(context, synthesis_vector)
        payload = {
            "id": trace_id,
            "context": list(context),
            "synthesisVector": list(synthesis_vector),
            "metadata": metadata,
            "weight": weight,
        }
        merkle_payload = {"payload": payload, "parentHash": parent_hash}
        trace_hash = canonical_digest(merkle_payload)
        trace = MCOPPheromoneTrace(
            id=trace_id,
            hash=trace_hash,
            parent_hash=parent_hash,
            context=list(context),
            synthesis_vector=list(synthesis_vector),
            weight=weight,
            metadata=metadata,
            timestamp=_iso_utc_now(),
        )
        self.traces.append(trace)
        if len(self.traces) > self.max_traces:
            del self.traces[0]
        return trace

    def get_resonance(self, context: Sequence[float]) -> MCOPResonanceResult:
        ctx_mag = _magnitude(context)
        if ctx_mag == 0 or not self.traces:
            return MCOPResonanceResult(
                score=0.0, threshold_used=self.resonance_threshold
            )
        best_trace: Optional[MCOPPheromoneTrace] = None
        best_score = 0.0
        for trace in self.traces:
            score = _cosine(context, trace.context)
            if score > best_score:
                best_score = score
                best_trace = trace
        if best_trace is not None and best_score >= self.resonance_threshold:
            return MCOPResonanceResult(
                score=best_score,
                threshold_used=self.resonance_threshold,
                trace=best_trace,
            )
        return MCOPResonanceResult(
            score=0.0, threshold_used=self.resonance_threshold
        )

    def merkle_root(self) -> Optional[str]:
        if not self.traces:
            return None
        return self.traces[-1].hash


@dataclass(frozen=True)
class MCOPEtchRecord:
    hash: str
    delta_weight: float
    note: Optional[str]
    timestamp: str


@dataclass
class MCOPHolographicEtch:
    """Minimalist Python sibling of ``HolographicEtch``."""

    confidence_floor: float = 0.0
    etches: List[MCOPEtchRecord] = field(default_factory=list)

    def apply_etch(
        self,
        context: Sequence[float],
        synthesis_vector: Sequence[float],
        note: Optional[str] = None,
    ) -> MCOPEtchRecord:
        min_len = min(len(context), len(synthesis_vector))
        if min_len == 0:
            normalized_delta = 0.0
        else:
            acc = 0.0
            for i in range(min_len):
                acc += context[i] * synthesis_vector[i]
            normalized_delta = acc / min_len
        if normalized_delta < self.confidence_floor:
            return MCOPEtchRecord(
                hash="",
                delta_weight=0.0,
                note="skipped-low-confidence",
                timestamp=_iso_utc_now(),
            )
        payload = {
            "context": list(context),
            "synthesisVector": list(synthesis_vector),
            "normalizedDelta": normalized_delta,
            "note": note,
        }
        digest = canonical_digest(payload)
        record = MCOPEtchRecord(
            hash=digest,
            delta_weight=normalized_delta,
            note=note,
            timestamp=_iso_utc_now(),
        )
        self.etches.append(record)
        return record


@dataclass(frozen=True)
class MCOPProvenance:
    trace_id: str
    etch_hash: str
    merkle_root: Optional[str]
    timestamp: str
    auditable: bool


@dataclass(frozen=True)
class MCOPRecordResult:
    trace: MCOPPheromoneTrace
    etch: MCOPEtchRecord
    provenance: MCOPProvenance


@dataclass
class MCOPTriad:
    encoder: MCOPEncoder
    stigmergy: MCOPStigmergy
    etch: MCOPHolographicEtch


@dataclass(frozen=True)
class MCOPTriadOptions:
    triad: Optional[MCOPTriad] = None
    encoder_dimensions: int = 64
    resonance_threshold: float = 0.55
    max_traces: int = 2048
    etch_confidence_floor: float = 0.0


def ensure_triad(options: Optional[MCOPTriadOptions] = None) -> MCOPTriad:
    """Lazily build (or return) a deterministic MCOP triad."""
    opts = options or MCOPTriadOptions()
    if opts.triad is not None:
        return opts.triad
    return MCOPTriad(
        encoder=MCOPEncoder(dimensions=opts.encoder_dimensions),
        stigmergy=MCOPStigmergy(
            resonance_threshold=opts.resonance_threshold,
            max_traces=opts.max_traces,
        ),
        etch=MCOPHolographicEtch(confidence_floor=opts.etch_confidence_floor),
    )


def record_into_triad(
    triad: MCOPTriad,
    text: str,
    metadata: Optional[Dict[str, Any]] = None,
    note: Optional[str] = None,
) -> MCOPRecordResult:
    """Encode → record trace → etch a single (text, metadata) pair."""
    context = triad.encoder.encode(text)
    synthesis = list(context)
    trace = triad.stigmergy.record_trace(context, synthesis, metadata)
    etch = triad.etch.apply_etch(
        context, synthesis, note=note or "mcop-integration-shim"
    )
    provenance = MCOPProvenance(
        trace_id=str(uuid.uuid4()),
        etch_hash=etch.hash,
        merkle_root=triad.stigmergy.merkle_root(),
        timestamp=_iso_utc_now(),
        auditable=bool(etch.hash) and triad.stigmergy.merkle_root() is not None,
    )
    return MCOPRecordResult(trace=trace, etch=etch, provenance=provenance)


def recall_from_triad(
    triad: MCOPTriad, query: str
) -> Tuple[List[float], MCOPResonanceResult]:
    """Run a resonance query and return ``(context, resonance)``."""
    context = triad.encoder.encode(query)
    resonance = triad.stigmergy.get_resonance(context)
    return context, resonance


def _magnitude(v: Sequence[float]) -> float:
    return math.sqrt(sum(value * value for value in v))


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    ma = _magnitude(a)
    mb = _magnitude(b)
    if ma == 0 or mb == 0:
        return 0.0
    n = min(len(a), len(b))
    acc = 0.0
    for i in range(n):
        acc += a[i] * b[i]
    return acc / (ma * mb)


def _iso_utc_now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
