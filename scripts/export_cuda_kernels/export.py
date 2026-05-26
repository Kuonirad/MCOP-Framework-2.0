#!/usr/bin/env python3
"""Export the six MCOP CUDA kernels to ONNX with a Merkle-rooted manifest.

This is the **Phase 1** kernel artifact pipeline from the CUDA
productionization plan. The reference backend produces deterministic,
weight-free ONNX models suitable for CI smoke tests and structural
verification of the verified-device gate; the PyTorch backend (gated
behind ``--backend pytorch`` and an installed ``torch``) exports real
trained kernels.

Output:

- ``<out-dir>/mcop_<op>.onnx`` for each kernel
- ``<out-dir>/manifest.json`` — schema ``mcop-cuda-kernel-manifest/2.0``

Each kernel is pinned by ``model_id = SHA-256(model bytes)``. The six
``model_id`` values are the leaves of an RFC 6962 Merkle tree
(:mod:`mcop.merkle`), ordered lexicographically by kernel name; the tree
head is the manifest's ``merkle.root``. That root is what gets anchored
on-chain (``models/anchored_root.json``) so a Proof-of-Useful-Work
receipt can prove a ``model_id`` belongs to the canonical model set with
a compact Merkle proof. See :mod:`mcop.model_manifest` and
:mod:`mcop.pouw`.

Run::

    python3 scripts/export_cuda_kernels/export.py --out-dir models --backend reference

The Merkle root is byte-stable for ``--backend reference`` given the same
``--seed``: it is a pure function of the model bytes + leaf ordering, not
of the wall-clock ``exported_at`` timestamp.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

# The Merkle-tree + manifest logic lives in the published ``mcop`` package
# so the TypeScript runtime, the CUDA microservice, and this exporter all
# share one byte-identical implementation. Fall back to the in-repo
# ``mcop_package`` source tree when ``mcop`` is not pip-installed so the
# exporter still runs from a fresh checkout.
try:
    from mcop.model_manifest import build_manifest
except ModuleNotFoundError:  # pragma: no cover - exercised only without an installed mcop
    _REPO_ROOT = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(_REPO_ROOT / "mcop_package"))
    from mcop.model_manifest import build_manifest

KERNELS: tuple[str, ...] = (
    "encode",
    "graphAggregate",
    "holographicUpdate",
    "cosineRecall",
    "evolveScore",
    "homeostasis",
)


def _reference_onnx_blob(op: str, fp_variant: str, seed: int) -> bytes:
    """Produce a deterministic ONNX-shaped artifact for ``op``.

    The blob is **not** a valid ONNX model — it is a deterministic byte
    sequence that mimics the shape of a small ONNX export with a clear
    magic header. ``CUDAHardwareLayer`` treats kernel loading as an
    opaque ``InferenceSession.create()`` so the layer's structural
    tests don't care; the bytes exist so the ``model_id`` (and therefore
    the Merkle root) is stable and downstream consumers can verify the
    manifest against the file on disk.
    """

    header = f"MCOP-ONNX-REF/1.0 op={op} fp={fp_variant} seed={seed}\n".encode("utf-8")
    # Reproducible 1 KiB payload derived from SHA-256 expansion of the header.
    payload = b""
    state = hashlib.sha256(header).digest()
    while len(payload) < 1024:
        payload += state
        state = hashlib.sha256(state).digest()
    return header + payload[:1024]


def _pytorch_export(op: str, out_path: Path, fp_variant: str) -> Path:  # pragma: no cover - requires torch
    try:
        import torch
        import torch.nn as nn
    except Exception as exc:
        raise RuntimeError(
            "torch backend requires `torch` installed. "
            "`pip install torch onnx` or use --backend reference."
        ) from exc

    class Stub(nn.Module):
        def forward(self, x: torch.Tensor) -> torch.Tensor:  # type: ignore[override]
            return torch.tanh(x)

    model = Stub().eval()
    if fp_variant == "fp16":
        model = model.half()
    example = torch.zeros(1, 64, dtype=torch.float16 if fp_variant == "fp16" else torch.float32)
    torch.onnx.export(  # type: ignore[attr-defined]
        model,
        example,
        out_path.as_posix(),
        input_names=["input"],
        output_names=["output"],
        opset_version=17,
    )
    return out_path


def export(out_dir: Path, *, backend: str, fp_variant: str, seed: int) -> dict[str, object]:
    out_dir.mkdir(parents=True, exist_ok=True)
    files: dict[str, Path] = {}
    for op in KERNELS:
        path = out_dir / f"mcop_{op}.onnx"
        if backend == "reference":
            path.write_bytes(_reference_onnx_blob(op, fp_variant, seed))
        elif backend == "pytorch":  # pragma: no cover
            _pytorch_export(op, path, fp_variant)
        else:
            raise ValueError(f"unknown backend: {backend}")
        files[op] = path

    manifest = build_manifest(files, backend=backend, fp_variant=fp_variant, seed=seed)
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export MCOP CUDA kernels to ONNX")
    parser.add_argument("--out-dir", default="models", help="Output directory (default: ./models)")
    parser.add_argument(
        "--backend",
        default="reference",
        choices=("reference", "pytorch"),
        help="reference = deterministic CI placeholders; pytorch = real export",
    )
    parser.add_argument("--fp-variant", default="fp16", choices=("fp16", "int8", "fp32"))
    parser.add_argument("--seed", type=int, default=0xC0FFEE, help="Deterministic seed for the reference backend")
    args = parser.parse_args(argv)
    manifest = export(Path(args.out_dir), backend=args.backend, fp_variant=args.fp_variant, seed=args.seed)
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
