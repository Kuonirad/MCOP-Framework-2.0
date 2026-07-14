"""Shared triad harness for the optional ecosystem integration shims.

The historical ``MCOP*`` imports, constructor seeds, and normal method calls
remain compatible, but they now wrap the canonical flagship implementations in
:mod:`mcop.triad`.  This removes a second, drifting Stigmergy/Etch
implementation while retaining the integration defaults used by LangChain,
LlamaIndex, and Haystack adapters.  The bounded ``traces`` and ``etches``
properties return snapshots; mutating those returned lists does not mutate the
internal rings.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..triad import (
    EtchRecord,
    HolographicEtch,
    NovaNeoEncoder,
    PheromoneTrace,
    ResonanceResult,
    StigmergyV5,
)

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


class MCOPEncoder(NovaNeoEncoder):
    """Compatibility wrapper with the integration default of 64 dimensions."""

    def __init__(
        self, dimensions: int = 64, normalize: bool = False, backend: str = "hash"
    ) -> None:
        super().__init__(dimensions=dimensions, normalize=normalize, backend=backend)


class MCOPStigmergy(StigmergyV5):
    """Compatibility wrapper retaining the integration threshold of 0.55."""

    def __init__(
        self,
        resonance_threshold: float = 0.55,
        max_traces: int = 2048,
        traces: Optional[Sequence[PheromoneTrace]] = None,
        **kwargs: Any,
    ) -> None:
        # The historical integration memory used a fixed threshold. Preserve
        # that behavior unless a caller explicitly opts into adaptation.
        adaptive_threshold = kwargs.pop("adaptive_threshold", False)
        super().__init__(
            resonance_threshold=resonance_threshold,
            max_traces=max_traces,
            adaptive_threshold=adaptive_threshold,
            **kwargs,
        )
        # Legacy dataclass construction accepted a seed list. Seed through the
        # canonical ring so capacity and parent-root invariants remain intact.
        for trace in traces or ():
            self._traces.push(trace)


class MCOPHolographicEtch(HolographicEtch):
    """Compatibility wrapper that etches every integration event by default."""

    def __init__(
        self,
        confidence_floor: float = 0.0,
        etches: Optional[Sequence[EtchRecord]] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(confidence_floor=confidence_floor, **kwargs)
        for record in etches or ():
            self._etches.push(record)
            if self.audit_log:
                self._audit.push(record)


# Type aliases preserve all historical import paths while records are now
# produced by the one canonical implementation.
MCOPPheromoneTrace = PheromoneTrace
MCOPResonanceResult = ResonanceResult
MCOPEtchRecord = EtchRecord


@dataclass(frozen=True)
class MCOPProvenance:
    trace_id: str
    etch_hash: str
    merkle_root: Optional[str]
    timestamp: str
    auditable: bool


@dataclass(frozen=True)
class MCOPRecordResult:
    trace: PheromoneTrace
    etch: EtchRecord
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
    """Build a deterministic triad, or return the supplied bundle verbatim."""
    selected = options or MCOPTriadOptions()
    if selected.triad is not None:
        return selected.triad
    return MCOPTriad(
        encoder=MCOPEncoder(dimensions=selected.encoder_dimensions),
        stigmergy=MCOPStigmergy(
            resonance_threshold=selected.resonance_threshold,
            max_traces=selected.max_traces,
        ),
        etch=MCOPHolographicEtch(
            confidence_floor=selected.etch_confidence_floor
        ),
    )


def record_into_triad(
    triad: MCOPTriad,
    text: str,
    metadata: Optional[Dict[str, Any]] = None,
    note: Optional[str] = None,
) -> MCOPRecordResult:
    """Encode, record, and etch one ecosystem event."""
    context = triad.encoder.encode(text)
    synthesis = list(context)
    trace = triad.stigmergy.record_trace(context, synthesis, metadata)
    etch = triad.etch.apply_etch(
        context,
        synthesis,
        note="mcop-integration-shim" if note is None else note,
    )
    root = triad.stigmergy.get_merkle_root()
    provenance = MCOPProvenance(
        trace_id=trace.id,
        etch_hash=etch.hash,
        merkle_root=root,
        timestamp=_iso_utc_now(),
        auditable=bool(etch.hash) and root is not None,
    )
    return MCOPRecordResult(trace=trace, etch=etch, provenance=provenance)


def recall_from_triad(
    triad: MCOPTriad, query: str
) -> Tuple[List[float], ResonanceResult]:
    """Encode a query and return ``(context, resonance)``."""
    context = triad.encoder.encode(query)
    return context, triad.stigmergy.get_resonance(context)


def _iso_utc_now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
