"""Deterministic NumPy reference kernels for every ``AcceleratedOperation``.

The TypeScript ``CUDAProvider`` posts ``{ input, device, provider }`` where
``input`` is the op-specific payload. Responses must be JSON-serialisable dicts
whose top-level fields mirror what ``CUDAAccelerator`` expects (``output``,
``scores``, ``projectedGain``, etc.).
"""

from __future__ import annotations

import math
from typing import Any, Mapping

import numpy as np

__all__ = ["dispatch", "detect_cuda_runtime"]


def detect_cuda_runtime() -> tuple[bool, str, str]:
    """Return ``(cuda_available, device_name, compute_capability)``."""
    try:
        import torch  # type: ignore[import-not-found]

        if torch.cuda.is_available():
            idx = torch.cuda.current_device()
            name = torch.cuda.get_device_name(idx)
            major, minor = torch.cuda.get_device_capability(idx)
            return True, name, f"{major}.{minor}"
    except Exception:
        pass
    try:
        import cupy as cp  # type: ignore[import-not-found]

        if cp.cuda.is_available():
            dev = cp.cuda.Device()
            return True, f"cupy:{dev.id}", "unknown"
    except Exception:
        pass
    return False, "NumPy CPU", "n/a"


def _as_f32(arr: Any) -> np.ndarray:
    return np.asarray(arr, dtype=np.float32)


def _as_i32(arr: Any) -> np.ndarray:
    return np.asarray(arr, dtype=np.int32)


def _gelu(x: np.ndarray) -> np.ndarray:
    return x / (1.0 + np.exp(-np.clip(x, -50.0, 50.0)))


def op_nova_neo_encode(inner: Mapping[str, Any]) -> dict[str, Any]:
    """Embedding projection when full fixture is present; else identity on ``tensor``."""
    if "projection" in inner and "bias" in inner:
        inp = inner.get("input")
        if inp is None and "tensor" in inner:
            t = _as_f32(inner["tensor"])
            batch = int(inner.get("batch", 1))
            input_dim = int(inner.get("inputDim", max(t.size // max(batch, 1), 1)))
            hidden_dim = int(inner.get("hiddenDim", len(inner["bias"])))
            inp = t.reshape(batch, input_dim)
        else:
            inp = _as_f32(inner["input"])
        proj = _as_f32(inner["projection"])
        bias = _as_f32(inner["bias"])
        batch, input_dim = inp.shape
        hidden_dim = bias.size
        proj_mat = proj.reshape(input_dim, hidden_dim)
        out = _gelu(inp @ proj_mat + bias)
        return {"output": out.reshape(-1).tolist()}
    tensor = inner.get("tensor")
    if tensor is None:
        raise ValueError("nova-neo-encode requires `tensor` or projection/input/bias")
    t = _as_f32(tensor)
    return {"output": t.tolist(), "tensor": t.tolist()}


def op_proteome_graph_step(inner: Mapping[str, Any]) -> dict[str, Any]:
    graph = inner.get("graph")
    raw_in = inner.get("input")
    if raw_in is None:
        raise ValueError("proteome-graph-step requires `input`")
    inp = _as_f32(raw_in)
    if isinstance(graph, Mapping) and "rowPtr" in graph and "colIdx" in graph and "weights" in graph:
        row_ptr = _as_i32(graph["rowPtr"]).ravel()
        col_idx = _as_i32(graph["colIdx"]).ravel()
        weights = _as_f32(graph["weights"]).ravel()
        node_count = int(graph.get("nodeCount", row_ptr.size - 1))
        out = np.zeros(node_count, dtype=np.float32)
        for v in range(node_count):
            start = int(row_ptr[v])
            end = int(row_ptr[v + 1])
            if end > start:
                cols = col_idx[start:end]
                w = weights[start:end]
                out[v] = float(np.mean(w * inp[cols]))
        return {"output": out.tolist()}
    return {"output": inp.tolist()}


def op_holographic_write(inner: Mapping[str, Any]) -> dict[str, Any]:
    if "state" in inner and "left" in inner and "right" in inner:
        dim = int(inner.get("dim", int(math.sqrt(len(inner["state"]))) or 1))
        state = _as_f32(inner["state"]).reshape(dim, dim)
        left = _as_f32(inner["left"]).reshape(dim)
        right = _as_f32(inner["right"]).reshape(dim)
        gain = float(inner.get("gain", 0.125))
        upd = state + gain * np.outer(left, right)
        return {"output": upd.reshape(-1).tolist()}
    ctx = inner.get("context")
    syn = inner.get("synthesisVector")
    if ctx is None or syn is None:
        raise ValueError("holographic-write requires context + synthesisVector or state+left+right")
    a = _as_f32(ctx).ravel()
    b = _as_f32(syn).ravel()
    out = np.outer(a, b).astype(np.float32).reshape(-1)
    return {"output": out.tolist()}


def op_meta_dry_run(inner: Mapping[str, Any]) -> dict[str, Any]:
    g = inner.get("projectedGain")
    if isinstance(g, (int, float)) and math.isfinite(float(g)):
        return {"projectedGain": float(g)}
    return {"projectedGain": 0.0}


def op_nova_evolve_score(inner: Mapping[str, Any]) -> dict[str, Any]:
    if "phenotype" in inner and "reference" in inner and "weights" in inner:
        phen = _as_f32(inner["phenotype"]).ravel()
        ref = _as_f32(inner["reference"]).ravel()
        w = _as_f32(inner["weights"]).ravel()
        dims = inner.get("dims")
        dim_map = dims if isinstance(dims, Mapping) else {}
        population = int(inner.get("population", dim_map.get("population", 0)))
        traits = int(inner.get("traits", dim_map.get("traits", ref.size)))
        if population <= 0 or traits <= 0:
            traits = max(int(ref.size), 1)
            population = max(int(phen.size) // traits, 1)
        phen_mat = phen.reshape(population, traits)
        ref_v = ref.reshape(traits)
        w_v = w.reshape(traits)
        delta = phen_mat - ref_v[None, :]
        scores = -np.sum(w_v[None, :] * delta * delta, axis=1)
        return {"scores": scores.astype(np.float32).tolist()}
    cands = inner.get("candidates")
    if not isinstance(cands, list):
        raise ValueError("nova-evolve-score requires `candidates` or phenotype/reference/weights")
    scores = [float(c.get("score", 0) if isinstance(c, Mapping) else 0) for c in cands]
    return {"scores": scores}


def op_cosine_recall(inner: Mapping[str, Any]) -> dict[str, Any]:
    query = _as_f32(inner.get("query"))
    bank = _as_f32(inner.get("bank"))
    if bank.size == 0 or query.size == 0:
        raise ValueError("cosine-recall requires `query` and `bank`")
    dim = int(inner.get("dim", int(query.size)))
    bank_rows = int(inner.get("bankRows", 0))
    if bank_rows <= 0:
        bank_rows = int(bank.size // max(dim, 1))
    q = query.reshape(dim)
    bmat = bank.reshape(bank_rows, dim)
    dots = bmat @ q
    return {"output": dots.astype(np.float32).tolist(), "bestIndex": int(np.argmax(dots))}


def op_homeostasis(inner: Mapping[str, Any]) -> dict[str, Any]:
    if inner.get("state") is None:
        raise ValueError("homeostasis requires `state`")
    state = _as_f32(inner["state"])
    drive = _as_f32(inner.get("drive", np.zeros_like(state)))
    setpoint = _as_f32(inner.get("setpoint", np.zeros_like(state)))
    decay = float(inner.get("decay", 0.95))
    bound = float(inner.get("bound", 1.5))
    nxt = decay * state + (1.0 - decay) * setpoint + drive
    nxt = np.clip(nxt, -bound, bound)
    return {"output": nxt.astype(np.float32).tolist()}


_DISPATCH: dict[str, Any] = {
    "nova-neo-encode": op_nova_neo_encode,
    "proteome-graph-step": op_proteome_graph_step,
    "holographic-write": op_holographic_write,
    "meta-dry-run": op_meta_dry_run,
    "nova-evolve-score": op_nova_evolve_score,
    "cosine-recall": op_cosine_recall,
    "homeostasis": op_homeostasis,
}


def dispatch(op: str, inner: Mapping[str, Any]) -> dict[str, Any]:
    fn = _DISPATCH.get(op)
    if fn is None:
        raise ValueError(f"unknown operation: {op}")
    return fn(inner)
