"""Optional FastAPI integration for ``mcop_cuda_server``.

The stdlib server in :mod:`mcop_cuda_server.server` is sufficient for
testing and small deployments. Production should run under
Uvicorn/FastAPI for HTTP/2, request validation, and OpenAPI:

.. code-block:: bash

    uvicorn mcop_cuda_server.fastapi_app:app --host 0.0.0.0 --port 8765

FastAPI is imported lazily so the rest of the package stays
zero-dependency on CPU-only CI.
"""

from __future__ import annotations

from typing import Any

from .kernels import default_registry
from .provenance import GhostGPUError
from .server import ServerConfig, _manifest_advertisement, _probe_backend, execute_kernel


def create_app(config: ServerConfig | None = None) -> Any:  # pragma: no cover - requires FastAPI
    try:
        from fastapi import FastAPI, HTTPException
        from fastapi.responses import JSONResponse
    except Exception as exc:
        raise RuntimeError(
            "FastAPI not installed. `pip install fastapi uvicorn` or use the stdlib "
            "`python -m mcop_cuda_server`."
        ) from exc

    cfg = config or ServerConfig.from_env()
    app = FastAPI(title="mcop_cuda_server", version="0.1.0")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        from time import time as _t

        return {"status": "ok", "timestamp": _t()}

    @app.get("/capabilities")
    async def capabilities() -> dict[str, Any]:
        probe = _probe_backend()
        body: dict[str, Any] = {
            **probe,
            "device": cfg.device,
            "streamMode": cfg.stream_mode,
            "resolvedFrom": cfg.resolved_from,
            "requireCuda": cfg.require_cuda,
        }
        manifest = _manifest_advertisement(cfg.model_manifest_path)
        if manifest is not None:
            body["modelManifest"] = manifest
        return body

    @app.post("/cuda/{op}")
    async def cuda(op: str, body: dict[str, Any]) -> Any:
        input_payload = body.get("input") if "input" in body else body
        try:
            return execute_kernel(op, input_payload or {}, config=cfg, registry=default_registry)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except GhostGPUError as exc:
            return JSONResponse(
                status_code=502,
                content={
                    "error": "ghost_gpu",
                    "detail": "CUDA backend request failed.",
                    "op": exc.op,
                    "requestedDevice": exc.requested_device,
                    "verifiedProvider": exc.verified_provider,
                },
            )

    return app


def _maybe_default_app() -> Any:  # pragma: no cover
    try:
        return create_app()
    except RuntimeError:
        return None


app = _maybe_default_app()


__all__ = ["create_app", "app"]
