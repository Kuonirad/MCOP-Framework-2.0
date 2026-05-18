# `scripts/export_cuda_kernels/`

Kernel export pipeline for the MCOP CUDA hardware layer. Produces the
six `mcop_<op>.onnx` artifacts consumed by
[`CUDAHardwareLayer.loadKernels()`](../../src/hardware/CUDAHardwareLayer.ts)
plus a sealed `manifest.json` containing the Merkle digest of every
exported weight tensor (the "heritable silicon DNA" — see
`substrateLineage` + `resolvedFrom` audit fields).

## Two paths

| Path | When to use | Backend |
| ---- | ----------- | ------- |
| `export.py --backend pytorch` | Real kernels from PyTorch sources. | `torch.onnx.export` |
| `export.py --backend reference` | Deterministic structural placeholders (CI / tests / offline). | numpy + raw ONNX `protobuf` |

The reference backend produces *valid* ONNX models with no learned
weights — exactly the shape `CUDAHardwareLayer` expects so the
verifiedDevice gate can be exercised end-to-end without a GPU. Real
production exports should set `--backend pytorch` and supply a
checkpoint.

## Manifest schema

```json
{
  "version": "mcop-cuda-kernel-manifest/1.0",
  "exported_at": "2026-05-18T05:48:00Z",
  "backend": "pytorch",
  "kernels": {
    "encode": {
      "path": "models/mcop_encode.onnx",
      "merkle_root": "<sha256 of canonical {opset, weights, graph}>",
      "fp_variant": "fp16",
      "bytes": 12345
    }
  }
}
```

The manifest's per-kernel `merkle_root` is embedded into every
`AcceleratorProvenance` envelope as `substrateLineage` so MetaTuner
and the cluster log can detect drift between an export and its
runtime artifact.

## CLI

```bash
python3 scripts/export_cuda_kernels/export.py --out-dir models --backend reference
```

Required env on a GPU box:

```bash
pip install onnx torch  # for --backend pytorch
```

The reference backend has no third-party dependencies beyond Python ≥ 3.9.
