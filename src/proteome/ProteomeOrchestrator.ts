/**
 * @fileoverview ProteomeOrchestrator — v2.4 self-organizing 150-node
 * sparse-graph substrate.
 *
 * The proteome layer sits between NOVA-EVOLVE and the MCOP triad as a
 * compact (≈150 nodes, ≈900–1 200 edges) interaction graph that
 * compresses task-level abstractions through chaotic exploration plus
 * game-theoretic equilibria. Each step is a CSR mean-aggregation
 * (mapped 1:1 to {@link CUDAHardwareLayer}'s `graphAggregate` kernel
 * when the in-process layer is enabled) followed by:
 *
 *   1. Replicator-dynamics payoff update — each node's `energy` shifts
 *      toward the population-average payoff of its neighbours, weighted
 *      by the {@link PROTEOME_PAYOFF_MATRIX}.
 *   2. Homeostatic pull-back — `energy` is dragged toward
 *      `equilibriumEnergy` by the `homeostasis` knob ∈ [0, 1].
 *   3. Gaussian state mutation — i.i.d. noise added to every state
 *      vector with standard deviation = `mutationTemperature` ∈ [0, 1].
 *   4. Merkle sealing — full per-node state + previous root → SHA-256
 *      digest (RFC 8785 canonical encoding for TS↔Python parity).
 *
 * The two knobs (`homeostasis`, `mutationTemperature`) are the
 * "edge-of-chaos" control surface; they are exposed to
 * {@link NovaEvolveTuner} via the v2.4 extension so MetaTuner can drive
 * the proteome into the phase-transition regime where novel abstractions
 * emerge most readily.
 *
 * Provenance for every step mirrors {@link AcceleratorProvenance}, so
 * cluster replay can verify proteome ↔ CUDA ↔ adapter byte parity. Ghost
 * GPU detection is inherited from {@link CUDAHardwareLayer.accelerate}.
 *
 * See `docs/PROTEOME_LAYER.md` for the full design rationale and the
 * v2.4 LS20 ARC reception ladder.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import {
  CUDAHardwareLayer,
  type OnnxTensor,
} from '../hardware/CUDAHardwareLayer';
import {
  PROTEOME_EDGE_KINDS,
  PROTEOME_NODE_KINDS,
  PROTEOME_PAYOFF_MATRIX,
  type ProteomeConfig,
  type ProteomeCsr,
  type ProteomeEdgeKind,
  type ProteomeNode,
  type ProteomeNodeKind,
  type ProteomeSnapshot,
  type ProteomeStepProvenance,
  type ProteomeStepResult,
} from './types';

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_PROTEOME_CONFIG: Required<Omit<ProteomeConfig, 'seed'>> & { seed: number } =
  Object.freeze({
    nodeCount: 150,
    stateDim: 32,
    avgDegree: 6,
    homeostasis: 0.5,
    mutationTemperature: 0.5,
    seed: 0xc0ffee,
    equilibriumEnergy: 1.0,
    payoffScale: 0.1,
  });

/* ------------------------------------------------------------------ */
/* Deterministic PRNG (mulberry32 — matches benchmark-cuda-graph.mjs)  */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller transform: two uniforms → one standard-normal sample. */
function gauss(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

export interface ProteomeOrchestratorOptions {
  /**
   * Optional in-process CUDA layer. When supplied AND
   * `cudaLayer.enableCUDA && cudaLayer.loadedKernels.includes('graphAggregate')`,
   * each step dispatches the CSR aggregation through
   * {@link CUDAHardwareLayer.accelerate}, inheriting the verifiedDevice
   * gate + ghost-GPU detection + per-op stream-allocation lineage.
   *
   * When omitted or the layer is disabled, the orchestrator runs a
   * byte-identical CPU reference path. Provenance leaves carry
   * `mode: 'cpu'` in either case so downstream replay is uniform.
   */
  cudaLayer?: CUDAHardwareLayer;
  /** Override `now()` for deterministic provenance timestamps in tests. */
  now?: () => Date;
}

/**
 * The 150-node proteome substrate.
 *
 * Constructor is synchronous and side-effect-free: the graph is built
 * from the seed, all state vectors are initialised to small Gaussian
 * noise, and energies are pinned to `equilibriumEnergy`. Call
 * {@link step} or {@link runSteps} to evolve the system. The CUDA layer
 * is only consulted at step time, so a freshly-constructed proteome
 * does not require `loadKernels()` to have completed yet.
 */
export class ProteomeOrchestrator {
  private readonly _config: Required<Omit<ProteomeConfig, 'seed'>> & { seed: number };
  private readonly _graph: ProteomeCsr;
  private readonly _nodes: ProteomeNode[];
  private readonly _cudaLayer: CUDAHardwareLayer | undefined;
  private readonly _now: () => Date;
  private _stepCount = 0;
  private _merkleRoot: string | undefined;
  /** PRNG used for the mutation stream. Re-seeded only via reset(). */
  private _rand: () => number;
  /**
   * Mutable knobs. Public, intentionally — MetaTuner pokes these
   * directly each `metaTuneInterval` tick. Range-clamping happens
   * lazily in `step()` so external writers can't poison the substrate.
   */
  homeostasis: number;
  mutationTemperature: number;

  constructor(config: ProteomeConfig = {}, options: ProteomeOrchestratorOptions = {}) {
    this._config = Object.freeze({
      nodeCount: Math.max(1, Math.floor(config.nodeCount ?? DEFAULT_PROTEOME_CONFIG.nodeCount)),
      stateDim: Math.max(1, Math.floor(config.stateDim ?? DEFAULT_PROTEOME_CONFIG.stateDim)),
      avgDegree: Math.max(1, Math.floor(config.avgDegree ?? DEFAULT_PROTEOME_CONFIG.avgDegree)),
      homeostasis: clamp01(config.homeostasis ?? DEFAULT_PROTEOME_CONFIG.homeostasis),
      mutationTemperature: clamp01(
        config.mutationTemperature ?? DEFAULT_PROTEOME_CONFIG.mutationTemperature,
      ),
      seed: (config.seed ?? DEFAULT_PROTEOME_CONFIG.seed) >>> 0,
      equilibriumEnergy: Math.max(
        0,
        config.equilibriumEnergy ?? DEFAULT_PROTEOME_CONFIG.equilibriumEnergy,
      ),
      payoffScale: Math.max(0, config.payoffScale ?? DEFAULT_PROTEOME_CONFIG.payoffScale),
    });
    this.homeostasis = this._config.homeostasis;
    this.mutationTemperature = this._config.mutationTemperature;
    this._cudaLayer = options.cudaLayer;
    this._now = options.now ?? (() => new Date());
    this._rand = mulberry32(this._config.seed ^ 0xa5a5a5a5);
    this._graph = buildSparseGraph(
      this._config.nodeCount,
      this._config.avgDegree,
      this._config.seed,
    );
    this._nodes = buildNodes(this._config.nodeCount, this._config.stateDim, this._config.seed);
  }

  /* ------------------------------------------------------------------ */
  /* Public introspection                                                */
  /* ------------------------------------------------------------------ */

  /** Read-only access to the resolved config. */
  get config(): Required<Omit<ProteomeConfig, 'seed'>> & { seed: number } {
    return this._config;
  }

  /** Read-only access to the CSR graph. */
  get graph(): ProteomeCsr {
    return this._graph;
  }

  /** Number of nodes. Always equals `config.nodeCount`. */
  get nodeCount(): number {
    return this._graph.nodeCount;
  }

  /** Number of edges. */
  get edgeCount(): number {
    return this._graph.edgeCount;
  }

  /** Current Merkle root or `undefined` before any step has run. */
  get merkleRoot(): string | undefined {
    return this._merkleRoot;
  }

  /** Cumulative step count since construction. */
  get stepCount(): number {
    return this._stepCount;
  }

  /** Game-theoretic payoff matrix surface — re-exported for introspection. */
  getPayoffMatrix(): typeof PROTEOME_PAYOFF_MATRIX {
    return PROTEOME_PAYOFF_MATRIX;
  }

  /**
   * Returns the orchestrator's current state suitable for archival /
   * replay. The returned graph + nodes are *shallow copies* (typed
   * arrays are NOT cloned) — treat as read-only.
   */
  snapshot(): ProteomeSnapshot {
    return Object.freeze({
      step: this._stepCount,
      nodes: this._nodes.map((node) => Object.freeze({ ...node })),
      graph: this._graph,
      merkleRoot: this._merkleRoot,
      seed: this._config.seed,
      config: this._config,
    });
  }

  /* ------------------------------------------------------------------ */
  /* The step function                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Run a single step of the proteome:
   *
   *   1. CSR mean-aggregate state across neighbours (CUDA when
   *      enabled, CPU otherwise).
   *   2. Replicator-dynamics payoff update on `energy`.
   *   3. Homeostatic pull-back toward `equilibriumEnergy`.
   *   4. Gaussian state mutation.
   *   5. Merkle seal + provenance leaf.
   */
  async step(): Promise<ProteomeStepResult> {
    const homeostasis = clamp01(this.homeostasis);
    const mutationTemperature = clamp01(this.mutationTemperature);
    const start = nowMs();

    // ---- 1. Aggregate state across the sparse graph (per-dimension)
    const aggregated = await this._aggregateState();
    const cudaProvenance = aggregated.cudaProvenance;

    // ---- 2. Replicator-dynamics payoff update on per-node energy
    const payoffs = this._computeReplicatorPayoffs();

    // ---- 3 + 4. Combined homeostasis + mutation pass
    const equilibrium = this._config.equilibriumEnergy;
    const payoffScale = this._config.payoffScale;
    const stateDim = this._config.stateDim;
    for (let v = 0; v < this._nodes.length; v += 1) {
      const node = this._nodes[v];
      // Energy: replicator nudge + homeostatic pull-back
      const replicatorNudge = payoffScale * (payoffs[v] - equilibrium);
      const pullBack = homeostasis * (equilibrium - node.energy);
      node.energy = Math.max(0, node.energy + replicatorNudge + pullBack);
      // State: agree with aggregate + Gaussian mutation
      const agg = aggregated.state[v];
      const sigma = mutationTemperature;
      for (let d = 0; d < stateDim; d += 1) {
        const blended = 0.6 * node.state[d] + 0.4 * agg[d];
        const noise = sigma * gauss(this._rand);
        node.state[d] = blended + noise;
      }
      node.age += 1;
    }

    this._stepCount += 1;
    const duration = nowMs() - start;

    // ---- 5. Equilibrium score + Merkle seal
    const energies = this._nodes.map((n) => n.energy);
    const totalEnergy = energies.reduce((a, b) => a + b, 0);
    const meanEnergy = totalEnergy / energies.length;
    let variance = 0;
    for (const e of energies) variance += (e - meanEnergy) * (e - meanEnergy);
    const energyVariance = variance / energies.length;
    const equilibriumScore = this._scoreEquilibrium(meanEnergy, energyVariance);

    const merkleRoot = canonicalDigest({
      parent: this._merkleRoot ?? null,
      step: this._stepCount,
      energies,
      states: this._nodes.map((n) => Array.from(n.state)),
    });
    this._merkleRoot = merkleRoot;

    const provenance: ProteomeStepProvenance = Object.freeze({
      kernel: cudaProvenance ? 'proteome-graph-step' : 'proteome-cpu-step',
      mode: cudaProvenance ? 'cuda' : 'cpu',
      device: cudaProvenance?.device ?? 'cpu',
      verifiedDevice: cudaProvenance?.verifiedDevice,
      substrateLineage: cudaProvenance?.substrateLineage,
      resolvedFrom: this._cudaLayer?.resolvedFrom,
      durationMs: duration,
      knobs: Object.freeze({
        homeostasis,
        mutationTemperature,
        equilibriumEnergy: equilibrium,
        payoffScale,
      }),
    });

    return Object.freeze({
      step: this._stepCount,
      totalEnergy,
      energyVariance,
      equilibriumScore,
      merkleRoot,
      provenance,
    });
  }

  /**
   * Convenience: run `count` consecutive steps and return all results.
   * Useful for short benchmark windows; for million-step soaks call
   * {@link step} in a loop and discard old leaves to keep memory bounded.
   */
  async runSteps(count: number): Promise<ProteomeStepResult[]> {
    const safeCount = Math.max(0, Math.floor(count));
    const out: ProteomeStepResult[] = [];
    for (let i = 0; i < safeCount; i += 1) {
      out.push(await this.step());
    }
    return out;
  }

  /**
   * Reset to the initial (post-construction) state. The PRNG, node
   * states, energies, and Merkle root are all rewound. The graph
   * topology is NOT rebuilt because it is determined by `seed +
   * config` and is therefore already in the post-construction state.
   */
  reset(): void {
    const fresh = buildNodes(this._config.nodeCount, this._config.stateDim, this._config.seed);
    for (let v = 0; v < this._nodes.length; v += 1) {
      this._nodes[v].state.set(fresh[v].state);
      this._nodes[v].energy = fresh[v].energy;
      this._nodes[v].age = 0;
    }
    this._stepCount = 0;
    this._merkleRoot = undefined;
    this._rand = mulberry32(this._config.seed ^ 0xa5a5a5a5);
    this.homeostasis = this._config.homeostasis;
    this.mutationTemperature = this._config.mutationTemperature;
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                            */
  /* ------------------------------------------------------------------ */

  private async _aggregateState(): Promise<{
    state: Float32Array[];
    cudaProvenance?: {
      device: string;
      verifiedDevice: string;
      substrateLineage: string;
    };
  }> {
    const layer = this._cudaLayer;
    const enabled =
      layer !== undefined &&
      layer.enableCUDA === true &&
      layer.loadedKernels.includes('graphAggregate');

    // The CUDA kernel runs on scalar inputs (one Float32Array per
    // node); the proteome state is multi-dimensional, so we map the
    // dimension axis over independent kernel calls. For the
    // single-dim smoke case (stateDim === 1) this collapses to a
    // single call. The reference CPU path runs all dims locally.
    const { nodeCount, rowPtr, colIdx, weights } = this._graph;
    const stateDim = this._config.stateDim;
    const out: Float32Array[] = Array.from({ length: nodeCount }, () => new Float32Array(stateDim));

    if (enabled) {
      let cudaProvenance:
        | { device: string; verifiedDevice: string; substrateLineage: string }
        | undefined;
      for (let d = 0; d < stateDim; d += 1) {
        const input = new Float32Array(nodeCount);
        for (let v = 0; v < nodeCount; v += 1) input[v] = this._nodes[v].state[d];
        const feeds: Record<string, OnnxTensor> = {
          rowPtr: { data: rowPtr, dims: [nodeCount + 1] },
          colIdx: { data: colIdx, dims: [this._graph.edgeCount] },
          weights: { data: weights, dims: [this._graph.edgeCount] },
          input: { data: input, dims: [nodeCount] },
        };
        const result = await layer!.accelerate('graphAggregate', feeds);
        if (!cudaProvenance) {
          cudaProvenance = {
            device: result._provenance.device,
            verifiedDevice: result._provenance.verifiedDevice ?? 'unknown',
            substrateLineage: result._provenance.substrateLineage ?? `${result._provenance.device}/per-op`,
          };
        }
        const primary = result.output;
        const data = primary?.data;
        if (data instanceof Float32Array && data.length === nodeCount) {
          for (let v = 0; v < nodeCount; v += 1) out[v][d] = data[v];
        } else {
          // Spec-required shape mismatch — bail out to CPU for *this*
          // dim so the rest of the step can complete deterministically.
          fillCpuAggregate(this._graph, this._nodes, d, out);
        }
      }
      return { state: out, cudaProvenance };
    }

    // CPU reference path — runs unconditionally when the layer is
    // disabled / missing, or when `loadKernels()` has not been called.
    for (let d = 0; d < stateDim; d += 1) {
      fillCpuAggregate(this._graph, this._nodes, d, out);
    }
    return { state: out };
  }

  private _computeReplicatorPayoffs(): number[] {
    const { nodeCount, rowPtr, colIdx, weights, edgeKinds } = this._graph;
    const payoffs = new Array<number>(nodeCount).fill(0);
    for (let v = 0; v < nodeCount; v += 1) {
      const start = rowPtr[v];
      const end = rowPtr[v + 1];
      const srcKind = this._nodes[v].kind;
      if (end <= start) {
        payoffs[v] = this._config.equilibriumEnergy;
        continue;
      }
      let sum = 0;
      for (let k = start; k < end; k += 1) {
        const u = colIdx[k];
        const w = weights[k];
        const edgeKind = PROTEOME_EDGE_KINDS[edgeKinds[k] % PROTEOME_EDGE_KINDS.length];
        const dstKind = this._nodes[u].kind;
        const payoff = PROTEOME_PAYOFF_MATRIX[edgeKind][srcKind][dstKind];
        sum += payoff * w * this._nodes[u].energy;
      }
      payoffs[v] = sum / (end - start);
    }
    return payoffs;
  }

  private _scoreEquilibrium(meanEnergy: number, variance: number): number {
    const equilibrium = this._config.equilibriumEnergy;
    // High score when mean is near equilibrium AND variance is moderate.
    // Variance of 0 is over-collapsed; very high variance is chaotic
    // disintegration. Treat the "sweet spot" as variance ≈ 0.10.
    const meanFit = 1 / (1 + Math.abs(meanEnergy - equilibrium));
    const varFit = Math.exp(-Math.pow((variance - 0.1) / 0.2, 2));
    return clamp01(meanFit * varFit);
  }
}

/* ------------------------------------------------------------------ */
/* Static graph + node construction                                    */
/* ------------------------------------------------------------------ */

function buildSparseGraph(nodeCount: number, avgDegree: number, seed: number): ProteomeCsr {
  const rand = mulberry32(seed);
  const colBuilder: number[] = [];
  const weightBuilder: number[] = [];
  const edgeKindBuilder: number[] = [];
  const rowPtr = new Int32Array(nodeCount + 1);
  const edgeKindsLength = PROTEOME_EDGE_KINDS.length;
  for (let row = 0; row < nodeCount; row += 1) {
    rowPtr[row] = colBuilder.length;
    const degree = Math.max(1, Math.round(avgDegree * (0.7 + rand() * 0.6)));
    for (let k = 0; k < degree; k += 1) {
      // Avoid self-loops (small graphs can otherwise self-bind heavily).
      let col = Math.floor(rand() * nodeCount);
      if (col === row) col = (col + 1) % nodeCount;
      colBuilder.push(col);
      weightBuilder.push(rand());
      edgeKindBuilder.push(Math.floor(rand() * edgeKindsLength));
    }
  }
  rowPtr[nodeCount] = colBuilder.length;
  return Object.freeze({
    nodeCount,
    edgeCount: colBuilder.length,
    rowPtr,
    colIdx: Int32Array.from(colBuilder),
    weights: Float32Array.from(weightBuilder),
    edgeKinds: Uint8Array.from(edgeKindBuilder),
  });
}

function buildNodes(nodeCount: number, stateDim: number, seed: number): ProteomeNode[] {
  const rand = mulberry32(seed ^ 0x12345678);
  const kindRand = mulberry32(seed ^ 0x87654321);
  const nodes: ProteomeNode[] = [];
  for (let v = 0; v < nodeCount; v += 1) {
    const state = new Float32Array(stateDim);
    for (let d = 0; d < stateDim; d += 1) {
      state[d] = (rand() - 0.5) * 0.1; // small Gaussian-ish init
    }
    const kindIdx = Math.floor(kindRand() * PROTEOME_NODE_KINDS.length);
    const kind: ProteomeNodeKind = PROTEOME_NODE_KINDS[kindIdx];
    nodes.push({ id: v, kind, state, energy: 1.0, age: 0 });
  }
  return nodes;
}

function fillCpuAggregate(
  graph: ProteomeCsr,
  nodes: ProteomeNode[],
  dim: number,
  out: Float32Array[],
): void {
  const { nodeCount, rowPtr, colIdx, weights } = graph;
  for (let v = 0; v < nodeCount; v += 1) {
    const start = rowPtr[v];
    const end = rowPtr[v + 1];
    if (end <= start) {
      out[v][dim] = nodes[v].state[dim];
      continue;
    }
    let sum = 0;
    for (let k = start; k < end; k += 1) sum += weights[k] * nodes[colIdx[k]].state[dim];
    out[v][dim] = sum / (end - start);
  }
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export type {
  ProteomeConfig,
  ProteomeCsr,
  ProteomeEdgeKind,
  ProteomeNode,
  ProteomeNodeKind,
  ProteomeSnapshot,
  ProteomeStepProvenance,
  ProteomeStepResult,
};
export { PROTEOME_PAYOFF_MATRIX };
