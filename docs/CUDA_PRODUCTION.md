# CUDA Hardware Layer — Production Runbook

> Companion to [`docs/CUDA_PHI1_PHI5.md`](./CUDA_PHI1_PHI5.md). The Φ-ladder
> document describes how the in-process layer was built; this file is the
> operator-facing runbook for turning it on in production, alongside the
> HTTP microservice (`CUDAProvider`) and the export pipeline.

## TL;DR — enable CUDA in 3 lines

```ts
// Source checkout only; hardware orchestration is not a public npm export.
import { resolveHardwareLayer } from './src/hardware';

const { accelerator, cudaLayer, resolved } = await resolveHardwareLayer();
// `resolved` is sealed audit-ready provenance:
//   { useCUDA, provider, enableCUDA, kernelDir, resolvedFrom }
```

That's it. The factory consults `MCOP_DEFAULT_ORCHESTRATOR.hardware`
(populated from env vars), runs the Φ5 capability probe when
`enableCUDA: 'auto'`, and returns a unified
`{ accelerator, cudaLayer, resolved }` triple. Every hot path that
already uses `Accelerator.accelerate(op, input)` keeps working
unchanged; consumers that want the in-process op-sharded layer call
`cudaLayer.accelerate(op, feeds)` directly.

## Architecture

```
                ┌──────────────────────────────────────────────┐
                │             MCOP TypeScript core             │
                │  (BaseAdapter, SynthesisProvenanceTracer,    │
                │   NovaEvolveTuner, …)                        │
                └────────────┬──────────────────────┬──────────┘
                             │                      │
                             ▼                      ▼
        ┌──────────────────────────────┐   ┌────────────────────────────┐
        │   resolveHardwareLayer()     │   │  cudaLayer.accelerate(op,  │
        │  → { accelerator, cudaLayer, │   │    feeds)                  │
        │      resolved }              │   │   (in-process op-sharded   │
        └──────────────┬───────────────┘   │    ONNX, ghost-GPU gate)   │
                       │                   └────────────┬───────────────┘
                       ▼                                │
            ┌──────────────────┐                        │
            │ Accelerator      │                        │
            │ (CPU / CUDAProv) │                        │
            └────────┬─────────┘                        │
                     │ HTTP POST /cuda/<op>             │
                     ▼                                  ▼
         ┌─────────────────────────┐       ┌────────────────────────┐
         │ mcop_cuda_server         │       │ onnxruntime-node /     │
         │ (FastAPI / stdlib HTTP)  │       │ onnxruntime-node-gpu   │
         │                          │       │ (in-process)           │
         │  - verifies provider     │       │  - one session per op  │
         │  - attaches Merkle root  │       │  - per-op streams      │
         │  - GhostGPUError → 502   │       │  - GhostGPUError       │
         └─────────────────────────┘       └────────────────────────┘
```

## Configuration matrix

| `useCUDA` | `provider`     | `enableCUDA` | Accelerator route                 | In-process layer |
| :-------- | :------------- | :----------- | :--------------------------------- | :--------------- |
| `false`   | any            | `false`      | `CPUFallback`                      | disabled         |
| `false`   | any            | `'auto'`     | `CPUFallback`                      | Φ5 probe         |
| `true`    | `microservice` | any          | `CUDAProvider` → `mcop_cuda_server` | follows `enableCUDA` |
| `true`    | `onnx`         | `true`       | `CPUFallback` (layer is sole CUDA) | enabled          |
| `true`    | `onnx`         | `'auto'`     | `CPUFallback`                      | Φ5 probe         |
| `true`    | `native`       | any          | reserved (degrades to microservice)| follows `enableCUDA` |

The `resolved` block surfaces the *final* values for sealing into the
orchestrator's Merkle leaf.

## Environment variables

| Variable                   | Default     | Notes                                                                                            |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `MCOP_USE_CUDA`            | `0`         | Sets `useCUDA: true` for the microservice provider.                                              |
| `MCOP_CUDA_ENDPOINT`       | `http://localhost:8765` | Endpoint for `CUDAProvider`.                                                          |
| `MCOP_CUDA_DEVICE`         | `cuda:0`    | Logical device tag sealed into provenance.                                                       |
| `MCOP_ENABLE_CUDA`         | `auto`      | Tri-state for the in-process layer. `1`/`0`/`auto`.                                              |
| `MCOP_CUDA_KERNEL_DIR`     | `./models`  | Where `mcop_<op>.onnx` files live.                                                               |
| `MCOP_CUDA_REQUIRE`        | `0`         | When `1`, the microservice rejects CPU dispatch with HTTP 502 (`error: "ghost_gpu"`).            |
| `MCOP_CUDA_STREAMS`        | `per-op`    | `per-op | shared`. Sealed into `substrateLineage`.                                               |

## Phase 1 — kernel artifact pipeline

```bash
# Deterministic CI placeholders (no torch dependency):
python3 scripts/export_cuda_kernels/export.py --out-dir models --backend reference

# Real PyTorch export on a GPU box:
pip install torch onnx
python3 scripts/export_cuda_kernels/export.py --out-dir models --backend pytorch --fp-variant fp16
```

`models/manifest.json` (schema `mcop-cuda-kernel-manifest/2.0`) pins
every exported kernel by `model_id = SHA-256(model bytes)` and commits
the whole set with a single RFC 6962 Merkle root over the `model_id`
leaves (ordered lexicographically by kernel name). Embed the manifest
into your release artifact and reference it in `substrateLineage` so a
runtime mismatch is detectable.

### Model provenance — Merkle manifest + PoUW receipts

The manifest closes the "verifiable framework, unverifiable model
bytes" gap. Three artifacts, one byte-identical implementation in both
runtimes (`src/provenance/*.ts` ↔ `mcop_package/mcop/{merkle,model_manifest,pouw}.py`,
locked by the parity golden in `tests/parity/merkleTree.*`):

1. **`model_id = SHA-256(model bytes)`** — the cryptographic identity of
   one ONNX file. Recompute it from disk to detect a single flipped byte.
2. **Merkle root** — the `model_id` leaves form an RFC 6962 tree
   (leaf hash `H(0x00‖id)`, node hash `H(0x01‖l‖r)`; second-preimage
   resistant, O(log n) proofs). `models/manifest.json → merkle.root` is
   the head; it is what gets **anchored on-chain** (`models/anchored_root.json`).
3. **PoUW receipts** — a Proof-of-Useful-Work receipt for an accelerated
   run binds the work digest (`AcceleratorProvenance.merkleRoot`), the
   `model_id` it executed, and a compact Merkle `inclusionProof`. A
   verifier checks the proof folds to `manifestRoot` **and** that
   `manifestRoot` equals the on-chain anchored root resolved by an
   `OnChainRootRegistry` (`MCOP_MODEL_MANIFEST_ROOT` → `models/anchored_root.json`).

Verify a receipt offline (no chain/ledger round-trip):

```bash
pnpm pouw:verify --receipt ./receipt.json --anchor models/anchored_root.json
```

The default anchor is a *pinned* root checked into the repo. To anchor
on a real chain, publish `merkle.root` to your registry contract or a
transparency-log signed tree head and rewrite `models/anchored_root.json`
(or override `MCOP_MODEL_MANIFEST_ROOT`); the verifier trusts only the
`root` field. Re-anchoring is deliberate: re-exporting a different model
set changes the root and must be followed by re-publishing the anchor.

## Phase 3 — running the Python microservice

```bash
# Stateless, stdlib-only (CI, dev):
python3 -m mcop_cuda_server --port 8765 --device cuda:0

# Production (FastAPI + Uvicorn):
pip install fastapi 'uvicorn[standard]' rfc8785
uvicorn mcop_cuda_server.fastapi_app:app --host 0.0.0.0 --port 8765

# Docker:
docker compose --profile cuda up -d
```

The microservice exposes `GET /health`, `GET /capabilities`,
`POST /cuda/<op>`, `POST /cuda` (batch). All responses include a
Merkle-rooted `_provenance` envelope.

`GET /capabilities` also advertises the anchored model manifest when one
is present (`MCOP_MODEL_MANIFEST`, or `<MCOP_CUDA_KERNEL_DIR>/manifest.json`):
its `modelManifest` block carries the Merkle `root`, `algorithm`, and the
per-kernel `model_id` map so a verifier can read the anchored root without
a chain round-trip. This is **advertisement only** — the reference kernels
run on NumPy, so the server does not mint a PoUW receipt (which would
falsely assert an ONNX model executed). Receipt emission lives in the
in-process `CUDAHardwareLayer` (set `modelManifest` on the layer), where a
real ONNX session actually runs the attested model.

### Forcing CUDA-only dispatch

Set `MCOP_CUDA_REQUIRE=1` (or `--require-cuda`) to refuse any CPU
fallback at the HTTP boundary. Any request whose verified provider is
not `CUDAExecutionProvider` returns HTTP 502 with:

```json
{ "error": "ghost_gpu", "op": "encode", "verifiedProvider": "CPUExecutionProvider" }
```

## Phase 4 — verifiedDevice gate hardening

The 1 000-step soak is already wired (`pnpm soak:cuda-verified-device`
+ `pnpm soak:cuda-verified-device:canary`). Every leaf carries
`resolvedFrom`. On a real GPU box, run both with
`MCOP_ENABLE_CUDA=1`:

```bash
MCOP_ENABLE_CUDA=1 MCOP_CUDA_KERNEL_DIR=./models pnpm soak:cuda-verified-device
```

## Phase 5 — auto-detect default-on

`MCOP_ENABLE_CUDA=auto` (the default) makes the layer probe at boot
via `detectCUDACapability()`. CPU-only hosts seal `auto-not-capable`
into every leaf; GPU hosts seal `auto-capable`. Explicit overrides
`MCOP_ENABLE_CUDA=1` / `MCOP_ENABLE_CUDA=0` always win and seal
`explicit-on` / `explicit-off`.

## Performance comparison template

When you run the benchmarks on a real GPU host, paste the numbers
below verbatim. The schema is intentionally minimal so the diff is
easy to review.

| Op                | CPU (ms) | CUDA (ms) | Speedup | verifiedDevice         | resolvedFrom   |
| ----------------- | -------- | --------- | ------- | ---------------------- | -------------- |
| `encode`          |   _TBD_  |   _TBD_   | _TBD_   | `CUDAExecutionProvider`| `auto-capable` |
| `graphAggregate`  |   _TBD_  |   _TBD_   | _TBD_   | `CUDAExecutionProvider`| `auto-capable` |
| `holographicUpdate`|  _TBD_  |   _TBD_   | _TBD_   | `CUDAExecutionProvider`| `auto-capable` |
| `cosineRecall`    |   _TBD_  |   _TBD_   | _TBD_   | `CUDAExecutionProvider`| `auto-capable` |
| `evolveScore`     |   _TBD_  |   _TBD_   | _TBD_   | `CUDAExecutionProvider`| `auto-capable` |
| `homeostasis`     |   _TBD_  |   _TBD_   | _TBD_   | `CUDAExecutionProvider`| `auto-capable` |

(Use `pnpm benchmark:cuda-ops` to produce the numbers.)

## Reversibility

`MCOP_USE_CUDA=0` + `MCOP_ENABLE_CUDA=0` restores pre-Φ1 behaviour
exactly. Both providers are independent, both are off by default in
the synchronous constructor path, and removing `onnxruntime-node`
from the install only fails at the moment a caller asks the in-process
layer to load a kernel — never at module-load time.
