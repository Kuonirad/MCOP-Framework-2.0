import { ContextTensor, EtchRecord, PheromoneTrace } from './types';

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
}

export interface ReasoningStep {
  node: ThoughtNode;
  resonance: number;
  etched: boolean;
  merkleHash?: string;
}
