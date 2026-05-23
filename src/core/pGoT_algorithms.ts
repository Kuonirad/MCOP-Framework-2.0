import { ContextTensor, EtchRecord, PheromoneTrace, ResonanceResult } from './types';
import { HolographicEtch } from './holographicEtch';
import { NovaNeoEncoder } from './novaNeoEncoder';
import { StigmergyV5 } from './stigmergyV5';
import { randomUuidV4 } from './uuid';
import {
  PGoTConfig,
  PGoTGraph,
  ReasoningStep,
  ThoughtEdge,
  ThoughtId,
  ThoughtNode,
} from './pGoT_types';

export class PGoT {
  private readonly encoder: NovaNeoEncoder;
  private readonly stigmergy: StigmergyV5;
  private readonly etch: HolographicEtch;
  private readonly maxFanout: number;
  private readonly maxDepth: number;

  private readonly V = new Map<ThoughtId, ThoughtNode>();
  private readonly E: ThoughtEdge[] = [];
  private readonly Phi = new Map<ThoughtId, ContextTensor>();
  private readonly Psi = new Map<ThoughtId, number[]>();
  private readonly Lambda: PheromoneTrace[] = [];
  private readonly Omega: EtchRecord[] = [];
  private readonly outDegrees = new Map<ThoughtId, number>();

  constructor(
    encoder: NovaNeoEncoder,
    stigmergy: StigmergyV5,
    etch: HolographicEtch,
    config: PGoTConfig = {}
  ) {
    this.encoder = encoder;
    this.stigmergy = stigmergy;
    this.etch = etch;
    this.maxFanout = config.maxFanout ?? 16;
    this.maxDepth = Math.max(1, Math.floor(config.maxDepth ?? 32));
  }

  addThought(text: string, synthesisVector: number[], label?: string, metadata?: Record<string, unknown>): ThoughtNode {
    const context = this.encoder.encode(text);
    const id = randomUuidV4();
    const node: ThoughtNode = {
      id,
      label,
      context,
      synthesisVector,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.V.set(id, node);
    this.Phi.set(id, context);
    this.Psi.set(id, synthesisVector);

    const trace = this.stigmergy.recordTrace(context, synthesisVector, { thoughtId: id, ...metadata });
    this.Lambda.push(trace);
    const record = this.etch.applyEtch(context, synthesisVector, label);
    if (record.hash) {
      this.Omega.push(record);
    }

    return { ...node, metadata: { ...metadata, traceHash: trace.hash } };
  }

  addEdge(from: ThoughtId, to: ThoughtId, weight: number, kind?: ThoughtEdge['kind']): ThoughtEdge {
    if (!this.V.has(from) || !this.V.has(to)) {
      throw new Error(`unknown thought id: ${this.V.has(from) ? to : from}`);
    }

    // Optimization: O(1) tracking of out-degrees instead of O(E) Array.prototype.reduce() scan
    const currentOutDegree = this.outDegrees.get(from) ?? 0;
    if (currentOutDegree >= this.maxFanout) {
      throw new Error(`maxFanout exceeded at node ${from}`);
    }
    const edge: ThoughtEdge = { from, to, weight, kind };
    this.assertWithinMaxDepth(edge);
    this.E.push(edge);
    this.outDegrees.set(from, currentOutDegree + 1);

    return edge;
  }

  reasonFrom(query: string, steps = 3): ReasoningStep[] {
    const queryVec = this.encoder.encode(query);
    const out: ReasoningStep[] = [];
    let probe: ContextTensor = queryVec;

    for (let i = 0; i < steps; i++) {
      const resonance: ResonanceResult = this.stigmergy.getResonance(probe);
      if (!resonance.trace) break;

      const node = this.findNodeForTrace(resonance.trace);
      if (!node) break;

      const record = this.etch.applyEtch(node.context, node.synthesisVector, `reason:${i}`);
      const etched = Boolean(record.hash);
      if (etched) this.Omega.push(record);

      out.push({
        node,
        resonance: resonance.score,
        etched,
        merkleHash: this.stigmergy.getMerkleRoot(),
      });

      probe = node.synthesisVector;
    }

    return out;
  }

  private findNodeForTrace(trace: PheromoneTrace): ThoughtNode | undefined {
    const id = trace.metadata?.thoughtId as ThoughtId | undefined;
    return id ? this.V.get(id) : undefined;
  }

  private assertWithinMaxDepth(candidate: ThoughtEdge): void {
    const adjacency = new Map<ThoughtId, ThoughtId[]>();
    for (const edge of this.E) {
      const next = adjacency.get(edge.from) ?? [];
      next.push(edge.to);
      adjacency.set(edge.from, next);
    }
    const next = adjacency.get(candidate.from) ?? [];
    next.push(candidate.to);
    adjacency.set(candidate.from, next);

    const depth = Math.max(
      ...Array.from(this.V.keys()).map((nodeId) =>
        this.longestPathDepth(nodeId, adjacency, new Set()),
      ),
    );
    if (depth > this.maxDepth) {
      throw new Error(`maxDepth exceeded at node ${candidate.from}`);
    }
  }

  private longestPathDepth(
    nodeId: ThoughtId,
    adjacency: Map<ThoughtId, ThoughtId[]>,
    visiting: Set<ThoughtId>,
  ): number {
    if (visiting.has(nodeId)) {
      return this.maxDepth + 1;
    }
    const children = adjacency.get(nodeId) ?? [];
    if (children.length === 0) return 0;
    visiting.add(nodeId);
    let max = 0;
    for (const child of children) {
      max = Math.max(max, 1 + this.longestPathDepth(child, adjacency, visiting));
    }
    visiting.delete(nodeId);
    return max;
  }

  snapshot(): PGoTGraph {
    return {
      V: new Map(this.V),
      E: [...this.E],
      Phi: new Map(this.Phi),
      Psi: new Map(this.Psi),
      Lambda: [...this.Lambda],
      Omega: [...this.Omega],
      tau: new Date().toISOString(),
    };
  }

  merkleRoot(): string | undefined {
    return this.stigmergy.getMerkleRoot();
  }

  entropy(id: ThoughtId): number {
    const tensor = this.Phi.get(id);
    return tensor ? this.encoder.estimateEntropy(tensor) : 0;
  }
}
