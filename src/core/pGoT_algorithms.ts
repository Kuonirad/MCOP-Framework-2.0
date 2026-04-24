import { randomUUID } from 'node:crypto';
import { ContextTensor, EtchRecord, PheromoneTrace, ResonanceResult } from './types';
import { HolographicEtch } from './holographicEtch';
import { NovaNeoEncoder } from './novaNeoEncoder';
import { StigmergyV5 } from './stigmergyV5';
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

  private readonly V = new Map<ThoughtId, ThoughtNode>();
  private readonly E: ThoughtEdge[] = [];
  private readonly Phi = new Map<ThoughtId, ContextTensor>();
  private readonly Psi = new Map<ThoughtId, number[]>();
  private readonly Omega: EtchRecord[] = [];

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
  }

  addThought(text: string, synthesisVector: number[], label?: string, metadata?: Record<string, unknown>): ThoughtNode {
    const context = this.encoder.encode(text);
    const id = randomUUID();
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
    const outDegree = this.E.reduce((n, e) => n + (e.from === from ? 1 : 0), 0);
    if (outDegree >= this.maxFanout) {
      throw new Error(`maxFanout exceeded at node ${from}`);
    }
    const edge: ThoughtEdge = { from, to, weight, kind };
    this.E.push(edge);
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

  snapshot(): PGoTGraph {
    return {
      V: new Map(this.V),
      E: [...this.E],
      Phi: new Map(this.Phi),
      Psi: new Map(this.Psi),
      Lambda: [],
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
