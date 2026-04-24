"""
Universal MCOP Adapter Integration Protocol (v2.1) — Python adapters.

This subpackage hosts MCOP adapters whose primary surface is Python (e.g.
the Higgsfield SDK). Adapters reuse the cross-language parity triad
defined in :mod:`mcop.triad` to guarantee bit-identical encoding semantics
with the TypeScript adapters under ``src/adapters``.
"""

from .base_adapter import (
    AdapterCapabilities,
    AdapterRequest,
    AdapterResponse,
    BaseMCOPAdapter,
    DialecticalSynthesizer,
    HumanFeedback,
    HumanVetoError,
    PreparedDispatch,
    PheromoneTrace,
    StigmergyStore,
    EtchLedger,
)
from .higgsfield_adapter import (
    HiggsfieldClient,
    HiggsfieldMCOPAdapter,
    HiggsfieldRequest,
    HiggsfieldResult,
    ModelChoice,
)

__all__ = [
    "AdapterCapabilities",
    "AdapterRequest",
    "AdapterResponse",
    "BaseMCOPAdapter",
    "DialecticalSynthesizer",
    "EtchLedger",
    "HiggsfieldClient",
    "HiggsfieldMCOPAdapter",
    "HiggsfieldRequest",
    "HiggsfieldResult",
    "HumanFeedback",
    "HumanVetoError",
    "ModelChoice",
    "PheromoneTrace",
    "PreparedDispatch",
    "StigmergyStore",
]
