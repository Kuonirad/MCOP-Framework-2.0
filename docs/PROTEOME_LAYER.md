# Proteome Layer — v2.4 self-organizing substrate

> Where chaotic exploration meets game-theoretic equilibrium.
>
> The proteome is a 150-node sparse interaction graph that sits
> between [NOVA-EVOLVE](../src/core/novaEvolveTuner.ts) and the MCOP
> triad. Each step is a CSR mean-aggregation routed through the
> [`graphAggregate`](./CUDA_PHI1_PHI5.md#kernel-name-mapping) CUDA
> kernel when [`CUDAHardwareLayer`](../src/hardware/CUDAHardwareLayer.ts)
> is enabled, followed by a replicator-dynamics payoff step,
> homeostatic pull-back, and Gaussian state mutation. The two
> `(homeostasis, mutationTemperature)` knobs are the *edge-of-chaos*
> control surface exposed to MetaTuner.

## Why a proteome?

By v2.3 the substrate had three organelles in place: NOVA-NEO
embeddings, Stigmergy v5, and Holographic Etch. v2.3 also shipped the
[Φ1–Φ5 CUDA ladder](./CUDA_PHI1_PHI5.md) — the metabolic engine. What
remained missing was a *compact, self-organizing* layer between the
genome (NOVA-EVOLVE) and the triad: a place where chaotic exploration
could compete with stable equilibria to discover task-level
abstractions.

The biological analogy is intentional:
- **150 proteins** — small enough to step cheaply on `ubuntu-latest`
  (≈ 900–1 200 edges), large enough to host non-trivial Nash
  equilibria.
- **Four node kinds** (`enzyme`, `structural`, `transport`,
  `signaling`) and three edge kinds (`binds`, `inhibits`,
  `catalyzes`) — the minimal taxonomy required to populate a
  meaningfully asymmetric replicator-dynamics payoff matrix
  ([`PROTEOME_PAYOFF_MATRIX`](../src/proteome/types.ts)).
- **State vectors** carry the latent abstraction; **energies** carry
  the running game-theoretic fitness.

The proteome is **not** a knowledge graph — there is no semantic
labelling. It is a numerical substrate whose macro-states *encode*
abstractions that downstream consumers (the LS20 ARC harness, the
adapter pipeline, MetaTuner) can read off.

## Architecture

```
+---------------------+        +-----------------------+
|   NovaEvolveTuner   |  knobs |  ProteomeOrchestrator |
|  (homeostasis,      | -----> |  (150 nodes, ≈ 1k     |
|   mutationTemp)     |        |   edges, state ∈ R^32)|
+---------------------+        +-----------+-----------+
                                           |
                                           | graphAggregate feeds
                                           v
                               +-----------------------+
                               |  CUDAHardwareLayer    |
                               |  (Φ1–Φ5 verifiedDevice|
                               |   gate, per-op stream)|
                               +-----------------------+
```

- The orchestrator is purely numerical — no I/O, no global state.
- The CUDA layer is optional. When `enableCUDA` is false or
  `loadKernels()` has not run, the orchestrator falls back to a
  byte-identical CPU reference path.
- Provenance leaves carry `mode: 'cuda' | 'cpu'` and the
  `verifiedDevice` / `substrateLineage` / `resolvedFrom` audit fields,
  so cluster replay can verify proteome ↔ CUDA ↔ adapter byte parity
  on the same Merkle backbone.

## Step semantics

`ProteomeOrchestrator.step()` runs in five stages:

1. **CSR mean-aggregate** — `graphAggregate` over the sparse
   adjacency, one state dimension at a time. CUDA-routed when
   `cudaLayer.enableCUDA && cudaLayer.loadedKernels.includes('graphAggregate')`.
2. **Replicator payoffs** — each node's expected payoff is the
   weighted sum of `PROTEOME_PAYOFF_MATRIX[edgeKind][srcKind][dstKind] *
   weight * neighbourEnergy`, normalised by degree.
3. **Homeostatic pull-back** — `energy ← energy + homeostasis × (1 −
   energy)`. The `homeostasis` knob ∈ [0, 1] controls how fast the
   population energy snaps back to equilibrium.
4. **Gaussian state mutation** — each state coordinate is
   `0.6 × current + 0.4 × aggregated + mutationTemperature × N(0, 1)`.
5. **Merkle seal** — `canonicalDigest({ parent, step, energies,
   states })`. RFC 8785 canonical JSON, so byte-stable across TS ↔
   Python.

The two knobs are the only mutable knobs surface; *every other
parameter* (node count, state dim, payoff matrix, equilibrium energy)
is fixed at construction.

## Edge-of-chaos control

The proteome's interesting macro-states emerge near the phase
transition between **ordered** and **chaotic** regimes:

| Regime | `mutationTemperature` | `homeostasis` | Behaviour |
| --- | --- | --- | --- |
| Ordered exploitation | low (≤ 0.2) | high (≥ 0.8) | Energies snap to 1.0, state variance collapses, no novel abstractions surface. |
| Chaotic disintegration | high (≥ 0.8) | low (≤ 0.2) | Energies drift unbounded, state variance balloons, all abstractions equally noisy. |
| **Edge-of-chaos** | moderate (≈ 0.5) | moderate (≈ 0.5) | High state variance with bounded energies. Novel abstractions emerge most readily here. |

[`NovaEvolveTuner`](../src/core/novaEvolveTuner.ts) drives these knobs
via two routes:
1. The `homeostasis` knob is now part of the
   [`NovaEvolveConfig`](../src/core/novaEvolveTuner.ts) genome, with
   default `0.5`.
2. The `proteome?: ProteomeKnobSurface` slot on
   `NovaEvolveTunerDeps` — when wired, accepted meta-tune decisions
   propagate to the proteome on the same tick they are accepted, so
   the substrate experiences the new regime within the same
   `metaTuneInterval` window.

`scoreConfig` rewards entropy-conditional homeostasis targets:
- entropy > 0.7 (chaotic task drift) → target `homeostasis ≈ 0.4`
  (gentle pull-back lets the proteome explore).
- entropy ≤ 0.7 (ordered task drift) → target `homeostasis ≈ 0.6`
  (stronger pull-back suppresses noise).

## CUDA dispatch

When the in-process CUDA layer is enabled:

```ts
const cudaLayer = new CUDAHardwareLayer({ enableCUDA: true, kernelDir: './models' });
await cudaLayer.loadKernels();

const proteome = new ProteomeOrchestrator(
  { nodeCount: 150, stateDim: 32 },
  { cudaLayer },
);

for (let i = 0; i < 100; i += 1) {
  const result = await proteome.step();
  // result.provenance.kernel === 'proteome-graph-step'
  // result.provenance.mode === 'cuda'
  // result.provenance.verifiedDevice === 'CUDAExecutionProvider'
}
```

Each `step()` issues `stateDim` calls to
`CUDAHardwareLayer.accelerate('graphAggregate', ...)` — one per
state-vector dimension. Every call inherits the verifiedDevice gate,
the ghost-GPU detection, and the per-op stream-allocation tag, so a
proteome run is fully covered by the existing Φ4 soak suite.

On CPU-only hosts (`ubuntu-latest` CI, dev laptops without
`onnxruntime-node-gpu`) the layer falls back automatically; the
proteome runs the byte-identical CPU reference path and seals
`mode: 'cpu'` + `resolvedFrom: 'auto-not-capable'` on every leaf.

## v2.4 LS20 ARC reception ladder

| Rung | Status | Description |
| --- | --- | --- |
| **R1** — Sparse-graph primitives | shipped (this PR) | 150 nodes, ≈ 1k edges, deterministic from a seed. |
| **R2** — Replicator dynamics | shipped (this PR) | 4-kind × 3-edge payoff matrix with asymmetric `inhibits`. |
| **R3** — Edge-of-chaos knobs | shipped (this PR) | `(homeostasis, mutationTemperature)` exposed via `NovaEvolveConfig`. |
| **R4** — CUDA `graphAggregate` wiring | shipped (this PR) | Per-dim dispatch, verifiedDevice inheritance. |
| **R5** — LS20 ARC benchmark scaffold | shipped (this PR) | `scripts/benchmark-arc-ls20.mjs` with byte-stable Merkle root + pre/post solve-rate lift. |
| **R6** — Real ARC task ingestion | follow-up | Replace the synthetic validation split with ARC-AGI-3 hard subset. |
| **R7** — Phase-transition emergence | follow-up | Show consistent post-proteome solve rate ≥ 0.5 on the ls20 hard subset under MetaTuner-driven knob schedules. |

R6 + R7 require:
- Real ARC task encoder (NOVA-NEO already has a fixed-dim path; the
  proteome's `stateDim` is configurable).
- A decoder that maps a converged proteome state-space into candidate
  ARC transformation rules. This is the next major design effort and
  is intentionally not in scope for v2.4.

## Reversibility

The proteome layer is purely additive:
- The `homeostasis` knob lands inside `NovaEvolveConfig` with a sane
  default (`0.5`) — all existing tuner consumers carry on unchanged.
- The `proteome?: ProteomeKnobSurface` slot on `NovaEvolveTunerDeps`
  defaults to `undefined`; v2.3 behaviour is byte-identical.
- `ProteomeOrchestrator` has no global state, no I/O, and no
  start-up cost beyond `O(nodeCount × avgDegree)` graph construction.
- Removing the proteome dependency requires deleting `src/proteome/`
  and reverting the `homeostasis` knob — no other module imports the
  proteome.

## Tests + benchmarks

| File | Purpose |
| --- | --- |
| `src/__tests__/proteomeOrchestrator.test.ts` | Construction determinism, edge-of-chaos behaviour, CUDA integration, MetaTuner ↔ proteome propagation (15 tests). |
| `src/__tests__/arcLs20Harness.test.ts` | Byte-stable Merkle replay of the LS20 ARC harness (5 tests). |
| `scripts/benchmark-arc-ls20.mjs` | The LS20 scaffold harness. Smoke mode is structural-only; full mode includes timings + the solve-rate regression gate. |
| `docs/benchmarks/arc_ls20.json` | Committed smoke-mode baseline (mode `'smoke'`, schema `mcop-arc-ls20/1.0`). |

## Out of scope for this PR

- Multi-GPU dispatch — the proteome still routes through a single
  `CUDAHardwareLayer.device`.
- Real ARC task ingestion + state-space decoder — see R6/R7.
- A `mcop_proteome_step.onnx` export — the proteome reuses the
  existing `graphAggregate` kernel; no new export is required.
- Cross-process replication — proteome state lives in a single
  process. Cluster mode can shard tasks across proteomes but does not
  merge state.
