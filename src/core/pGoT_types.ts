import { ContextTensor, EtchRecord, PheromoneTrace } from './types';
import type {
  ExpansionEvaluation,
  FreeEnergyGovernorConfig,
  FreeEnergySignal,
  GovernedMode,
} from './freeEnergyGovernor';

export type ThoughtId = string;

export interface ThoughtNode {
  id: ThoughtId;
  label?: string;
  context: ContextTensor;
  synthesisVector: number[];
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ThoughtEdge {
  from: ThoughtId;
  to: ThoughtId;
  weight: number;
  kind?: 'implies' | 'refines' | 'contradicts' | 'supports';
}

/**
 * P_GoT 7-tuple: G = (V, E, Φ, Ψ, Λ, Ω, τ)
 *   V  — thought nodes
 *   E  — directed edges between thoughts
 *   Φ  — context tensors per node (NovaNeo)
 *   Ψ  — synthesis vectors per node
 *   Λ  — pheromone trace layer (Stigmergy)
 *   Ω  — holographic etch commitments
 *   τ  — ordering timestamp (graph version)
 */
export interface PGoTGraph {
  V: Map<ThoughtId, ThoughtNode>;
  E: ThoughtEdge[];
  Phi: Map<ThoughtId, ContextTensor>;
  Psi: Map<ThoughtId, number[]>;
  Lambda: PheromoneTrace[];
  Omega: EtchRecord[];
  tau: string;
}

export interface PGoTConfig {
  resonanceThreshold?: number;
  confidenceFloor?: number;
  maxFanout?: number;
  /** Maximum edge depth allowed in any directed reasoning chain. */
  maxDepth?: number;
  /**
   * Default free-energy governor settings for {@link PGoT.governedExpand}.
   * Per-call config overrides these. See {@link ./freeEnergyGovernor}.
   */
  freeEnergy?: FreeEnergyGovernorConfig;
}

export interface ReasoningStep {
  node: ThoughtNode;
  resonance: number;
  etched: boolean;
  merkleHash?: string;
}

/** A proposed expansion thought, scored thermodynamically before admission. */
export interface GovernedExpansionCandidate {
  text: string;
  synthesisVector: number[];
  /** Per-node budget (internal-energy contribution). Default `1` (unit cost). */
  energy?: number;
  label?: string;
  metadata?: Record<string, unknown>;
  /** Edge weight from the parent for admitted candidates. Default `1`. */
  edgeWeight?: number;
  edgeKind?: ThoughtEdge['kind'];
}

/** Outcome of a free-energy-governed expansion from a parent thought. */
export interface GovernedExpansionOutcome {
  /** `'free-energy'` when F governed, `'administrative-fallback'` when the
   * signal was degenerate (e.g. the hash backend) and `maxFanout` governed. */
  mode: GovernedMode;
  /** Thoughts actually added to the graph, in admission order. */
  admitted: ThoughtNode[];
  /** Per-round free-energy evaluations (empty in fallback mode). */
  trajectory: ExpansionEvaluation[];
  /** Why expansion stopped. */
  haltReason: 'plateau' | 'no-improving-candidate' | 'exhausted' | 'degenerate-signal' | 'maxFanout';
  /** The temperature-discrimination assessment that selected `mode`. */
  signal: FreeEnergySignal;
  /** Encoder backend in play — free-energy governance needs `'embedding'`. */
  backend: 'hash' | 'embedding' | 'novaNeoWeb';
}
