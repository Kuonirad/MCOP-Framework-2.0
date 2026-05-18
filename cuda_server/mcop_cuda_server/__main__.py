"""CLI entry: ``python -m mcop_cuda_server`` or ``mcop-cuda-server``."""

from __future__ import annotations

import argparse
import os

import uvicorn


def main() -> None:
    p = argparse.ArgumentParser(description="MCOP CUDA HTTP bridge")
    p.add_argument("--host", default=os.environ.get("MCOP_CUDA_SERVER_HOST", "0.0.0.0"))
    p.add_argument("--port", type=int, default=int(os.environ.get("MCOP_CUDA_SERVER_PORT", "8765")))
    p.add_argument(
        "--device",
        default=os.environ.get("MCOP_CUDA_DEVICE", "cuda:0"),
        help="Logical device label (recorded by clients; NumPy path ignores).",
    )
    args = p.parse_args()
    os.environ.setdefault("MCOP_CUDA_DEVICE", args.device)
    uvicorn.run(
        "mcop_cuda_server.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
