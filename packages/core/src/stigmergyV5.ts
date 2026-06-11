import {
  ContextTensor,
  PheromoneTrace,
  RecordTraceOptions,
  ResonanceQueryOptions,
  ResonanceResult,
  ResonantRecentQueryOptions,
  ResonantRecentTrace,
} from './types';
import {
  analyticThreshold,
  effectiveTensorDimensions,
  SHA256_TENSOR_DIMENSIONS,
  type EncoderBackendKind,
  type NoiseFloorOptions,
} from './resonanceCalibration';
import { cosineWithMagnitudes, magnitude, padVector } from './vectorMath';
import { CircularBuffer } from './circularBuffer';
import { canonicalDigest } from './canonicalEncoding';
import { randomUUID } from 'node:crypto';

export interface NoiseFloorConfig extends NoiseFloorOptions {
  /**
   * Output dimensionality of the encoder feeding this memory. Hash-family
   * backends saturate at 32 effective dimensions (SHA-256 tiling), so this
   * only matters for the embedding backend.
   */
  tensorDimensions?: number;
  /** Encoder backend feeding this memory. Default `'hash'`. */
  backend?: EncoderBackendKind;
}

export interface StigmergyConfig {
  /**
   * Explicit base resonance threshold. When omitted, the threshold is no
   * longer a magic constant: it is derived analytically from the encoder's
   * unrelated-text null model via `analyticThreshold` so the false-resonance
   * rate is bounded at `noiseFloor.alpha` (default 1%) even at full buffer
   * occupancy. See `resonanceCalibration.ts` for the derivation.
   */
  resonanceThreshold?: number;
  maxTraces?: number;
  /**
   * Tunes the analytic noise floor used when `resonanceThreshold` is omitted.
   * `candidates` defaults to the trace-buffer capacity (worst case: a query
   * scans a full buffer of unrelated traces).
   */
  noiseFloor?: NoiseFloorConfig;
  adaptiveThreshold?: number | boolean; // 2026-05-03 audit → v2.2.1 (numeric override or boolean toggle)
  hysteresisBand?: number;
  calibrationWindow?: number;
  curiosityBonus?: number;
  /** Positive Feedback Hysteresis lift for high-resonance beneficial patterns. */
  growthBias?: number;
}

export class StigmergyV5 {
  private readonly resonanceThreshold: number;
  private readonly traces: CircularBuffer<PheromoneTrace>;
  private readonly adaptiveThreshold: boolean;
  private readonly hysteresisBand: number;
  private readonly calibrationWindow: number;
  private lastAcceptedThreshold: number;
  private readonly curiosityBonus: number;
  private readonly growthBias: number;

  constructor(config: StigmergyConfig = {}) {
    const adaptive = config.adaptiveThreshold;
    const numericAdaptive = typeof adaptive === 'number' ? adaptive : undefined;
    const noiseFloor = config.noiseFloor ?? {};
    const calibratedFloor = analyticThreshold(
      effectiveTensorDimensions(
        noiseFloor.backend ?? 'hash',
        noiseFloor.tensorDimensions ?? SHA256_TENSOR_DIMENSIONS,
      ),
      {
        alpha: noiseFloor.alpha,
        candidates: noiseFloor.candidates ?? config.maxTraces ?? 2048,
      },
    );
    this.resonanceThreshold = clamp01(numericAdaptive ?? config.resonanceThreshold ?? calibratedFloor);
    this.traces = new CircularBuffer<PheromoneTrace>(config.maxTraces ?? 2048);
    this.adaptiveThreshold = typeof adaptive === 'boolean' ? adaptive : true;
    this.hysteresisBand = Math.max(0, config.hysteresisBand ?? 0.05);
    this.calibrationWindow = Math.max(2, config.calibrationWindow ?? 32);
    this.lastAcceptedThreshold = this.resonanceThreshold;
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
    options?: RecordTraceOptions,
  ): PheromoneTrace {
    const semanticContext = options?.semanticContext;
    const parentHash = this.traces.last()?.hash;
    const id = randomUUID();

    const contextMag = magnitude(context);
    const synthesisMag = magnitude(synthesisVector);
    const { a: comparableContext, b: comparableSynthesis } = alignVectors(context, synthesisVector);
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

    // Dual-key binding: when a semantic (embedding) key accompanies the
    // hash key, both are sealed under one canonical digest. Omitting the
    // field entirely keeps single-key hashes byte-identical to v5.
    const payload = semanticContext !== undefined
      ? { id, context, synthesisVector, metadata, weight, semanticContext }
      : { id, context, synthesisVector, metadata, weight };
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
    if (semanticContext !== undefined) {
      trace.semanticContext = semanticContext;
      trace.semanticMagnitude = magnitude(semanticContext);
    }

    // O(1): CircularBuffer replaces the previous O(n) Array.shift() pattern.
    this.traces.push(trace);

    return trace;
  }

  getResonance(context: ContextTensor, options: ResonanceQueryOptions = {}): ResonanceResult {
    const keyspace = options.keyspace ?? 'context';
    const queryMag = magnitude(context);
    if (queryMag === 0) {
      return { score: 0, thresholdUsed: this.resonanceThreshold };
    }

    let bestScore = 0;
    let bestTrace: PheromoneTrace | undefined;

    this.traces.forEach((trace) => {
      // Dual-key dispatch: semantic queries match the embedding key and
      // skip traces sealed without one; context queries are unchanged.
      const keyVector = keyspace === 'semantic' ? trace.semanticContext : trace.context;
      if (!keyVector) return;
      const cachedKeyMag = keyspace === 'semantic' ? trace.semanticMagnitude : trace.magnitude;
      const { a: comparableContext, b: comparableTraceContext } = alignVectors(context, keyVector);
      const comparableQueryMag = comparableContext === context
        ? queryMag
        : magnitude(comparableContext);
      const traceMag = comparableTraceContext === keyVector
        ? cachedKeyMag ?? magnitude(keyVector)
        : magnitude(comparableTraceContext);
      if (traceMag === 0 || comparableQueryMag === 0) return;

      const score = cosineWithMagnitudes(
        comparableContext,
        comparableTraceContext,
        comparableQueryMag,
        traceMag,
      );
      const positiveScore = this.getPositiveFeedbackHysteresisScore(score);
      if (positiveScore > this.getPositiveFeedbackHysteresisScore(bestScore)) {
        bestScore = score;
        bestTrace = trace;
      }
    });

    const threshold = this.getAdaptiveResonanceThreshold();
    const positiveFeedbackScore = this.getPositiveFeedbackHysteresisScore(bestScore);
    if (bestTrace && positiveFeedbackScore >= threshold) {
      this.lastAcceptedThreshold = threshold;
      return {
        score: bestScore,
        trace: bestTrace,
        thresholdUsed: threshold,
        positiveFeedbackScore,
      };
    }

    return { score: 0, thresholdUsed: threshold, positiveFeedbackScore };
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
    const ranked: Array<{ trace: ResonantRecentTrace; insertionOrder: number }> = [];

    this.traces.forEach((trace, insertionOrder) => {
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
          : Math.max(0, this.getPositiveFeedbackHysteresisScore(cosineWithMagnitudes(
            comparableContext,
            comparableTraceContext,
            comparableQueryMag,
            traceMag,
          )));
      }

      const lowResonanceGap = Math.max(0, threshold - contextualScore);
      const curiosityLift = options.includeLowResonance === false
        ? 0
        : curiosity * lowResonanceGap;
      ranked.push({
        trace: {
          ...trace,
          resonanceScore: clamp01(contextualScore + curiosityLift),
          curiosityLift,
        },
        insertionOrder,
      });
    });

    ranked.sort((a, b) =>
      b.trace.resonanceScore - a.trace.resonanceScore ||
      b.insertionOrder - a.insertionOrder,
    );
    return ranked.slice(0, safeLimit).map(({ trace }) => trace);
  }

  /** Observability: expose buffer fill statistics for dashboards. */
  getBufferStats(): { size: number; capacity: number; lifetimePushes: number } {
    return {
      size: this.traces.size,
      capacity: this.traces.capacity,
      lifetimePushes: this.traces.lifetimePushes,
    };
  }

  /**
   * Positive Feedback Hysteresis gently lifts beneficial high-resonance scores
   * above the current accepted threshold while preserving raw cosine traces.
   */
  getPositiveFeedbackHysteresisScore(score: number): number {
    const raw = clamp01(score);
    const lift = Math.max(0, raw - this.lastAcceptedThreshold) * this.growthBias;
    return clamp01(raw + lift);
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
