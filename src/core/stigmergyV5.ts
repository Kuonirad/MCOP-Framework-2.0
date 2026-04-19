import crypto from 'crypto';
import { ContextTensor, PheromoneTrace, ResonanceResult } from './types';

export interface StigmergyConfig {
  resonanceThreshold?: number;
  maxTraces?: number;
}

export class StigmergyV5 {
  private readonly resonanceThreshold: number;
  private readonly maxTraces: number;
  private traces: PheromoneTrace[] = [];

  constructor(config: StigmergyConfig = {}) {
    this.resonanceThreshold = config.resonanceThreshold ?? 0.5;
    this.maxTraces = config.maxTraces ?? 2048;
  }

  private getMagnitude(vector: ContextTensor): number {
    let sumSq = 0;
    const len = vector.length;
    for (let i = 0; i < len; i++) {
      sumSq += vector[i] * vector[i];
    }
    return Math.sqrt(sumSq);
  }

  // Optimized cosine similarity using pre-calculated magnitudes
  private cosineWithMagnitudes(
    a: ContextTensor,
    b: ContextTensor,
    magA: number,
    magB: number
  ): number {
    if (!magA || !magB) return 0;

    const lenA = a.length;
    const lenB = b.length;
    const minLen = lenA < lenB ? lenA : lenB;

    let dot = 0;
    for (let i = 0; i < minLen; i++) {
      dot += a[i] * b[i];
    }

    return dot / (magA * magB);
  }

  private cosine(a: ContextTensor, b: ContextTensor, magA?: number, magB?: number): number {
    const minLen = Math.min(a.length, b.length);

    // Optimization: Use pre-calculated magnitudes if vectors are equal length
    if (magA !== undefined && magB !== undefined && a.length === b.length) {
      let dot = 0;
      for (let i = 0; i < minLen; i++) {
        dot += a[i] * b[i];
      }
      // Avoid division by zero
      if (magA === 0 || magB === 0) return 0;
      return dot / (magA * magB);
    }

    // Standard path (lengths differ or no pre-calc)
    if (magA !== undefined && magB !== undefined) {
      let dot = 0;
      for (let i = 0; i < minLen; i++) {
        dot += a[i] * b[i];
      }
      if (!magA || !magB) return 0;
      return dot / (magA * magB);
    }

    // Fallback to original calculation if magnitudes are missing
    let dot = 0;
    let sumSqA = 0;
    let sumSqB = 0;
    for (let i = 0; i < minLen; i++) {
      dot += a[i] * b[i];
      sumSqA += a[i] * a[i];
      sumSqB += b[i] * b[i];
    }
    if (sumSqA === 0 || sumSqB === 0) return 0;
    return dot / (Math.sqrt(sumSqA) * Math.sqrt(sumSqB));
  }

  private merkleHash(payload: unknown, parentHash?: string): string {
    const raw = JSON.stringify({ payload, parentHash });
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  recordTrace(context: ContextTensor, synthesisVector: number[], metadata?: Record<string, unknown>): PheromoneTrace {
    const parentHash = this.traces.at(-1)?.hash;
    // Security: Use crypto.randomUUID() instead of Math.random() for cryptographically strong IDs
    const id = crypto.randomUUID();

    // Calculate magnitudes once
    const contextMag = this.getMagnitude(context);
    const synthesisMag = this.getMagnitude(synthesisVector);

    const weight = this.cosineWithMagnitudes(context, synthesisVector, contextMag, synthesisMag);

    const payload = { id, context, synthesisVector, metadata, weight };
    const hash = this.merkleHash(payload, parentHash);

    const trace: PheromoneTrace = {
      id,
      hash,
      parentHash,
      context,
      magnitude: contextMag, // Cache the magnitude
      synthesisVector,
      weight,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.traces.push(trace);
    if (this.traces.length > this.maxTraces) {
      this.traces.shift();
    }

    return trace;
  }

  getResonance(context: ContextTensor): ResonanceResult {
    // Calculate query magnitude once
    const queryMag = this.getMagnitude(context);

    // Optimization: Skip if query vector is zero
    if (queryMag === 0) return { score: 0 };

    let bestScore = 0;
    let bestTrace: PheromoneTrace | undefined;

    const qLen = context.length;

    // Use a standard loop for performance
    const traceCount = this.traces.length;
    for (let t = 0; t < traceCount; t++) {
      const trace = this.traces[t];
      const tContext = trace.context;

      // Use cached magnitude if available, otherwise calculate it
      const traceMag = trace.magnitude ?? this.getMagnitude(tContext);

      if (traceMag === 0) continue;

      // Inline dot product for maximum performance
      const tLen = tContext.length;
      const minLen = qLen < tLen ? qLen : tLen;

      let dot = 0;
      for (let i = 0; i < minLen; i++) {
        dot += context[i] * tContext[i];
      }

      const score = dot / (queryMag * traceMag);

      if (score > bestScore) {
        bestScore = score;
        bestTrace = trace;
      }
    }

    if (bestTrace && bestScore >= this.resonanceThreshold) {
      return { score: bestScore, trace: bestTrace };
    }

    return { score: 0 };
  }

  getMerkleRoot(): string | undefined {
    return this.traces.at(-1)?.hash;
  }

  getRecent(limit = 5): PheromoneTrace[] {
    return this.traces.slice(-limit).reverse();
  }
}
