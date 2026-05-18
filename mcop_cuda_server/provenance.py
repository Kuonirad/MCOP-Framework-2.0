"""Provenance envelopes + ghost-GPU detection for ``mcop_cuda_server``.

The shape of :class:`ProvenanceEnvelope` is **byte-stable** when fed
through ``mcop.canonical_encoding.canonical_digest`` so the
``merkleRoot`` it produces matches the TypeScript
``CUDAHardwareLayer`` Merkle root for the same logical kernel call.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from typing import Any, Iterable, Literal, Mapping, Sequence

try:
    from mcop.canonical_encoding import canonical_digest  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - import-time only
    # The cuda server is intentionally usable without the full ``mcop``
    # package installed. Fall back to a stdlib-only canonicaliser that
    # still produces byte-stable digests for the JSON-safe payload
    # shapes we emit. RFC 8785 is preferred when available; otherwise
    # ``json.dumps(..., sort_keys=True, separators=(",", ":"))`` is a
    # second-best digest scheme used purely for in-server bookkeeping.
    import hashlib
    import json

    def canonical_digest(payload: Any) -> str:  # type: ignore[misc]
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


KernelOp = Literal[
    "encode",
    "graphAggregate",
    "holographicUpdate",
    "cosineRecall",
    "evolveScore",
    "homeostasis",
]


_KERNEL_TO_CANONICAL: Mapping[str, str] = {
    "encode": "nova-neo-encode",
    "graphAggregate": "proteome-graph-step",
    "holographicUpdate": "holographic-write",
    "cosineRecall": "cosine-recall",
    "evolveScore": "nova-evolve-score",
    "homeostasis": "homeostasis",
}


ResolvedFrom = Literal[
    "explicit-on",
    "explicit-off",
    "default-off",
    "auto-capable",
    "auto-not-capable",
]


@dataclass(frozen=True)
class ProvenanceEnvelope:
    """Sealed provenance record returned alongside every accelerated payload.

    Fields mirror ``AcceleratorProvenance`` in ``src/hardware/Accelerator.ts``
    so the cluster log can join across runtimes on a single canonical
    shape. ``merkle_root`` is computed over an RFC 8785–canonical
    encoding of every other field except itself.
    """

    op: KernelOp
    canonical_op: str
    mode: Literal["cpu", "cuda"]
    device: str
    provider: str
    requested_device: str
    verified_device: str
    substrate_lineage: str
    resolved_from: ResolvedFrom
    cuda_graph_captured: bool
    duration_ms: float
    timestamp: str
    merkle_root: str

    def to_json(self) -> dict[str, Any]:
        return {
            "device": self.device,
            "mode": self.mode,
            "kernel": self.canonical_op,
            "provider": self.provider,
            "merkleRoot": self.merkle_root,
            "timestamp": self.timestamp,
            "cudaGraphCaptured": self.cuda_graph_captured,
            "requestedDevice": self.requested_device,
            "verifiedDevice": self.verified_device,
            "substrateLineage": self.substrate_lineage,
            "durationMs": self.duration_ms,
            "resolvedFrom": self.resolved_from,
        }


class GhostGPUError(Exception):
    """Raised when the runtime profiler shows a CUDA dispatch fell back
    to a non-CUDA execution provider.

    Mirrors ``src/hardware/CUDAHardwareLayer.ts::GhostGPUError`` —
    treat as a hard provenance-integrity violation.
    """

    def __init__(self, op: KernelOp, requested_device: str, verified_provider: str) -> None:
        super().__init__(
            "Ghost-GPU detected on "
            f"{op} (requested {requested_device}, verified {verified_provider}) "
            "— provenance integrity violation"
        )
        self.op = op
        self.requested_device = requested_device
        self.verified_provider = verified_provider


def parse_execution_provider(profiler_output: str | Iterable[Mapping[str, Any]] | None) -> str:
    """Extract the verified execution provider from an ONNX Runtime
    profiler trace.

    Tolerates JSON arrays, JSON-lines, and pre-parsed iterables of
    mappings. Resolution rules mirror the TypeScript implementation:

    1. Any ``CUDAExecutionProvider`` event → ``CUDAExecutionProvider``.
    2. Any ``CPUExecutionProvider`` event → ``CPUExecutionProvider``.
    3. Exactly one provider observed → return it verbatim.
    4. Otherwise → ``"unknown"``.
    """

    if profiler_output is None:
        return "unknown"

    events: Sequence[Mapping[str, Any]]
    if isinstance(profiler_output, str):
        if not profiler_output:
            return "unknown"
        try:
            import json

            parsed = json.loads(profiler_output)
            events = parsed if isinstance(parsed, list) else [parsed] if isinstance(parsed, dict) else []
        except Exception:
            import json

            events = []
            for line in profiler_output.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if isinstance(obj, dict):
                    events.append(obj)  # type: ignore[arg-type]
    else:
        events = [e for e in profiler_output if isinstance(e, Mapping)]  # type: ignore[assignment]

    providers: set[str] = set()
    for event in events:
        args = event.get("args") if isinstance(event, Mapping) else None
        if isinstance(args, Mapping):
            for key in ("provider", "execution_provider"):
                value = args.get(key)
                if isinstance(value, str) and value:
                    providers.add(value)
        direct = event.get("provider") if isinstance(event, Mapping) else None
        if isinstance(direct, str) and direct:
            providers.add(direct)

    if "CUDAExecutionProvider" in providers:
        return "CUDAExecutionProvider"
    if "CPUExecutionProvider" in providers:
        return "CPUExecutionProvider"
    if len(providers) == 1:
        return next(iter(providers))
    return "unknown"


def attach_provenance(
    payload: Mapping[str, Any],
    *,
    op: KernelOp,
    mode: Literal["cpu", "cuda"],
    device: str,
    provider: str,
    requested_device: str,
    verified_device: str,
    stream_mode: str = "per-op",
    resolved_from: ResolvedFrom = "explicit-on",
    duration_ms: float = 0.0,
    cuda_graph_captured: bool = False,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Return ``payload`` augmented with a Merkle-rooted provenance envelope.

    Equivalent to ``attachAcceleratorProvenance`` in
    ``src/hardware/Accelerator.ts``. Raises :class:`GhostGPUError` when
    a CUDA dispatch was requested but ``verified_device`` is not
    ``CUDAExecutionProvider`` — the cluster log must never contain
    ghost-GPU lineage.
    """

    if mode == "cuda" and verified_device != "CUDAExecutionProvider":
        raise GhostGPUError(op, requested_device, verified_device)

    canonical_op = _KERNEL_TO_CANONICAL[op]
    iso_ts = timestamp or _dt.datetime.now(tz=_dt.timezone.utc).isoformat().replace("+00:00", "Z")
    substrate_lineage = f"{verified_device}/{stream_mode}"

    body = {
        "device": device,
        "mode": mode,
        "kernel": canonical_op,
        "provider": provider,
        "timestamp": iso_ts,
        "cudaGraphCaptured": cuda_graph_captured,
        "requestedDevice": requested_device,
        "verifiedDevice": verified_device,
        "substrateLineage": substrate_lineage,
        "durationMs": duration_ms,
        "resolvedFrom": resolved_from,
    }
    merkle_root = canonical_digest({"type": "MCOP_ACCELERATOR_PROVENANCE", "provenance": body, "payload": dict(payload)})

    envelope = ProvenanceEnvelope(
        op=op,
        canonical_op=canonical_op,
        mode=mode,
        device=device,
        provider=provider,
        requested_device=requested_device,
        verified_device=verified_device,
        substrate_lineage=substrate_lineage,
        resolved_from=resolved_from,
        cuda_graph_captured=cuda_graph_captured,
        duration_ms=duration_ms,
        timestamp=iso_ts,
        merkle_root=merkle_root,
    )

    out = dict(payload)
    out["_device"] = device
    out["_provenance"] = envelope.to_json()
    return out


__all__ = [
    "KernelOp",
    "ResolvedFrom",
    "ProvenanceEnvelope",
    "GhostGPUError",
    "attach_provenance",
    "parse_execution_provider",
]
