"""Reference NumPy implementations of the six MCOP CUDA kernels.

These are intentionally simple, deterministic, and numerically stable.
They serve three purposes:

1. **CPU fallback** when CuPy/ORT-GPU/Torch are not installed. The
   server still produces correct, fully-provenance-attached responses
   on a CPU-only CI runner — only the ``verifiedDevice`` field
   differs.

2. **Reference baseline** against which a GPU implementation can be
   compared bit-for-bit using ``rfc8785``-canonicalised output. The
   verifiedDevice + Merkle-rooted provenance protects against silent
   drift.

3. **CI fixture** so the FastAPI surface, the verified-device gate,
   and the ghost-GPU detector can be exercised end-to-end without
   needing a GPU host.
"""

from __future__ import annotations

import math
from typing import Any, Callable, Mapping

try:
    import numpy as np
    _HAS_NUMPY = True
except Exception:  # pragma: no cover - exercised on the CI fallback path
    np = None  # type: ignore[assignment]
    _HAS_NUMPY = False


def _to_vec(x: Any) -> list[float]:
    if isinstance(x, (list, tuple)):
        return [float(v) for v in x]
    if _HAS_NUMPY and isinstance(x, np.ndarray):
        return [float(v) for v in x.tolist()]
    raise TypeError(f"expected vector-like input, got {type(x).__name__}")


def _encode(payload: Mapping[str, Any]) -> dict[str, Any]:
    tensor = _to_vec(payload.get("tensor") or payload.get("input") or [])
    bias = float(payload.get("bias", 0.0))
    # GELU-ish activation; matches the benchmark harness's CPU baseline.
    output = [v * 0.5 * (1.0 + math.tanh(math.sqrt(2.0 / math.pi) * (v + 0.044715 * v ** 3))) + bias for v in tensor]
    return {"output": output, "dtype": "float32", "size": len(output)}


def _graph_aggregate(payload: Mapping[str, Any]) -> dict[str, Any]:
    # CSR mean-aggregate. Inputs:
    #   - indptr: int[]
    #   - indices: int[]
    #   - features: float[]  (flat row-major n × d)
    #   - dim: int           (feature dimensionality)
    indptr = list(payload.get("indptr") or [])
    indices = list(payload.get("indices") or [])
    features = _to_vec(payload.get("features") or [])
    dim = int(payload.get("dim") or 0)
    if dim <= 0 or not indptr:
        return {"output": [], "dim": 0}
    n = len(indptr) - 1
    out = [0.0] * (n * dim)
    for i in range(n):
        start = int(indptr[i])
        end = int(indptr[i + 1])
        degree = max(end - start, 1)
        for k in range(start, end):
            j = int(indices[k])
            for d in range(dim):
                out[i * dim + d] += features[j * dim + d]
        if degree > 0:
            inv = 1.0 / degree
            for d in range(dim):
                out[i * dim + d] *= inv
    return {"output": out, "dim": dim, "rows": n}


def _holographic_update(payload: Mapping[str, Any]) -> dict[str, Any]:
    context = _to_vec(payload.get("context") or [])
    synthesis = _to_vec(payload.get("synthesisVector") or payload.get("synthesis") or [])
    rows = len(context)
    cols = len(synthesis)
    out = [0.0] * (rows * cols)
    for r in range(rows):
        cr = context[r]
        if cr == 0.0:
            continue
        for c in range(cols):
            out[r * cols + c] = cr * synthesis[c]
    return {"output": out, "rows": rows, "cols": cols}


def _cosine_recall(payload: Mapping[str, Any]) -> dict[str, Any]:
    query = _to_vec(payload.get("query") or [])
    library = payload.get("library") or []
    # Library may be a list of vectors or a flat array + dim.
    if isinstance(library, Mapping):
        flat = _to_vec(library.get("data") or [])
        dim = int(library.get("dim") or 0)
        items = [flat[i:i + dim] for i in range(0, len(flat), dim)] if dim > 0 else []
    elif isinstance(library, list) and library and isinstance(library[0], (list, tuple)):
        items = [_to_vec(row) for row in library]
    else:
        items = [_to_vec(library)] if library else []

    if not query:
        return {"scores": [0.0] * len(items)}

    qmag = math.sqrt(sum(v * v for v in query)) or 1.0
    scores: list[float] = []
    for row in items:
        mag = math.sqrt(sum(v * v for v in row)) or 1.0
        common = min(len(row), len(query))
        dot = 0.0
        for k in range(common):
            dot += row[k] * query[k]
        scores.append(dot / (qmag * mag))
    return {"scores": scores}


def _evolve_score(payload: Mapping[str, Any]) -> dict[str, Any]:
    candidates = payload.get("candidates") or []
    scores: list[float] = []
    for c in candidates:
        if isinstance(c, Mapping):
            base = float(c.get("score", 0.0))
            vec = c.get("vector") or []
            if vec:
                v = _to_vec(vec)
                base += sum(x * x for x in v) ** 0.5 * 1e-6
            scores.append(base)
        else:
            scores.append(float(c))
    return {"scores": scores}


def _homeostasis(payload: Mapping[str, Any]) -> dict[str, Any]:
    state = _to_vec(payload.get("state") or [])
    decay = float(payload.get("decay", 0.98))
    floor = float(payload.get("floor", -1.0))
    ceil = float(payload.get("ceil", 1.0))
    out = [max(floor, min(ceil, v * decay)) for v in state]
    return {"output": out, "decay": decay, "floor": floor, "ceil": ceil}


class KernelRegistry:
    """Pluggable per-op kernel registry.

    Production deployments wire :meth:`register` with CuPy / Torch /
    ORT-GPU implementations. The defaults below are deterministic CPU
    references used when no GPU backend is available.
    """

    def __init__(self) -> None:
        self._impls: dict[str, Callable[[Mapping[str, Any]], dict[str, Any]]] = {
            "encode": _encode,
            "graphAggregate": _graph_aggregate,
            "holographicUpdate": _holographic_update,
            "cosineRecall": _cosine_recall,
            "evolveScore": _evolve_score,
            "homeostasis": _homeostasis,
        }

    def register(self, op: str, fn: Callable[[Mapping[str, Any]], dict[str, Any]]) -> None:
        if op not in self._impls:
            raise KeyError(f"unknown kernel op: {op}")
        self._impls[op] = fn

    def dispatch(self, op: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        try:
            impl = self._impls[op]
        except KeyError as exc:  # pragma: no cover - guarded by FastAPI route validation
            raise KeyError(f"unknown kernel op: {op}") from exc
        return impl(payload)

    @property
    def ops(self) -> tuple[str, ...]:
        return tuple(self._impls.keys())


default_registry = KernelRegistry()


__all__ = ["KernelRegistry", "default_registry"]
