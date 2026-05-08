# CUDA Hardware Layer — Φ1–Φ5 Deployment Ladder

> Two CUDA providers coexist in MCOP today. Treat them as separate organelles
> with distinct flags, distinct provenance shapes, and distinct deployment
> states. This document is the canonical map for the in-process op-sharded
> ONNX layer (`CUDAHardwareLayer`); the existing HTTP/microservice provider
> (`CUDAProvider`) is unaffected and continues to ship as before.

## Provider matrix

| Provider | File | Flag | Default | Bridge style |
| -------- | ---- | ---- | ------- | ------------ |
| `CUDAProvider` (microservice / HTTP) | `src/hardware/Accelerator.ts` (#632, #633) | `MCOP_USE_CUDA=1` / `useCUDA: true` | off | Out-of-process Python sidecar (`pnpm cuda:serve`). Used today for all non-blocking CUDA bridges. |
| `CUDAHardwareLayer` (in-process op-sharded ONNX) | `src/hardware/CUDAHardwareLayer.ts` (this PR) | `MCOP_ENABLE_CUDA=1` / `enableCUDA: true` | off | One `onnxruntime-node` `InferenceSession` per kernel (`encode`, `graphAggregate`, `holographicUpdate`, `cosineRecall`, `evolveScore`, `homeostasis`). Per-op CUDA streams + verifiedDevice gate. |

The flags are **independent**. Either, neither, or both providers may be on
at any time. Provenance from each is distinguishable by
`AcceleratorProvenance.provider` (`CUDAProvider:microservice` vs
`CUDAHardwareLayer:onnx`).

## Kernel-name mapping

`CUDAHardwareLayer` exposes the spec's camelCase kernel names. They map 1:1
to the canonical kebab-case `AcceleratedOperation` enum so Merkle provenance
shape stays unified across both providers:

| `CUDAKernelOp` (public) | `AcceleratedOperation` (canonical) |
| ----------------------- | ---------------------------------- |
| `encode`                | `nova-neo-encode`                  |
| `graphAggregate`        | `proteome-graph-step`              |
| `holographicUpdate`     | `holographic-write`                |
| `cosineRecall`          | `cosine-recall` *(new in this PR)* |
| `evolveScore`           | `nova-evolve-score`                |
| `homeostasis`           | `homeostasis` *(new in this PR)*   |

## Φ1 — Land the layer disabled

**Status: this PR.**

- Add `src/hardware/CUDAHardwareLayer.ts` with op-sharded session loader,
  `accelerate()` dispatcher, and ghost-GPU detection via
  `parseExecutionProvider(session.endProfiling())`.
- Extend `AcceleratedOperation` with `cosine-recall` and `homeostasis`.
- Extend `AcceleratorProvenance` with `verifiedDevice`, `requestedDevice`,
  `substrateLineage`, and `durationMs` (all optional; backward-compatible).
- Add `MCOP_DEFAULT_ORCHESTRATOR.hardware.enableCUDA` (default `false`) and
  `kernelDir` (default `./models`).
- Treat `onnxruntime-node` as an optional peer install — dynamic-imported
  only when the flag is on. The repo continues to typecheck and lint
  without the package installed (same pattern as
  `examples/onnx_embedding_backend.ts`).
- All existing tests + lint + typecheck pass; new
  `cudaHardwareLayer.test.ts` covers the disabled path, every spec kernel,
  the ghost-GPU gate, and all profiler-output formats observed in ORT
  builds.

**Exit criteria.** Merge-blocking CI green. No behaviour change in any
existing pipeline (the layer cannot be reached when `enableCUDA: false`).

## Φ2 — First op online (`graphAggregate`)

**Status: harness landed; CPU baseline + structural artifact committed; awaiting model export + GPU runner for the ≥ 3× gate.**

What this PR adds:

- `scripts/benchmark-cuda-graph.mjs` — pure-ESM harness mirroring the
  conventions of `scripts/benchmark-arc-evo.mjs`. Builds a deterministic
  CSR sparse graph (32 768 nodes / avg degree 12 in `--mode=full`,
  1 024 / 12 in `--mode=smoke`) from a fixed mulberry32 seed
  (`0xC0FFEE`), runs warmup + timed iterations of a mean-aggregation
  kernel on CPU, optionally on CUDA (when `MCOP_ENABLE_CUDA=1` and a
  real `models/mcop_graphAggregate.onnx` exists), parses
  `session.endProfiling()` to enforce the verifiedDevice gate, and
  writes a Merkle-rooted record. ARC-AGI-3 conventions honoured:
  fixed seed, `MCOP_LOW_MEMORY_MODE` scales `nodeCount` to 4 096 in
  `--mode=full`, every leaf carries `verifiedDevice` /
  `outputFingerprint` / `merkleRoot`.
- `pnpm benchmark:cuda-graph` (full mode) and
  `pnpm benchmark:cuda-graph:smoke` (deterministic, structural-only).
- `docs/benchmarks/cuda_graph_aggregate.json` — committed smoke-mode
  baseline. Host-dependent timings are stripped so the merkleRoot is
  byte-stable across machines; `outputFingerprint` validates
  numerical correctness across Node versions / JIT shuffles.
- `src/__tests__/cudaBenchmarkHarness.test.ts` — re-runs the harness
  in a tmpdir-isolated child process and asserts the committed
  Merkle root, output fingerprint, edge count, and seed all reproduce
  byte-identically.

What is **not** in this PR (Φ2 follow-up):

- `models/mcop_graphAggregate.onnx`. Owned by the user's Python
  export pipeline. Drop the file under `MCOP_CUDA_KERNEL_DIR` and the
  harness picks it up automatically.
- `.github/workflows/cuda-bench.yml`. A `workflow_dispatch`
  GPU-runner workflow uploading the full-mode JSON as an artifact —
  small follow-up via the REST-API workaround for the
  `workflow`-scope token, separable from this PR.
- The ≥ 3× speedup gate. Cannot be measured on the GitHub
  `ubuntu-latest` runner; runs on the GPU host once the ONNX kernel
  is available.

**Exit criteria.** Full-mode JSON committed under
`docs/benchmarks/cuda_graph_aggregate.full.json` with raw timings, GPU
model, driver, ORT version, and the verified Merkle root of the run,
showing `targets.phi2Met === true`.

## Φ3 — Cascade the remaining five kernels

- Export the remaining ONNX kernels: `encode`, `holographicUpdate`,
  `cosineRecall`, `evolveScore`, `homeostasis`.
- Wire per-op CUDA streams (`session.run({ ... }, { ... cudaStreamId })`)
  so independent organelles execute in parallel rather than serially. The
  TypeScript surface does not need to change — kernel-level concurrency is
  set on the ORT session at create-time.
- Extend the benchmark runner to cover all six ops; gate on ≥ 1.4×
  pipeline-level gain end-to-end (proxy for true multi-stream parallelism)
  in addition to per-op speedups.

**Exit criteria.** Six `.onnx` files in `models/`, six benchmark records
under `docs/benchmarks/`, all dispatched through the same Merkle-rooted
provenance.

## Φ4 — verifiedDevice gate hardening

- Run a 1 000-step ARC trace with `enableCUDA: true` and assert zero
  `GhostGPUError` events. Any silent CPU fallback in this run blocks Φ5.
- Add a CI integration test that boots the layer with a deliberately
  CPU-only ORT build and asserts the gate fires (i.e. negative test for
  the safety property).
- Wire the layer through `BaseAdapter.prepare()` and
  `SynthesisProvenanceTracer` analogously to PR #633's wiring of the
  microservice provider, but only behind `enableCUDA`.

**Exit criteria.** 1 000-step run emits zero ghost-GPU events and full
Merkle replay reproduces every `verifiedDevice` field byte-identically.

## Φ5 — Default-on

- Flip `MCOP_DEFAULT_ORCHESTRATOR.hardware.enableCUDA` to `true` whenever
  the runtime detects a CUDA-capable ONNX Runtime build (`onnxruntime-node`
  installed and `parseExecutionProvider(session.endProfiling())` returns
  `'CUDAExecutionProvider'` on a smoke run during boot).
- Continue to honour explicit `enableCUDA: false` overrides; the gate is
  always available as an emergency disable.
- Target: sub-second end-to-end ARC step on RTX 4090 / Blackwell with full
  Lamarckian substrate-lineage metadata on every Merkle leaf.

**Exit criteria.** Production traffic exercising both providers, with
substrate-lineage entries surviving through the next snapshot of the
hardware-evolution log without verifiedDevice mismatches.

## Reversibility

- `enableCUDA: false` (or unsetting `MCOP_ENABLE_CUDA`) restores the
  pre-Φ1 behaviour exactly.
- Provenance from any past run remains replayable via `canonicalDigest`
  over the recorded `AcceleratorProvenance` payload — including
  `verifiedDevice`, `substrateLineage`, and `durationMs`.
- Removing `onnxruntime-node` from the install does not break the build:
  the dynamic import only fires when the flag is on, and only fails with
  a clear error message that points the caller at the install command.

## Out of scope for this ladder

- Multi-GPU / device-array dispatch: currently a single
  `CUDAHardwareLayer.device` per process. Multi-device routing is a
  follow-up MetaTuner concern (substrate-conditional strategy revival).
- Non-NVIDIA acceleration (ROCm, Apple Neural Engine): possible via
  alternate `executionProviders` arrays in `loadKernels()`, but the
  verifiedDevice gate currently hard-codes `CUDAExecutionProvider` as the
  required provider.
- Replacement of `CUDAProvider`: explicitly *not* a goal. Both providers
  ship side-by-side under independent flags. See the provider matrix at
  the top of this document.
