import {
  ContextTensor,
  PheromoneTrace,
  ResonanceResult,
  ResonantRecentQueryOptions,
  ResonantRecentTrace,
} from './types';
import { cosineWithMagnitudes, magnitude, padVector } from './vectorMath';
import { CircularBuffer } from './circularBuffer';
import { canonicalDigest } from './canonicalEncoding';
import { randomUuidV4 } from './uuid';
import { failTriadSpan, finishTriadSpan, startTriadSpan } from './observability';

export interface StigmergyConfig {
  resonanceThreshold?: number;
  maxTraces?: number;
  adaptiveThreshold?: number | boolean; // 2026-05-03 audit → v2.2.1 (numeric override or boolean toggle)
  hysteresisBand?: number;
  calibrationWindow?: number;
  curiosityBonus?: number;
}

export class StigmergyV5 {
  private readonly resonanceThreshold: number;
  private readonly traces: CircularBuffer<PheromoneTrace>;
  private readonly adaptiveThreshold: boolean;
  private readonly hysteresisBand: number;
  private readonly calibrationWindow: number;
  private lastAcceptedThreshold: number;
  private readonly curiosityBonus: number;

  constructor(config: StigmergyConfig = {}) {
    const adaptive = config.adaptiveThreshold;
    const numericAdaptive = typeof adaptive === 'number' ? adaptive : undefined;
    this.resonanceThreshold = clamp01(numericAdaptive ?? config.resonanceThreshold ?? 0.65);
    this.traces = new CircularBuffer<PheromoneTrace>(config.maxTraces ?? 2048);
    this.adaptiveThreshold = typeof adaptive === 'boolean' ? adaptive : true;
    this.hysteresisBand = Math.max(0, config.hysteresisBand ?? 0.05);
    this.calibrationWindow = Math.max(2, config.calibrationWindow ?? 32);
    this.lastAcceptedThreshold = this.resonanceThreshold;
    this.curiosityBonus = clamp01(config.curiosityBonus ?? 0.08);
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
    const span = startTriadSpan('mcop.triad.trace.record', {
      'mcop.tensor.context_dimensions': context.length,
      'mcop.tensor.synthesis_dimensions': synthesisVector.length,
      'mcop.trace.has_metadata': metadata !== undefined,
    });
    try {
      const parentHash = this.traces.last()?.hash;
      const id = randomUuidV4();

      const contextMag = magnitude(context);
      const synthesisMag = magnitude(synthesisVector);
      const { a: comparableContext, b: comparableSynthesis } =
        alignVectors(context, synthesisVector);
      const comparableContextMag = comparableContext === context
        ? contextMag
        : magnitude(comparableContext);
      const comparableSynthesisMag = comparableSynthesis === synthesisVector
        ? synthesisMag
        : magnitude(comparableSynthesis);
      const weight = cosineWithMagnitudes(
        comparableContext,
        comparableSynthesis,
        comparableContextMag,
        comparableSynthesisMag,
      );

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

      finishTriadSpan(span, {
        'mcop.trace.weight': trace.weight,
        'mcop.trace.has_parent': parentHash !== undefined,
        'mcop.trace.buffer_size': this.traces.size,
      });
      return trace;
    } catch (error) {
      failTriadSpan(span, error);
      throw error;
    }
  }

  getResonance(context: ContextTensor): ResonanceResult {
    const span = startTriadSpan('mcop.triad.resonance.query', {
      'mcop.tensor.context_dimensions': context.length,
    });
    try {
      const queryMag = magnitude(context);
      if (queryMag === 0) {
        finishTriadSpan(span, {
          'mcop.resonance.score': 0,
          'mcop.resonance.matched': false,
        });
        return { score: 0, thresholdUsed: this.resonanceThreshold };
      }

      let bestScore = 0;
      let bestTrace: PheromoneTrace | undefined;

      this.traces.forEach((trace) => {
        const { a: comparableContext, b: comparableTraceContext } =
          alignVectors(context, trace.context);
        const comparableQueryMag = comparableContext === context
          ? queryMag
          : magnitude(comparableContext);
        const traceMag = comparableTraceContext === trace.context
          ? trace.magnitude ?? magnitude(trace.context)
          : magnitude(comparableTraceContext);
        if (traceMag === 0 || comparableQueryMag === 0) return;

        const score = cosineWithMagnitudes(
          comparableContext,
          comparableTraceContext,
          comparableQueryMag,
          traceMag,
        );
        if (score > bestScore) {
          bestScore = score;
          bestTrace = trace;
        }
      });

      const threshold = this.getAdaptiveResonanceThreshold();
      if (bestTrace && bestScore >= threshold) {
        this.lastAcceptedThreshold = threshold;
        finishTriadSpan(span, {
          'mcop.resonance.score': bestScore,
          'mcop.resonance.threshold': threshold,
          'mcop.resonance.matched': true,
        });
        return { score: bestScore, trace: bestTrace, thresholdUsed: threshold };
      }

      finishTriadSpan(span, {
        'mcop.resonance.score': 0,
        'mcop.resonance.threshold': threshold,
        'mcop.resonance.matched': false,
      });
      return { score: 0, thresholdUsed: threshold };
    } catch (error) {
      failTriadSpan(span, error);
      throw error;
    }
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

    const threshold = this.getAdaptiveResonanceThreshold();
    const queryMag = options.context ? magnitude(options.context) : 0;
    const curiosity = clamp01(options.curiosityBonus ?? this.curiosityBonus);
    const ranked: ResonantRecentTrace[] = [];

    this.traces.forEach((trace) => {
      let contextualScore = Math.max(0, trace.weight);
      if (options.context && queryMag > 0) {
        const { a: comparableContext, b: comparableTraceContext } =
          alignVectors(options.context, trace.context);
        const comparableQueryMag = comparableContext === options.context
          ? queryMag
          : magnitude(comparableContext);
        const traceMag = comparableTraceContext === trace.context
          ? trace.magnitude ?? magnitude(trace.context)
          : magnitude(comparableTraceContext);
        contextualScore = traceMag === 0 || comparableQueryMag === 0
          ? 0
          : Math.max(0, cosineWithMagnitudes(
            comparableContext,
            comparableTraceContext,
            comparableQueryMag,
            traceMag,
          ));
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
    });

    ranked.sort((a, b) => b.resonanceScore - a.resonanceScore ||
      Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return ranked.slice(0, safeLimit);
  }

  /** Observability: expose buffer fill statistics for dashboards. */
  getBufferStats(): { size: number; capacity: number; lifetimePushes: number } {
    return {
      size: this.traces.size,
      capacity: this.traces.capacity,
      lifetimePushes: this.traces.lifetimePushes,
    };
  }

  getAdaptiveResonanceThreshold(): number {
    if (!this.adaptiveThreshold) return this.resonanceThreshold;
    const recentWeights = this.traces
      .recent(this.calibrationWindow)
      .map((trace) => Math.max(0, trace.weight))
      .filter(Number.isFinite);
    if (recentWeights.length < 3) return this.resonanceThreshold;

    let sum = 0;
    for (const weight of recentWeights) sum += weight;
    const mean = sum / recentWeights.length;
    let variance = 0;
    for (const weight of recentWeights) {
      const delta = weight - mean;
      variance += delta * delta;
    }
    const stddev = Math.sqrt(variance / recentWeights.length);
    const calibrated = clamp01(mean - stddev * 0.5);
    if (Math.abs(calibrated - this.lastAcceptedThreshold) < this.hysteresisBand) {
      return this.lastAcceptedThreshold;
    }
    return calibrated;
  }
}

function alignVectors(a: ContextTensor, b: number[]): { a: number[] | ContextTensor; b: number[] } {
  if (a.length === b.length) return { a, b };
  const length = Math.max(a.length, b.length);
  return {
    a: padVector(a, length),
    b: padVector(b, length),
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
