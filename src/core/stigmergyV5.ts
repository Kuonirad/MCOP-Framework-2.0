import {
  ContextTensor,
  PheromoneTrace,
  ResonanceResult,
  ResonantRecentQueryOptions,
  ResonantRecentTrace,
} from './types';
import { cosineWithMagnitudes, magnitude, padVector } from './vectorMath';
import { CircularBuffer } from './circularBuffer';
import type { StigmergyStorageBackend } from './stigmergyBackend';
import { canonicalDigest } from './canonicalEncoding';
import { randomUuidV4 } from './uuid';
import { failTriadSpan, finishTriadSpan, startTriadSpan } from './observability';
import {
  DEFAULT_TEMPORAL_DYNAMICS,
  PheromoneLedger,
  type PheromoneStats,
  type TemporalDynamicsConfig,
} from './temporalStigmergy';

export interface StigmergyConfig {
  resonanceThreshold?: number;
  maxTraces?: number;
  adaptiveThreshold?: number | boolean; // 2026-05-03 audit → v2.2.1 (numeric override or boolean toggle)
  hysteresisBand?: number;
  calibrationWindow?: number;
  curiosityBonus?: number;
  /** Positive Feedback Hysteresis lift for high-resonance beneficial patterns. */
  growthBias?: number;
  /**
   * Temporal pheromone dynamics (advance #3). Off by default — when omitted or
   * `enabled: false`, Stigmergy behaves exactly as v5: weights are static and
   * recency is only a tiebreaker. When enabled, deposited trails evaporate with
   * a half-life and are reinforced on re-traversal. See `temporalStigmergy.ts`.
   */
  temporalDynamics?: TemporalDynamicsConfig;
  /**
   * Injectable millisecond clock for temporal dynamics, so decay/reinforcement
   * replay deterministically. Defaults to `Date.now`. Only consulted when
   * temporal dynamics are enabled.
   */
  now?: () => number;
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
  private readonly storage?: StigmergyStorageBackend;
  private readonly temporal: Required<TemporalDynamicsConfig>;
  private readonly pheromones?: PheromoneLedger;
  private readonly nowMs: () => number;

  constructor(config: StigmergyConfig & { storage?: StigmergyStorageBackend } = {}) {
    const adaptive = config.adaptiveThreshold;
    const numericAdaptive = typeof adaptive === 'number' ? adaptive : undefined;
    this.resonanceThreshold = clamp01(numericAdaptive ?? config.resonanceThreshold ?? 0.65);
    this.traces = new CircularBuffer<PheromoneTrace>(config.maxTraces ?? 2048);
    this.adaptiveThreshold = typeof adaptive === 'boolean' ? adaptive : true;
    this.hysteresisBand = Math.max(0, config.hysteresisBand ?? 0.05);
    this.calibrationWindow = Math.max(2, config.calibrationWindow ?? 32);
    this.lastAcceptedThreshold = this.resonanceThreshold;
    this.curiosityBonus = clamp01(config.curiosityBonus ?? 0.08);
    this.growthBias = clamp01(config.growthBias ?? 0.15);
    this.storage = config.storage;

    // Temporal pheromone dynamics (advance #3). Construct the ledger before
    // hydration so loaded traces lay down deposits too.
    this.temporal = { ...DEFAULT_TEMPORAL_DYNAMICS, ...(config.temporalDynamics ?? {}) };
    this.nowMs = config.now ?? (() => Date.now());
    if (this.temporal.enabled) {
      this.pheromones = new PheromoneLedger(this.temporal);
    }

    // Hydrate from durable backend if provided (important for organelle persistence across sessions)
    if (this.storage) {
      const loaded = this.storage.loadRecentTraces?.(this.traces.capacity) ?? [];
      if (Array.isArray(loaded)) {
        // oldest first for correct insertion order
        for (const t of [...loaded].reverse()) {
          const evicted = this.traces.push(t);
          if (this.pheromones) {
            this.pheromones.deposit(t.id, Math.max(0, t.weight), this.nowMs());
            if (evicted) this.pheromones.forget(evicted.id);
          }
        }
      }
    }
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
      const evicted = this.traces.push(trace);

      // Lay down the initial pheromone; forget any evicted trace so the ledger
      // stays bounded to the trace buffer.
      if (this.pheromones) {
        this.pheromones.deposit(id, Math.max(0, weight), this.nowMs());
        if (evicted) this.pheromones.forget(evicted.id);
      }

      // Write-through to durable backend (enables cross-session organelle memory)
      if (this.storage) {
        try {
          this.storage.appendTrace?.(trace);
        } catch (e) {
          // Telemetry / logging only — never break the deterministic path
          console.warn?.('[StigmergyV5] storage append failed', e);
        }
      }

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
        // Temporal dynamics: a resonant match is a re-traversal of the trail, so
        // reinforce it (decay-to-now + gain). Reported as pheromoneStrength.
        let pheromoneStrength: number | undefined;
        if (this.pheromones) {
          const now = this.nowMs();
          pheromoneStrength = this.temporal.reinforceOnResonance
            ? this.pheromones.reinforce(bestTrace.id, now)
            : this.pheromones.strength(bestTrace.id, now);
        }
        finishTriadSpan(span, {
          'mcop.resonance.score': bestScore,
          'mcop.resonance.positive_feedback_score': positiveFeedbackScore,
          'mcop.resonance.threshold': threshold,
          'mcop.resonance.matched': true,
        });
        return {
          score: bestScore,
          trace: bestTrace,
          thresholdUsed: threshold,
          positiveFeedbackScore,
          ...(pheromoneStrength !== undefined ? { pheromoneStrength } : {}),
        };
      }

      finishTriadSpan(span, {
        'mcop.resonance.score': 0,
        'mcop.resonance.positive_feedback_score': positiveFeedbackScore,
        'mcop.resonance.threshold': threshold,
        'mcop.resonance.matched': false,
      });
      return { score: 0, thresholdUsed: threshold, positiveFeedbackScore };
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
    // Single clock read for the whole ranking so every trace decays to the same
    // instant. Only consulted when temporal dynamics are enabled.
    const now = this.pheromones ? this.nowMs() : 0;
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

      // Temporal dynamics: fade the geometric score by the trail's current
      // pheromone strength so stale trails sink in the attention ranking. When
      // disabled, strengthFactor is 1 and behaviour is identical to v5.
      const strengthFactor = this.pheromones ? this.pheromones.strength(trace.id, now) : 1;
      const temporalScore = contextualScore * strengthFactor;

      const lowResonanceGap = Math.max(0, threshold - temporalScore);
      const curiosityLift = options.includeLowResonance === false
        ? 0
        : curiosity * lowResonanceGap;
      const rankedTrace: ResonantRecentTrace = {
        ...trace,
        resonanceScore: clamp01(temporalScore + curiosityLift),
        curiosityLift,
      };
      if (this.pheromones) rankedTrace.pheromoneStrength = strengthFactor;
      ranked.push({ trace: rankedTrace, insertionOrder });
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

  /* ---- Temporal pheromone dynamics (advance #3) ----------------------- */

  /** True when temporal evaporation/reinforcement is active. */
  isTemporalEnabled(): boolean {
    return this.pheromones !== undefined;
  }

  /**
   * Current decayed pheromone strength of a trace, or `undefined` when temporal
   * dynamics are disabled. A faded trail returns a low value (down to `floor`).
   */
  getPheromoneStrength(traceId: string): number | undefined {
    if (!this.pheromones) return undefined;
    return this.pheromones.strength(traceId, this.nowMs());
  }

  /**
   * Explicitly reinforce a trace (decay-to-now + gain), e.g. when a downstream
   * consumer confirms a trail was useful. Returns the new strength, or
   * `undefined` when temporal dynamics are disabled or the id is unknown.
   */
  reinforceTrace(traceId: string): number | undefined {
    if (!this.pheromones || !this.pheromones.has(traceId)) return undefined;
    return this.pheromones.reinforce(traceId, this.nowMs());
  }

  /**
   * Prune ledger entries whose strength has decayed to/below `minStrength` at
   * the current instant. Returns the pruned trace ids (empty when disabled).
   * Note: this prunes the *pheromone* layer only; the Merkle-sealed trace chain
   * is immutable and unaffected.
   */
  pruneFadedTraces(minStrength = 0): string[] {
    if (!this.pheromones) return [];
    return this.pheromones.prune(this.nowMs(), minStrength);
  }

  /** Aggregate pheromone statistics, or `undefined` when disabled. */
  getTemporalStats(): PheromoneStats | undefined {
    if (!this.pheromones) return undefined;
    return this.pheromones.stats(this.nowMs());
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
