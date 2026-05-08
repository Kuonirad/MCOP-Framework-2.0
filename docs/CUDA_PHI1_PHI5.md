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

**Status: shipped (#634).**

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

**Status: shipped (#635). Harness landed; CPU baseline + structural artifact committed; awaiting model export + GPU runner for the ≥ 3× gate.**

What this PR added:

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

**Status: harness extended to all six ops + per-op stream knob plumbed; CPU baselines committed; awaiting five ONNX exports + GPU runner for the per-op ≥3× / pipeline ≥1.4× gates.**

What this PR adds:

- `scripts/benchmark-cuda-graph.mjs` upgraded to a multi-op registry
  covering all six kernels. Each kernel ships a deterministic CPU
  baseline (matmul + GELU for `encode`, CSR mean-aggregate for
  `graphAggregate`, rank-1 outer product for `holographicUpdate`,
  pre-normalised dot product for `cosineRecall`, weighted L2 for
  `evolveScore`, decay/clamp for `homeostasis`) and an ONNX feeds
  builder for the future GPU run. New CLI flag `--op=<kernel>` picks a
  single op; `--op=all` cascades all six. Schema bumped to
  `mcop-cuda-bench/1.1` with new `op`, `description`, and `streams`
  fields.
- `CUDAHardwareLayer` exposes a `streams: 'per-op' | 'shared'` knob
  (default `'per-op'`). The choice is recorded in
  `_provenance.substrateLineage` as `<verifiedProvider>/<streamMode>`
  so MetaTuner can revive on stream-allocation lineage parity, not
  just device family. `'shared'` exists as a Φ3 rollback escape hatch.
  ONNX-Runtime-level concurrency is configured at
  `InferenceSession.create()` time per op; the in-process surface is
  intentionally minimal.
- Five new committed smoke baselines: `cuda_encode.json`,
  `cuda_holographic_update.json`, `cuda_cosine_recall.json`,
  `cuda_evolve_score.json`, `cuda_homeostasis.json`. Each is
  Merkle-stable across machines (host info + timings stripped),
  alongside the upgraded `cuda_graph_aggregate.json`.
- `pnpm benchmark:cuda-ops` (full mode, all ops) and
  `pnpm benchmark:cuda-ops:smoke` (deterministic, all ops) added on
  top of the existing `pnpm benchmark:cuda-graph[:smoke]` shortcuts.
- `cudaBenchmarkHarness.test.ts` extended via `it.each` to exercise
  all six ops; `cudaHardwareLayer.test.ts` gains tests for the
  `streams` getter, `streams=shared` substrate-lineage tag, and the
  `'per-op'` default.

What is **not** in this PR (Φ3 follow-up):

- The five remaining `mcop_<op>.onnx` exports. Owned by the user's
  Python pipeline; drop them under `MCOP_CUDA_KERNEL_DIR` and the
  harness picks them up automatically.
- True multi-stream concurrency measurement (≥ 1.4× pipeline gain).
  Cannot be measured without the ONNX exports + a GPU host.
- Wiring `BaseAdapter.prepare()` through `CUDAHardwareLayer` —
  deferred to Φ4 alongside the verifiedDevice 1k-step run.

**Exit criteria.** Six `.onnx` files in `models/`, six full-mode
benchmark records under `docs/benchmarks/cuda_<op>.full.json` with
per-op `targets.phi2Met === true` and a roll-up showing ≥ 1.4×
end-to-end pipeline gain when all six run on per-op streams.

## Φ4 — verifiedDevice gate hardening

**Status: shipped (this PR). Soak harness + canary regression + BaseAdapter wiring all on `ubuntu-latest`; full 1 000-step CUDA trace on a real GPU host remains a follow-up.**

What this PR adds:

- `scripts/cuda-verified-device-soak.mjs` — pure-ESM 1 000-step soak
  harness with the same `parseExecutionProvider` semantics as
  `CUDAHardwareLayer.ts`. Cycles through all six op-sharded kernels via
  `step % 6`, seals a fold-Merkle root over the leaf sequence, and writes
  `docs/benchmarks/cuda_verified_device_soak.json`. Schema
  `mcop-cuda-verified-device-soak/1.0`. Byte-stable across machines in
  smoke mode.
- `--canary=<step>` flag injects a `CPUExecutionProvider` payload at
  one specific step so CI can prove the gate halts at *exactly* the
  canonical step (regression for ghost-GPU detection).
- `src/__tests__/cudaVerifiedDeviceSoak.test.ts` — drives the actual
  in-process `CUDAHardwareLayer.accelerate()` for 1 000 × 6 = 6 000
  iterations against an injected mock `sessionFactory`, asserts:
  - Every leaf's `verifiedDevice === 'CUDAExecutionProvider'`.
  - Every leaf's `substrateLineage === 'CUDAExecutionProvider/per-op'`.
  - Zero `GhostGPUError`s raised across the soak.
  - Every emitted root is a 64-hex SHA-256 digest.
  - Plus a separate canary case that injects a CPU profile at step 137
    and asserts the gate halts at exactly that step.
  - Plus a child-process test that re-runs the standalone harness in
    a tmpdir-isolated process and verifies the committed Merkle root
    reproduces byte-identically.
- `BaseAdapter.cudaLayer?: CUDAHardwareLayer` slot — analogous to PR
  #633's `accelerator?: Accelerator` slot. When supplied AND
  `enableCUDA` is `true`, the holographic-write Merkle leaf is enriched
  with the layer's `requestedDevice` and
  `<verifiedProvider>/<streamMode>` substrate-lineage tag. Default
  `undefined` (no behaviour change vs. Φ3). Provenance-only — adapters
  that don't supply the layer keep the Φ3 leaf shape byte-for-byte.
- `pnpm soak:cuda-verified-device` (canonical 1 000-step run) and
  `pnpm soak:cuda-verified-device:canary` (canary at step 500) added.

What defers to Φ4 follow-up (requires GPU host + ONNX exports):

- Real-GPU 1 000-step soak with full per-op streams + actual ORT
  profiler payloads. The structural soak is byte-stable on
  `ubuntu-latest`; on a GPU host it should reproduce the same
  `targets.phi4ZeroGhostGPUEvents === true` invariant against real
  driver output.
- Full integration with `SynthesisProvenanceTracer` (currently the
  trace records `device` + `acceleratorMode` only via the existing
  accelerator slot; surfacing `verifiedDevice` + `substrateLineage`
  through the tracer's UI is a Φ5 concern).

**Exit criteria (full).** GPU-host 1 000-step run emits zero ghost-GPU
events with real ORT profiler output, and full Merkle replay reproduces
every `verifiedDevice` field byte-identically across reboots.

**Exit criteria (this PR).** `ubuntu-latest` runs the soak +
canary + in-process gate tests with byte-stable Merkle root, all Φ3
provenance leaf shapes preserved when the cudaLayer slot is unused.

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
