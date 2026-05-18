"""mcop_cuda_server — HTTP microservice for the MCOP CUDA bridge.

This package implements **Phase 3** of the CUDA productionization plan.
It exposes the six op-sharded CUDA kernels (``encode``, ``graphAggregate``,
``holographicUpdate``, ``cosineRecall``, ``evolveScore``, ``homeostasis``)
over a stateless HTTP surface so that the TypeScript
:class:`CUDAProvider` can dispatch work to a real GPU host while the
in-process :class:`CUDAHardwareLayer` co-exists side-by-side on the same
node.

Three design invariants are non-negotiable:

1. **Verified-device gate.** Every accelerated response carries the
   ``verifiedDevice`` field. Any silent CPU fallback raises a
   ``GhostGPUError`` and produces an HTTP 502, never a "success" with a
   missing provenance tag. This mirrors
   ``src/hardware/CUDAHardwareLayer.ts::parseExecutionProvider``.

2. **Heritable silicon DNA.** Each response sets
   ``substrateLineage`` to ``"<verifiedProvider>/<streamMode>"`` and
   ``resolvedFrom`` to one of ``explicit-on | explicit-off |
   auto-capable | auto-not-capable | default-off`` so the cluster's
   Merkle replay can condition revival on the exact hardware lineage.

3. **Cross-runtime parity.** Provenance JSON is RFC 8785–canonicalised
   so its Merkle hash is byte-identical to what the TypeScript core
   produces via ``canonicalDigest`` — verified by
   ``test_cuda_server_provenance_parity.py``.

The runtime backend is **deliberately pluggable**: when CuPy /
onnxruntime-gpu / Torch is installed and a real GPU is present the
server dispatches to that. Otherwise it falls back to a deterministic
NumPy CPU implementation and explicitly marks the response
``verifiedDevice=CPUExecutionProvider``/``mode=cpu``. CI nodes can
exercise the full HTTP surface this way without needing a GPU.
"""

from __future__ import annotations

from .provenance import (  # noqa: F401
    GhostGPUError,
    KernelOp,
    ProvenanceEnvelope,
    attach_provenance,
    parse_execution_provider,
)
from .kernels import KernelRegistry, default_registry  # noqa: F401

__all__ = [
    "GhostGPUError",
    "KernelOp",
    "ProvenanceEnvelope",
    "attach_provenance",
    "parse_execution_provider",
    "KernelRegistry",
    "default_registry",
]

__version__ = "0.1.0"
