"""Stateless HTTP surface for ``mcop_cuda_server``.

A *zero-dependency* implementation built on the Python stdlib
``http.server`` so the unit tests (and CPU-only CI) can exercise the
full endpoint matrix without pulling FastAPI. Production deployments
should run the same handlers under a Uvicorn / FastAPI wrapper —
``mcop_cuda_server.fastapi_app:create_app()`` returns a FastAPI app
that delegates to the same handlers when FastAPI is available.

Endpoints
---------

``GET  /health``               — liveness probe
``GET  /capabilities``         — backend availability + kernel listing
``POST /cuda/<op>``            — execute a single kernel
``POST /cuda``                 — batch dispatch (``{ "calls": [...] }``)

Every successful response from ``/cuda/<op>`` is shape-equivalent to
``AcceleratedResult<T>`` from the TypeScript layer:

.. code-block:: json

    {
        "output": ...,
        "_device": "cuda:0",
        "_provenance": { ... merkle-rooted envelope ... }
    }

The verified-device gate (:class:`GhostGPUError`) is enforced *inside*
the handler before the response is written, so a CPU-fallback dispatch
that would otherwise mark itself as CUDA is rejected with HTTP 502
rather than poisoning the cluster lineage.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Mapping

from .kernels import KernelRegistry, default_registry
from .provenance import (
    GhostGPUError,
    KernelOp,
    ResolvedFrom,
    attach_provenance,
    parse_execution_provider,
)

log = logging.getLogger("mcop_cuda_server")


_KERNEL_OPS = (
    "encode",
    "graphAggregate",
    "holographicUpdate",
    "cosineRecall",
    "evolveScore",
    "homeostasis",
)


# ---------------------------------------------------------------------------
# Backend probe
# ---------------------------------------------------------------------------


def _probe_backend() -> dict[str, Any]:
    """Side-effect-free backend probe — mirrors ``detectCUDACapability``.

    Returns the same ``capable`` flag plus a richer description so the
    /capabilities endpoint can answer "which Python GPU runtime is
    available?". Never raises; every failure folds into ``capable=False``
    with a human-readable ``reason``.
    """

    backends: list[str] = []
    capable = False
    reason = "no GPU runtime detected"

    try:
        import onnxruntime as ort  # type: ignore[import-not-found]

        providers = list(ort.get_available_providers())
        backends.append(f"onnxruntime/{ort.__version__}")
        if any(p == "CUDAExecutionProvider" for p in providers):
            capable = True
            reason = "onnxruntime exposes CUDAExecutionProvider"
        for p in providers:
            backends.append(f"ort:{p}")
    except Exception:  # pragma: no cover - exercised by CI without ORT installed
        pass

    try:
        import cupy as cp  # type: ignore[import-not-found]

        backends.append(f"cupy/{cp.__version__}")
        if cp.cuda.runtime.getDeviceCount() > 0:  # type: ignore[attr-defined]
            capable = True
            reason = "CuPy reports CUDA devices available"
    except Exception:  # pragma: no cover
        pass

    try:
        import torch  # type: ignore[import-not-found]

        backends.append(f"torch/{torch.__version__}")
        if torch.cuda.is_available():
            capable = True
            reason = "torch.cuda.is_available()=True"
    except Exception:  # pragma: no cover
        pass

    return {
        "capable": capable,
        "reason": reason,
        "backends": backends,
        "ops": list(_KERNEL_OPS),
    }


# ---------------------------------------------------------------------------
# Handler core (transport-agnostic)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ServerConfig:
    """Runtime configuration for the CUDA server."""

    host: str = "0.0.0.0"
    port: int = 8765
    device: str = "cuda:0"
    stream_mode: str = "per-op"
    require_cuda: bool = False  # when True, refuse CPU fallback
    resolved_from: ResolvedFrom = "explicit-on"

    @classmethod
    def from_env(cls) -> "ServerConfig":
        require = os.environ.get("MCOP_CUDA_REQUIRE", "").strip()
        return cls(
            host=os.environ.get("MCOP_CUDA_HOST", "0.0.0.0"),
            port=int(os.environ.get("MCOP_CUDA_PORT", "8765")),
            device=os.environ.get("MCOP_CUDA_DEVICE", "cuda:0"),
            stream_mode=os.environ.get("MCOP_CUDA_STREAMS", "per-op"),
            require_cuda=require in {"1", "true", "on"},
            resolved_from="explicit-on" if require in {"1", "true", "on"} else "auto-capable",
        )


def execute_kernel(
    op: str,
    payload: Mapping[str, Any],
    *,
    config: ServerConfig,
    registry: KernelRegistry,
    probe_provider: Callable[[], str] | None = None,
) -> dict[str, Any]:
    """Run ``op`` and return a provenance-attached payload.

    Raises :class:`GhostGPUError` if ``config.require_cuda`` is set and
    the verified provider is not ``CUDAExecutionProvider``.
    """

    if op not in _KERNEL_OPS:
        raise KeyError(f"unknown kernel op: {op}")
    start = time.perf_counter()
    raw = registry.dispatch(op, payload)
    duration_ms = (time.perf_counter() - start) * 1000.0

    verified = (probe_provider or _verify_default)()
    mode: str = "cuda" if verified == "CUDAExecutionProvider" else "cpu"
    if config.require_cuda and mode != "cuda":
        raise GhostGPUError(op, config.device, verified)  # type: ignore[arg-type]

    return attach_provenance(
        raw,
        op=op,  # type: ignore[arg-type]
        mode=mode,  # type: ignore[arg-type]
        device=config.device if mode == "cuda" else "cpu",
        provider=f"mcop_cuda_server:{mode}",
        requested_device=config.device,
        verified_device=verified,
        stream_mode=config.stream_mode,
        resolved_from=config.resolved_from,
        duration_ms=duration_ms,
        cuda_graph_captured=mode == "cuda",
    )


def _verify_default() -> str:
    """Default verified-device probe.

    In production this should be hooked into the actual ORT profiler
    output. The default falls back to ``CPUExecutionProvider`` because
    the in-process reference kernels above all run on NumPy.
    """

    return "CPUExecutionProvider"


# ---------------------------------------------------------------------------
# stdlib HTTP server (for tests + small deployments)
# ---------------------------------------------------------------------------


class _Handler(BaseHTTPRequestHandler):
    server_version = "mcop-cuda-server/0.1"

    config: ServerConfig
    registry: KernelRegistry
    probe_provider: Callable[[], str] | None = None

    def log_message(self, format: str, *args: Any) -> None:  # silence default logging
        log.debug(format, *args)

    def _write_json(self, status: int, body: Mapping[str, Any]) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 - stdlib API
        if self.path == "/health":
            self._write_json(200, {"status": "ok", "timestamp": time.time()})
            return
        if self.path == "/capabilities":
            probe = _probe_backend()
            self._write_json(
                200,
                {
                    **probe,
                    "device": self.config.device,
                    "streamMode": self.config.stream_mode,
                    "resolvedFrom": self.config.resolved_from,
                    "requireCuda": self.config.require_cuda,
                },
            )
            return
        self._write_json(404, {"error": "not_found", "path": self.path})

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("content-length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw or b"{}")
        except Exception as exc:
            self._write_json(400, {"error": "bad_request", "detail": str(exc)})
            return

        path = self.path.rstrip("/")
        if path == "/cuda":
            calls = payload.get("calls") or []
            results: list[dict[str, Any]] = []
            for call in calls:
                op = call.get("op")
                try:
                    results.append(
                        execute_kernel(
                            op,
                            call.get("input", {}),
                            config=self.config,
                            registry=self.registry,
                            probe_provider=self.probe_provider,
                        )
                    )
                except (KeyError, GhostGPUError) as exc:
                    self._write_json(502 if isinstance(exc, GhostGPUError) else 400, {"error": str(exc), "op": op})
                    return
            self._write_json(200, {"results": results})
            return

        if path.startswith("/cuda/"):
            op = path[len("/cuda/"):]
            input_payload = payload.get("input") if isinstance(payload, Mapping) and "input" in payload else payload
            try:
                result = execute_kernel(
                    op,
                    input_payload or {},
                    config=self.config,
                    registry=self.registry,
                    probe_provider=self.probe_provider,
                )
                self._write_json(200, result)
            except KeyError as exc:
                self._write_json(404, {"error": "unknown_op", "detail": str(exc), "op": op})
            except GhostGPUError as exc:
                self._write_json(
                    502,
                    {
                        "error": "ghost_gpu",
                        "detail": str(exc),
                        "op": exc.op,
                        "requestedDevice": exc.requested_device,
                        "verifiedProvider": exc.verified_provider,
                    },
                )
            return

        self._write_json(404, {"error": "not_found", "path": self.path})


def build_server(
    config: ServerConfig | None = None,
    *,
    registry: KernelRegistry | None = None,
    probe_provider: Callable[[], str] | None = None,
) -> ThreadingHTTPServer:
    cfg = config or ServerConfig.from_env()
    reg = registry or default_registry
    handler_cls = type(
        "BoundHandler",
        (_Handler,),
        {"config": cfg, "registry": reg, "probe_provider": probe_provider},
    )
    server = ThreadingHTTPServer((cfg.host, cfg.port), handler_cls)
    return server


def serve_forever(config: ServerConfig | None = None) -> None:  # pragma: no cover - operator entry point
    server = build_server(config)
    log.info("mcop_cuda_server listening on http://%s:%d", server.server_address[0], server.server_address[1])
    server.serve_forever()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - operator entry point
    parser = argparse.ArgumentParser(description="MCOP CUDA microservice")
    parser.add_argument("--host", default=os.environ.get("MCOP_CUDA_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("MCOP_CUDA_PORT", "8765")))
    parser.add_argument("--device", default=os.environ.get("MCOP_CUDA_DEVICE", "cuda:0"))
    parser.add_argument("--streams", default=os.environ.get("MCOP_CUDA_STREAMS", "per-op"))
    parser.add_argument("--require-cuda", action="store_true", default=os.environ.get("MCOP_CUDA_REQUIRE") in {"1", "true", "on"})
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)
    logging.basicConfig(level=args.log_level)
    serve_forever(
        ServerConfig(
            host=args.host,
            port=args.port,
            device=args.device,
            stream_mode=args.streams,
            require_cuda=args.require_cuda,
            resolved_from="explicit-on" if args.require_cuda else "auto-capable",
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "ServerConfig",
    "execute_kernel",
    "build_server",
    "serve_forever",
    "main",
]
