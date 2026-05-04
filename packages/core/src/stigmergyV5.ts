import { randomUUID } from 'node:crypto';
import { canonicalDigest } from './canonicalEncoding';
import { ContextTensor, PheromoneTrace, ResonanceResult } from './types';
import { cosineWithMagnitudes, magnitude } from './vectorMath';
import { CircularBuffer } from './circularBuffer';

export interface StigmergyConfig {
  resonanceThreshold?: number;
  adaptiveThreshold?: number; // 2026-05-03 audit → v2.2.1
  maxTraces?: number;
}

export class StigmergyV5 {
  private readonly resonanceThreshold: number;
  private readonly traces: CircularBuffer<PheromoneTrace>;

  constructor(config: StigmergyConfig = {}) {
    this.resonanceThreshold = config.adaptiveThreshold ?? config.resonanceThreshold ?? 0.65;
    this.traces = new CircularBuffer<PheromoneTrace>(config.maxTraces ?? 2048);
  }

  private merkleHash(payload: unknown, parentHash?: string): string {
    // RFC 8785 canonical JSON keeps this hash byte-identical across
    // runtimes (TS ↔ Python) and engine versions. See
    // `canonicalEncoding.ts` for the rationale.
    return canonicalDigest({ payload, parentHash: parentHash ?? null });
  }

  recordTrace(
    context: ContextTensor,
    synthesisVector: number[],
    metadata?: Record<string, unknown>,
  ): PheromoneTrace {
    const parentHash = this.traces.last()?.hash;
    const id = randomUUID();

    const contextMag = magnitude(context);
    const synthesisMag = magnitude(synthesisVector);
    const weight = cosineWithMagnitudes(context, synthesisVector, contextMag, synthesisMag);

    const payload = { id, context, synthesisVector, metadata, weight };
    const hash = this.merkleHash(payload, parentHash);

    const trace: PheromoneTrace = {
      id,
      hash,
      parentHash,
      context,
      magnitude: contextMag,
      synthesisVector,
      weight,
      metadata,
      timestamp: new Date().toISOString(),
    };

    // O(1): CircularBuffer replaces the previous O(n) Array.shift() pattern.
    this.traces.push(trace);

    return trace;
  }

  getResonance(context: ContextTensor): ResonanceResult {
    const queryMag = magnitude(context);
    if (queryMag === 0) return { score: 0, thresholdUsed: this.resonanceThreshold };

    let bestScore = 0;
    let bestTrace: PheromoneTrace | undefined;

    for (const trace of this.traces.values()) {
      const traceMag = trace.magnitude ?? magnitude(trace.context);
      if (traceMag === 0) continue;

      const score = cosineWithMagnitudes(context, trace.context, queryMag, traceMag);
      if (score > bestScore) {
        bestScore = score;
        bestTrace = trace;
      }
    }

    if (bestTrace && bestScore >= this.resonanceThreshold) {
      return { score: bestScore, trace: bestTrace, thresholdUsed: this.resonanceThreshold };
    }

    return { score: 0, thresholdUsed: this.resonanceThreshold };
  }

  getMerkleRoot(): string | undefined {
    return this.traces.last()?.hash;
  }

  getRecent(limit = 5): PheromoneTrace[] {
    return this.traces.recent(limit);
  }

  /** Observability: expose buffer fill statistics for dashboards. */
  getBufferStats(): { size: number; capacity: number; lifetimePushes: number } {
    return {
      size: this.traces.size,
      capacity: this.traces.capacity,
      lifetimePushes: this.traces.lifetimePushes,
    };
  }
}
