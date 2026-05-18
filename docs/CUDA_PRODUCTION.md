# CUDA Productionization

**Status:** production roadmap. The TypeScript in-process ONNX layer, HTTP
accelerator bridge, smoke benchmarks, soak harness, and Phi5 auto-probe exist in
this repository. Kernel model artifacts, the deterministic export pipeline, the
Python CUDA server, GPU CI, and complete hot-path unification are tracked here as
remaining production work.

## Current shipped surface

| Surface | Path | Status |
| --- | --- | --- |
| In-process ONNX layer | `src/hardware/CUDAHardwareLayer.ts` | Shipped; disabled or auto-probed unless explicitly enabled. |
| HTTP accelerator bridge | `src/hardware/Accelerator.ts`, `src/hardware/CUDAAccelerator.ts` | Shipped client contract; server implementation remains planned. |
| Config defaults | `src/config/mcop.config.ts` | Shipped `hardware.useCUDA`, `hardware.provider`, `hardware.enableCUDA`, and `hardware.kernelDir`. |
| Benchmarks | `scripts/benchmark-cuda-graph.mjs` | Shipped CPU-stable smoke and full-mode harness for all six ops. |
| Verified-device soak | `scripts/cuda-verified-device-soak.mjs` | Shipped structural soak and GhostGPU canary path. |
| Canonical Phi1-Phi5 record | `docs/CUDA_PHI1_PHI5.md` | Shipped implementation notes and exit criteria. |

## Six kernel operations

| Kernel op | Canonical accelerator op | Hot path target |
| --- | --- | --- |
| `encode` | `nova-neo-encode` | Encoder context vectorization. |
| `graphAggregate` | `proteome-graph-step` | Stigmergy graph propagation and aggregate recall. |
| `holographicUpdate` | `holographic-write` | Holographic Etch rank-1 updates. |
| `cosineRecall` | `cosine-recall` | StigmergyV5 resonance scan hot path. |
| `evolveScore` | `nova-evolve-score` | Meta-tuning and mutation candidate scoring. |
| `homeostasis` | `homeostasis` | Threshold, decay, and bounded feedback maintenance. |

## Phase gates

### Gate 0: audit and baseline

- Run `pnpm benchmark:cuda-ops:smoke` and
  `pnpm soak:cuda-verified-device:canary` on CPU-only CI to prove deterministic
  fallback and GhostGPU canary behavior.
- Run `pnpm benchmark:cuda-ops` and `pnpm soak:cuda-verified-device` on a real
  GPU host after model artifacts exist.
- Inventory the six ops above against `vectorMath`, encoder, stigmergy recall,
  Holographic Etch, and adapter provenance paths.
- Keep `docs/CUDA_PHI1_PHI5.md` as the low-level implementation ledger and this
  file as the production checklist.

### Gate 1: kernel artifact supply chain

- Add `scripts/export_cuda_kernels.py` or `scripts/export_cuda_kernels/` to emit
  one ONNX model per kernel: `models/mcop_encode.onnx`,
  `models/mcop_graphAggregate.onnx`, `models/mcop_holographicUpdate.onnx`,
  `models/mcop_cosineRecall.onnx`, `models/mcop_evolveScore.onnx`, and
  `models/mcop_homeostasis.onnx`.
- Emit precision variants under explicit names, for example
  `models/fp32/mcop_encode.onnx`, `models/fp16/mcop_encode.onnx`, and
  `models/int8/mcop_encode.onnx`.
- Write a checked-in manifest that records op, input shapes, output names,
  precision, exporter version, ONNX opset, expected provider, SHA-256 digest,
  and Merkle root over the weight digests.
- Include the model digest in `AcceleratorProvenance` through
  `substrateLineage` or an additive model-artifact field before any speedup
  claim is published.

### Gate 2: orchestrator and dual-provider unification

- Keep provider selection explicit:
  `hardware: { enableCUDA: 'auto' | true | false, provider: 'onnx' | 'microservice' }`.
- Map `provider: 'onnx'` to `CUDAHardwareLayer.create(...)`.
- Map `provider: 'microservice'` to `CUDAProvider` through the existing
  `CUDAAccelerator` bridge.
- Route hot paths through a single accelerator boundary and require every
  accelerated result to pass through `attachAcceleratorProvenance`.
- Preserve CPU determinism: `enableCUDA: false` and failed auto-probes must keep
  existing byte-identical CPU behavior while sealing `resolvedFrom`.

### Gate 3: Python CUDA server

- Add `mcop_cuda_server` with a stateless FastAPI entry point matching the
  existing client contract: `POST /cuda/{op}`.
- Add `GET /health` for process liveness and `GET /capabilities` for provider,
  device, precision, kernel, and model-digest discovery.
- Use `onnxruntime-gpu` first; CuPy/custom kernels may be added only behind the
  same op contract and provenance envelope.
- Reuse GhostGPU semantics: if CUDA was requested but profiler/capability data
  proves CPU execution, return a structured GhostGPU error instead of a silent
  fallback.
- Return provenance-ready payloads with provider, requested device, verified
  device, substrate lineage, model digest, duration, and fallback reason.
- Ship `Dockerfile.cuda` plus a `docker-compose.cuda.yml` example for local
  sidecar use.

### Gate 4: CI and Phi5 hardening

- Add GPU-runner workflow jobs behind labels or `workflow_dispatch` so ordinary
  CPU CI remains deterministic.
- Run CPU adversarial tests that request CUDA while forcing CPU execution; these
  must fail through GhostGPU detection.
- Run `pnpm benchmark:cuda-ops:smoke` in regular CI.
- Run full GPU benchmarks and the verified-device soak only when CUDA hardware
  and model artifacts are present.
- Store benchmark JSON artifacts with model digest, driver version, runtime
  provider, verified-device fields, Merkle root, and speedup summary.

### Gate 5: documentation and release evidence

- Update README and architecture docs only after the corresponding artifacts
  exist in the repository.
- Publish a minimal enablement example for both providers.
- Publish CPU versus CUDA tables only from committed benchmark artifacts.
- Document compatibility: the HTTP bridge and in-process ONNX layer are separate
  providers with separate failure modes and independent provenance.

## Acceptance criteria

- `enableCUDA: 'auto'` on a GPU host loads all six kernels for `provider: 'onnx'`.
- `provider: 'microservice'` reaches `mcop_cuda_server` and returns the same op
  shapes as the in-process layer.
- Every accelerated leaf includes requested device, verified device, provider,
  substrate lineage, `resolvedFrom`, model digest, timestamp, and Merkle root.
- Forced CPU execution while CUDA is requested raises GhostGPU detection.
- CPU-only hosts fall back cleanly with provenance that records the fallback.
- Encode and recall benchmarks show measurable speedup from committed GPU
  artifacts before public acceleration claims are updated.
