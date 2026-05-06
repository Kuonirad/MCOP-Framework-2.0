import { randomUUID } from 'node:crypto';
import { canonicalDigest } from './canonicalEncoding';
import {
  ContextTensor,
  PheromoneTrace,
  ResonanceResult,
  ResonantRecentQueryOptions,
  ResonantRecentTrace,
} from './types';
import { cosineWithMagnitudes, magnitude } from './vectorMath';
import { CircularBuffer } from './circularBuffer';

export interface StigmergyConfig {
  resonanceThreshold?: number;
  adaptiveThreshold?: number; // 2026-05-03 audit → v2.2.1
  maxTraces?: number;
  curiosityBonus?: number;
  /** Positive Feedback Hysteresis lift for high-resonance beneficial patterns. */
  growthBias?: number;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export class StigmergyV5 {
  private readonly resonanceThreshold: number;
  private readonly traces: CircularBuffer<PheromoneTrace>;
  private readonly curiosityBonus: number;
  private readonly growthBias: number;

  constructor(config: StigmergyConfig = {}) {
    this.resonanceThreshold = config.adaptiveThreshold ?? config.resonanceThreshold ?? 0.65;
    this.traces = new CircularBuffer<PheromoneTrace>(config.maxTraces ?? 2048);
    this.curiosityBonus = clamp01(config.curiosityBonus ?? 0.08);
    this.growthBias = clamp01(config.growthBias ?? 0.15);
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
      const positiveScore = this.getPositiveFeedbackHysteresisScore(score);
      if (positiveScore > this.getPositiveFeedbackHysteresisScore(bestScore)) {
        bestScore = score;
        bestTrace = trace;
      }
    }

    const positiveFeedbackScore = this.getPositiveFeedbackHysteresisScore(bestScore);
    if (bestTrace && positiveFeedbackScore >= this.resonanceThreshold) {
      return {
        score: bestScore,
        trace: bestTrace,
        thresholdUsed: this.resonanceThreshold,
        positiveFeedbackScore,
      };
    }

    return { score: 0, thresholdUsed: this.resonanceThreshold, positiveFeedbackScore };
  }

  getMerkleRoot(): string | undefined {
    return this.traces.last()?.hash;
  }

  getRecent(limit = 5): PheromoneTrace[] {
    return this.traces.recent(limit);
  }

  /**
   * ResonantRecentQuery — newest traces become a living attention surface.
   * High-weight traces are surfaced first while low-resonance domains receive
   * a bounded curiosity lift, encouraging safe exploration instead of crashes
   * or overly rigid exploitation.
   */
  getResonantRecent(
    limit = 5,
    options: ResonantRecentQueryOptions = {},
  ): ResonantRecentTrace[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : this.traces.size;
    if (safeLimit === 0) return [];

    const threshold = this.resonanceThreshold;
    const queryMag = options.context ? magnitude(options.context) : 0;
    const curiosity = clamp01(options.curiosityBonus ?? this.curiosityBonus);
    const ranked: ResonantRecentTrace[] = [];

    for (const trace of this.traces.values()) {
      let contextualScore = Math.max(0, trace.weight);
      if (options.context && queryMag > 0) {
        const traceMag = trace.magnitude ?? magnitude(trace.context);
        contextualScore = traceMag === 0
          ? 0
          : Math.max(0, this.getPositiveFeedbackHysteresisScore(cosineWithMagnitudes(
            options.context,
            trace.context,
            queryMag,
            traceMag,
          )));
      }

      const lowResonanceGap = Math.max(0, threshold - contextualScore);
      const curiosityLift = options.includeLowResonance === false
        ? 0
        : curiosity * lowResonanceGap;
      ranked.push({
        ...trace,
        resonanceScore: clamp01(contextualScore + curiosityLift),
        curiosityLift,
      });
    }

    ranked.sort((a, b) => b.resonanceScore - a.resonanceScore ||
      Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return ranked.slice(0, safeLimit);
  }


  /**
   * Positive Feedback Hysteresis gently lifts beneficial high-resonance scores
   * above the configured threshold while preserving raw cosine traces.
   */
  getPositiveFeedbackHysteresisScore(score: number): number {
    const raw = clamp01(score);
    const lift = Math.max(0, raw - this.resonanceThreshold) * this.growthBias;
    return clamp01(raw + lift);
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
