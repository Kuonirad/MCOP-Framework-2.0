import { CircularBuffer } from './circularBuffer';
import { canonicalDigest } from './canonicalEncoding';
import type { ContextTensor, PheromoneTrace, ResonanceResult } from './types';
import { cosineWithMagnitudes, magnitude, padVector } from './vectorMath';
import {
  mergeRemoteRoots,
  type MerkleInclusionProof,
  serialiseTraceForCluster,
} from './clusterProvenance';
import { StigmergyV5 } from './stigmergyV5';

export interface ClusterStigmergyOptions {
  readonly local: StigmergyV5;
  readonly localNodeId: string;
  /** Ring buffer for foreign traces (default 512). */
  readonly maxRemoteTraces?: number;
}

interface RemoteTraceEntry {
  readonly nodeId: string;
  readonly trace: PheromoneTrace;
  readonly receivedAt: string;
}

function alignVectors(a: ContextTensor, b: number[]): { a: number[] | ContextTensor; b: number[] } {
  if (a.length === b.length) return { a, b };
  const length = Math.max(a.length, b.length);
  return { a: padVector(a, length), b: padVector(b, length) };
}

/**
 * Cluster-aware stigmergy façade: retains a private {@link StigmergyV5} for
 * local writes while ingesting cryptographically sealed traces from peers.
 * Resonance queries consider both local and remote buffers under the local
 * adaptive threshold policy.
 */
export class ClusterStigmergy {
  private readonly local: StigmergyV5;
  private readonly localNodeId: string;
  private readonly remotes: CircularBuffer<RemoteTraceEntry>;
  private remoteRoots: Record<string, string> = {};

  constructor(options: ClusterStigmergyOptions) {
    this.local = options.local;
    this.localNodeId = options.localNodeId;
    this.remotes = new CircularBuffer<RemoteTraceEntry>(options.maxRemoteTraces ?? 512);
  }

  /** @returns Same reference as passed in options — for triad wiring. */
  getLocalStore(): StigmergyV5 {
    return this.local;
  }

  getLocalNodeId(): string {
    return this.localNodeId;
  }

  /**
   * Records a trace originating on a peer. Optional Merkle proof is accepted
   * for API stability; strict verification is a future v3.1 hardening step.
   */
  ingestRemoteTrace(
    nodeId: string,
    trace: PheromoneTrace,
    _proof?: MerkleInclusionProof,
  ): void {
    if (nodeId === this.localNodeId) return;
    this.remotes.push({
      nodeId,
      trace,
      receivedAt: new Date().toISOString(),
    });
    this.remoteRoots[nodeId] = trace.hash;
  }

  /** Updates gossiped Merkle tips without attaching full traces. */
  applyGossipedRoot(nodeId: string, root: string): void {
    if (!nodeId || !root) return;
    this.remoteRoots[nodeId] = root;
  }

  recordTrace(
    context: ContextTensor,
    synthesisVector: number[],
    metadata?: Record<string, unknown>,
  ): PheromoneTrace {
    const clusterMeta = {
      ...metadata,
      clusterNodeId: this.localNodeId,
    };
    return this.local.recordTrace(context, synthesisVector, clusterMeta);
  }

  getResonance(context: ContextTensor): ResonanceResult {
    return this.local.getResonance(context);
  }

  /**
   * Computes best resonance across local {@link StigmergyV5} **and** ingested
   * remote traces, using identical cosine + hysteresis policy as the local store.
   */
  getClusterResonance(context: ContextTensor): ResonanceResult {
    const localResult = this.local.getResonance(context);
    const threshold = this.local.getAdaptiveResonanceThreshold();
    const queryMag = magnitude(context);
    if (queryMag === 0) {
      return localResult;
    }

    let bestScore = localResult.score;
    let bestTrace = localResult.trace;
    let bestPositive = localResult.positiveFeedbackScore ?? this.local.getPositiveFeedbackHysteresisScore(bestScore);

    this.remotes.forEach(({ trace }) => {
      const { a: comparableContext, b: comparableTraceContext } = alignVectors(context, trace.context);
      const comparableQueryMag = comparableContext === context ? queryMag : magnitude(comparableContext);
      const traceMag = comparableTraceContext === trace.context
        ? trace.magnitude ?? magnitude(trace.context)
        : magnitude(comparableTraceContext);
      if (traceMag === 0 || comparableQueryMag === 0) return;

      const rawScore = cosineWithMagnitudes(
        comparableContext,
        comparableTraceContext,
        comparableQueryMag,
        traceMag,
      );
      const positive = this.local.getPositiveFeedbackHysteresisScore(rawScore);
      if (positive > bestPositive) {
        bestScore = rawScore;
        bestTrace = trace;
        bestPositive = positive;
      }
    });

    if (bestTrace && bestPositive >= threshold) {
      return {
        score: bestScore,
        trace: bestTrace,
        thresholdUsed: threshold,
        positiveFeedbackScore: bestPositive,
      };
    }
    return {
      score: 0,
      thresholdUsed: threshold,
      positiveFeedbackScore: bestPositive,
    };
  }

  getMerkleRoot(): string | undefined {
    return this.local.getMerkleRoot();
  }

  getClusterMerkleRoot(): string {
    const localRoot = this.local.getMerkleRoot();
    const foreign = Object.values(this.remoteRoots);
    return mergeRemoteRoots([localRoot, ...foreign]);
  }

  getRecent(limit = 5): PheromoneTrace[] {
    return this.local.getRecent(limit);
  }

  /** Canonical JSON payload for cross-node `writeTraceRemote` transports. */
  serialiseLocalTrace(trace: PheromoneTrace): Record<string, unknown> {
    return {
      nodeId: this.localNodeId,
      trace: serialiseTraceForCluster(trace),
      transportDigest: canonicalDigest({
        type: 'MCOP_CLUSTER_TRACE_PACKET',
        nodeId: this.localNodeId,
        trace: serialiseTraceForCluster(trace),
      }),
    };
  }
}
