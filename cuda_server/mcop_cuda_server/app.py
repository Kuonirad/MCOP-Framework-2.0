"""FastAPI application for ``CUDAProvider`` HTTP bridge."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from mcop_cuda_server import __version__
from mcop_cuda_server.kernels import detect_cuda_runtime, dispatch

ALLOWED_OPS = frozenset(
    (
        "nova-neo-encode",
        "proteome-graph-step",
        "holographic-write",
        "meta-dry-run",
        "nova-evolve-score",
        "cosine-recall",
        "homeostasis",
    ),
)


def create_app() -> FastAPI:
    app = FastAPI(title="mcop_cuda_server", version=__version__)

    @app.get("/health")
    def health() -> dict[str, Any]:
        cuda_ok, dev_name, cc = detect_cuda_runtime()
        return {
            "status": "ok",
            "service": "mcop_cuda_server",
            "version": __version__,
            "cudaAvailable": cuda_ok,
            "deviceName": dev_name,
            "computeCapability": cc,
        }

    @app.get("/capabilities")
    def capabilities() -> dict[str, Any]:
        cuda_ok, dev_name, cc = detect_cuda_runtime()
        return {
            "cudaAvailable": cuda_ok,
            "webGPUAvailable": False,
            "deviceName": dev_name,
            "computeCapability": cc,
            "mode": "cuda" if cuda_ok else "cpu",
            "device": "cuda:0" if cuda_ok else "cpu",
            "provider": "microservice",
        }

    @app.post("/cuda/{op}")
    async def cuda_op(op: str, request: Request) -> JSONResponse:
        if op not in ALLOWED_OPS:
            raise HTTPException(status_code=404, detail=f"unknown op: {op}")
        try:
            body = await request.json()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"invalid json: {exc}") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="body must be a JSON object")
        inner = body.get("input", body)
        if inner is not None and not isinstance(inner, dict):
            raise HTTPException(status_code=400, detail="input must be a JSON object")
        inner_map = inner if isinstance(inner, dict) else {}
        try:
            result = dispatch(op, inner_map)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return JSONResponse(content=result)

    return app
