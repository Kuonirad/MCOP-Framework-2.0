// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Proteome layer — type definitions for the self-organizing
 * 150-node sparse interaction graph that sits between NOVA-EVOLVE and the
 * MCOP triad.
 *
 * The proteome is the substrate where chaotic exploration meets
 * game-theoretic equilibrium. Each "protein" is an interaction node with
 * a state vector; sparse edges encode binding / inhibition / catalysis;
 * stepping the graph runs CSR mean-aggregation (mapped to the
 * `graphAggregate` CUDA kernel when {@link CUDAHardwareLayer} is
 * enabled) followed by a replicator-dynamics payoff step, homeostatic
 * pull-back, and Gaussian mutation.
 *
 * Two knobs expose the *edge-of-chaos* control surface to MetaTuner:
 *   - `mutationTemperature` ∈ [0, 1] — chaotic exploration intensity.
 *   - `homeostasis` ∈ [0, 1] — strength of the pull-back toward
 *     equilibrium energy.
 *
 * See `docs/PROTEOME_LAYER.md` for the full design rationale and the
 * v2.4 LS20 ARC reception ladder.
 */

import type { ContextTensor } from '../core/types';

/**
 * Functional class of a proteome node. Used by the game-theoretic
 * payoff matrix to decide which interactions are cooperative
 * (positive payoff) vs antagonistic (negative payoff). The four
 * canonical classes mirror the standard biological taxonomy used in
 * proteomics, but the framework itself is purely numerical — the
 * labels exist solely for provenance and MetaTuner conditioning.
 */
export type ProteomeNodeKind = 'enzyme' | 'structural' | 'transport' | 'signaling';

export const PROTEOME_NODE_KINDS: readonly ProteomeNodeKind[] = Object.freeze([
  'enzyme',
  'structural',
  'transport',
  'signaling',
]);

/**
 * Kind of interaction between two proteome nodes. Combined with the
 * source / target kinds via the {@link PROTEOME_PAYOFF_MATRIX} to
 * produce the replicator-dynamics payoff.
 */
export type ProteomeEdgeKind = 'binds' | 'inhibits' | 'catalyzes';

export const PROTEOME_EDGE_KINDS: readonly ProteomeEdgeKind[] = Object.freeze([
  'binds',
  'inhibits',
  'catalyzes',
]);

/**
 * A single proteome node. The state vector encodes the node's local
 * "shape" in the latent abstraction space; the energy scalar tracks
 * the running game-theoretic fitness used by the replicator dynamics.
 */
export interface ProteomeNode {
  readonly id: number;
  readonly kind: ProteomeNodeKind;
  /** State vector. Length matches {@link ProteomeConfig.stateDim}. */
  state: Float32Array;
  /** Running fitness scalar, ∈ [0, ∞). Equilibrium target is `1.0`. */
  energy: number;
  /** Step count since construction (for provenance / age-based heuristics). */
  age: number;
}

/**
 * A single directed edge in the sparse interaction graph.
 */
export interface ProteomeEdge {
  readonly from: number;
  readonly to: number;
  readonly weight: number;
  readonly kind: ProteomeEdgeKind;
}

/**
 * Compressed-sparse-row representation of the proteome graph. This is
 * exactly the shape consumed by the `graphAggregate` CUDA kernel
 * (`rowPtr`, `colIdx`, `weights`), so CPU and CUDA execution paths
 * share a single fixture builder.
 */
export interface ProteomeCsr {
  readonly nodeCount: number;
  readonly edgeCount: number;
  /** length = nodeCount + 1 */
  readonly rowPtr: Int32Array;
  /** length = edgeCount */
  readonly colIdx: Int32Array;
  /** length = edgeCount */
  readonly weights: Float32Array;
  /** length = edgeCount, parallel to colIdx */
  readonly edgeKinds: Uint8Array;
}

/**
 * Construction options for the proteome.
 *
 * Defaults are tuned for the v2.4 LS20 ARC reception ladder:
 *   - `nodeCount: 150` (specification target),
 *   - `stateDim: 32` (matches NovaNeoEncoder fixed-dim slice),
 *   - `avgDegree: 6` (sparse — average 6 neighbours per node, 1.2k edges).
 */
export interface ProteomeConfig {
  /** Total node count. Default `150` — the v2.4 LS20 target. */
  nodeCount?: number;
  /** Per-node state dimensionality. Default `32`. */
  stateDim?: number;
  /** Average sparse-graph degree. Default `6` (≈ 900–1 200 edges at n=150). */
  avgDegree?: number;
  /**
   * Strength of the pull-back toward energy equilibrium `1.0`. Range
   * `[0, 1]`. `0` = no pull-back (pure chaotic drift); `1` = energy
   * snaps back to equilibrium every step. Default `0.5` — sits at the
   * edge-of-chaos heuristic from the LS20 reception ladder.
   */
  homeostasis?: number;
  /**
   * Standard deviation of the Gaussian mutation noise added to state
   * vectors each step. Range `[0, 1]`. `0` = deterministic; `1` =
   * maximum chaotic exploration. Default `0.5`.
   */
  mutationTemperature?: number;
  /**
   * Deterministic seed. Required for byte-stable Merkle replay across
   * machines. Default `0xC0FFEE` — matches the
   * `benchmark-cuda-graph.mjs` convention.
   */
  seed?: number;
  /**
   * Energy equilibrium target. Default `1.0`. Exposed so the
   * orchestrator can be repurposed as a generic replicator-dynamics
   * substrate.
   */
  equilibriumEnergy?: number;
  /**
   * Payoff scale. Multiplied into every replicator-step delta. Default
   * `0.1` (mild update; lets the graph relax over ~10 steps when
   * homeostasis is near the equilibrium).
   */
  payoffScale?: number;
}

/**
 * Single-step result returned by {@link ProteomeOrchestrator.step}.
 *
 * Every field except `provenance` is a *summary* — the full per-node
 * state stays in the orchestrator and is queryable via
 * {@link ProteomeOrchestrator.snapshot}. This keeps the per-step
 * payload bounded, so a million-step soak run doesn't OOM the
 * provenance log.
 */
export interface ProteomeStepResult {
  /** Index of this step, monotonically increasing from `0`. */
  readonly step: number;
  /**
   * Aggregate energy across all nodes — a coarse temperature gauge
   * (`> nodeCount` = excited; `< nodeCount` = quiescent).
   */
  readonly totalEnergy: number;
  /**
   * Variance of per-node energy across the graph. The edge-of-chaos
   * signature is *high variance* at moderate `mutationTemperature`
   * and `homeostasis` — collapse to low variance signals over-ordered
   * exploitation, runaway high variance signals chaotic disintegration.
   */
  readonly energyVariance: number;
  /**
   * Replicator-dynamics equilibrium score ∈ [0, 1]. `1.0` = perfect
   * Nash equilibrium (no node would benefit from changing its
   * interaction profile); `0.0` = maximally out of equilibrium.
   *
   * Used as the proteome's "abstraction discovery" signal: the higher
   * and steadier this score becomes, the more likely the graph has
   * locked into a useful abstraction for downstream ARC reasoning.
   */
  readonly equilibriumScore: number;
  /**
   * SHA-256 Merkle root over the full per-node state + the previous
   * step's root. RFC 8785 canonical-JSON encoded, so byte-stable
   * across TS / Python runtimes and engine versions.
   */
  readonly merkleRoot: string;
  /** Provenance leaf — replicates the {@link AcceleratorProvenance} shape. */
  readonly provenance: ProteomeStepProvenance;
}

/**
 * Per-step provenance leaf, mirrored on the same Merkle backbone as
 * `AcceleratorProvenance.merkleRoot` so cluster replay can verify
 * proteome ↔ CUDA ↔ adapter byte parity.
 */
export interface ProteomeStepProvenance {
  /** `'proteome-graph-step'` (canonical) or `'proteome-cpu-step'` (CPU fallback). */
  readonly kernel: 'proteome-graph-step' | 'proteome-cpu-step';
  /** `'cuda'` when the in-process layer dispatched, else `'cpu'`. */
  readonly mode: 'cpu' | 'cuda';
  /** Logical device tag forwarded from the CUDA layer. */
  readonly device: string;
  /**
   * Verified execution provider, when applicable. Mirrors the
   * `AcceleratorProvenance.verifiedDevice` audit so ghost-GPU
   * detection extends to the proteome layer.
   */
  readonly verifiedDevice?: string;
  /** Stream-allocation tag, `<provider>/<streamMode>` when CUDA dispatch ran. */
  readonly substrateLineage?: string;
  /** Φ5 resolution tag from {@link CUDAHardwareLayer.resolvedFrom}. */
  readonly resolvedFrom?: string;
  /** Wall-clock duration of the step in milliseconds. */
  readonly durationMs: number;
  /** Knobs in effect for this step — sealed for Lamarckian replay. */
  readonly knobs: {
    readonly homeostasis: number;
    readonly mutationTemperature: number;
    readonly equilibriumEnergy: number;
    readonly payoffScale: number;
  };
}

/**
 * Snapshot view of the entire proteome state. Returned by
 * {@link ProteomeOrchestrator.snapshot}. Heavy — call sparingly.
 */
export interface ProteomeSnapshot {
  readonly step: number;
  readonly nodes: readonly ProteomeNode[];
  readonly graph: ProteomeCsr;
  readonly merkleRoot: string | undefined;
  readonly seed: number;
  readonly config: Required<Omit<ProteomeConfig, 'seed'>> & { readonly seed: number };
}

/**
 * Game-theoretic payoff matrix. The replicator-dynamics step looks up
 * `(srcKind, dstKind, edgeKind)` to find the payoff each node accrues
 * when interacting along this edge. The matrix is intentionally
 * symmetric in `(src, dst)` for `'binds'` (cooperation), asymmetric
 * for `'inhibits'` (zero-sum), and biased toward `enzyme → substrate`
 * for `'catalyzes'`.
 *
 * Exposed via {@link ProteomeOrchestrator.getPayoffMatrix} so external
 * tooling (e.g. MetaTuner, LS20 benchmark) can introspect the surface.
 */
export const PROTEOME_PAYOFF_MATRIX: Readonly<
  Record<ProteomeEdgeKind, Readonly<Record<ProteomeNodeKind, Readonly<Record<ProteomeNodeKind, number>>>>>
> = Object.freeze({
  binds: Object.freeze({
    enzyme: Object.freeze({ enzyme: 0.6, structural: 0.4, transport: 0.5, signaling: 0.7 }),
    structural: Object.freeze({ enzyme: 0.4, structural: 0.9, transport: 0.3, signaling: 0.2 }),
    transport: Object.freeze({ enzyme: 0.5, structural: 0.3, transport: 0.6, signaling: 0.4 }),
    signaling: Object.freeze({ enzyme: 0.7, structural: 0.2, transport: 0.4, signaling: 0.8 }),
  }),
  inhibits: Object.freeze({
    enzyme: Object.freeze({ enzyme: -0.8, structural: -0.2, transport: -0.3, signaling: -0.5 }),
    structural: Object.freeze({ enzyme: -0.2, structural: -0.1, transport: -0.2, signaling: -0.3 }),
    transport: Object.freeze({ enzyme: -0.3, structural: -0.2, transport: -0.6, signaling: -0.4 }),
    signaling: Object.freeze({ enzyme: -0.5, structural: -0.3, transport: -0.4, signaling: -0.9 }),
  }),
  catalyzes: Object.freeze({
    enzyme: Object.freeze({ enzyme: 0.1, structural: 0.5, transport: 0.7, signaling: 0.6 }),
    structural: Object.freeze({ enzyme: 0.0, structural: 0.0, transport: 0.0, signaling: 0.0 }),
    transport: Object.freeze({ enzyme: 0.2, structural: 0.0, transport: 0.0, signaling: 0.1 }),
    signaling: Object.freeze({ enzyme: 0.6, structural: 0.0, transport: 0.0, signaling: 0.2 }),
  }),
});

export type EncodedProteomeState = readonly number[] & ContextTensor;
