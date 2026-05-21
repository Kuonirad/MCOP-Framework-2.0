/**
 * Drift Sentinel Kernel — first-class MCOP module.
 *
 * Continuously computes the divergence Δ(T_d, B_e) between the declared
 * task embedding (T_d) and the observed ensemble-behavior embedding
 * (B_e), and turns statistically significant drift into:
 *
 *   1. Stigmergic signals — exposed via {@link consumeStigmergicEvents}
 *      so callers can replay them into StigmergyV5 / HolographicEtch
 *      continuous-learning loops.
 *   2. Divergence Telemetry — {@link getTelemetry} returns a snapshot
 *      suitable for corpus-health dashboards and risk indexing.
 *   3. Escalation hints — {@link DriftSentinelEvent.escalation} suggests
 *      either a lighter-weight Council review path or human review.
 *   4. Merkle-linked rewind — every event carries `parentHash` and a
 *      canonical `hash` so the full chain can be replayed back to the
 *      exact reasoning step where divergence crossed threshold.
 *
 * Scoping note (kept honest):
 *   This kernel detects the indirect-injection class that produces
 *   visible task-behavior drift (poisoned retrieval, tool output, RAG
 *   corpora). It is NOT a general-purpose injection firewall — direct
 *   input-layer injection, correlated jailbreaks, and below-threshold
 *   mimicry remain out of scope.
 */

import { CircularBuffer } from './circularBuffer';
import { canonicalDigest } from './canonicalEncoding';
import { cosineWithMagnitudes, magnitude } from './vectorMath';
import type { ContextTensor } from './types';

export type DriftSeverity = 'nominal' | 'watch' | 'elevated' | 'critical';

export type DriftEscalation =
  | { kind: 'none' }
  | { kind: 'lightweight-review'; reason: string }
  | { kind: 'human-review'; reason: string };

export interface DriftSentinelConfig {
  /**
   * Sensitivity floor for Δ. Distances below this are always classified
   * as `nominal`, regardless of statistical fit. Range [0, 1].
   */
  baseSensitivity?: number;
  /**
   * Multiplier on the rolling standard deviation used as the dynamic
   * threshold (μ + sigmaMultiplier·σ). 2.0 ≈ 2-sigma flagging.
   */
  sigmaMultiplier?: number;
  /**
   * Hard ceiling above which an event is always `critical` and escalated
   * to human review, irrespective of statistics. Range [0, 1].
   */
  criticalCeiling?: number;
  /**
   * Severity at and above which a stigmergic signal is emitted.
   * Defaults to `'elevated'`.
   */
  stigmergicSignalFloor?: DriftSeverity;
  /** Maximum retained events (events ring). */
  maxEvents?: number;
  /** Maximum pending stigmergic events queued for downstream consumption. */
  maxPendingSignals?: number;
}

export interface DriftObservation {
  /**
   * Declared-task tensor T_d. Anchors what the caller *said* they were
   * doing — e.g. the system+user prompt embedding.
   */
  declaredTask: ContextTensor;
  /**
   * One or more ensemble-behavior tensors B_e, typically per-model
   * synthesis vectors from the Council. The mean is used as the
   * effective behavior vector.
   */
  ensembleBehavior: ContextTensor[];
  /** Optional anchor pointing to the reasoning step that produced B_e. */
  reasoningStepId?: string;
  /** Free-form caller metadata. Surfaced verbatim on the event. */
  metadata?: Record<string, unknown>;
}

export interface DriftSentinelEvent {
  /** Canonical digest of the event payload (RFC 8785 JCS). */
  readonly hash: string;
  /** Hash of the previous event in the chain (Merkle linkage). */
  readonly parentHash?: string;
  /** Δ(T_d, B_e) as cosine distance in [0, 1]. */
  readonly delta: number;
  /** Rolling baseline mean Δ at the time of evaluation. */
  readonly baselineMean: number;
  /** Rolling baseline σ at the time of evaluation. */
  readonly baselineStd: number;
  /** Z-score of Δ vs. the rolling baseline. */
  readonly zScore: number;
  /** Dynamic threshold (μ + sigmaMultiplier·σ) actually applied. */
  readonly dynamicThreshold: number;
  readonly severity: DriftSeverity;
  readonly escalation: DriftEscalation;
  /** Pointer back into the reasoning trace, if supplied. */
  readonly reasoningStepId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: string;
}

export interface DriftTelemetrySnapshot {
  readonly observedCount: number;
  readonly flaggedCount: number;
  readonly criticalCount: number;
  readonly baselineMean: number;
  readonly baselineStd: number;
  readonly lastDelta?: number;
  readonly lastSeverity?: DriftSeverity;
  readonly histogram: ReadonlyArray<{ bucket: string; count: number }>;
  readonly chainHead?: string;
}

const DEFAULT_HISTOGRAM_EDGES: ReadonlyArray<[string, number]> = [
  ['0.0-0.1', 0.1],
  ['0.1-0.2', 0.2],
  ['0.2-0.4', 0.4],
  ['0.4-0.6', 0.6],
  ['0.6-0.8', 0.8],
  ['0.8-1.0', 1.0001],
];

const SEVERITY_ORDER: Record<DriftSeverity, number> = {
  nominal: 0,
  watch: 1,
  elevated: 2,
  critical: 3,
};

export class DriftSentinelKernel {
  private readonly baseSensitivity: number;
  private readonly sigmaMultiplier: number;
  private readonly criticalCeiling: number;
  private readonly stigmergicSignalFloor: DriftSeverity;
  private readonly events: CircularBuffer<DriftSentinelEvent>;
  private readonly pendingSignals: CircularBuffer<DriftSentinelEvent>;
  private readonly histogramCounts: number[];

  private observedCount = 0;
  private flaggedCount = 0;
  private criticalCount = 0;
  private rollingMean = 0;
  private rollingM2 = 0; // Welford's online variance accumulator.
  private chainHead?: string;

  constructor(config: DriftSentinelConfig = {}) {
    this.baseSensitivity = clamp01(config.baseSensitivity ?? 0.15);
    this.sigmaMultiplier = Number.isFinite(config.sigmaMultiplier)
      ? Math.max(0, config.sigmaMultiplier as number)
      : 2.0;
    this.criticalCeiling = clamp01(config.criticalCeiling ?? 0.6);
    this.stigmergicSignalFloor = config.stigmergicSignalFloor ?? 'elevated';
    this.events = new CircularBuffer<DriftSentinelEvent>(config.maxEvents ?? 1024);
    this.pendingSignals = new CircularBuffer<DriftSentinelEvent>(
      config.maxPendingSignals ?? 256,
    );
    this.histogramCounts = new Array<number>(DEFAULT_HISTOGRAM_EDGES.length).fill(0);
  }

  /**
   * Observe a (T_d, B_e) pair, log the divergence, and — when warranted —
   * emit a stigmergic signal plus an escalation hint.
   */
  observe(input: DriftObservation): DriftSentinelEvent {
    if (input.ensembleBehavior.length === 0) {
      throw new Error('DriftSentinelKernel.observe requires at least one B_e tensor');
    }
    const behaviorMean = meanVector(input.ensembleBehavior);
    const delta = cosineDistance(input.declaredTask, behaviorMean);

    const priorN = this.observedCount;
    const baselineMean = priorN > 0 ? this.rollingMean : 0;
    const baselineStd = priorN > 1 ? Math.sqrt(this.rollingM2 / (priorN - 1)) : 0;
    const dynamicThreshold = Math.max(
      this.baseSensitivity,
      baselineMean + this.sigmaMultiplier * baselineStd,
    );
    const zScore = baselineStd > 0 ? (delta - baselineMean) / baselineStd : 0;

    const severity = classifySeverity(
      delta,
      dynamicThreshold,
      this.criticalCeiling,
      this.baseSensitivity,
    );
    const escalation = recommendEscalation(severity, delta, this.criticalCeiling);

    const timestamp = new Date().toISOString();
    const payload = {
      delta,
      baselineMean,
      baselineStd,
      zScore,
      dynamicThreshold,
      severity,
      reasoningStepId: input.reasoningStepId ?? null,
      metadata: input.metadata ?? null,
      parentHash: this.chainHead ?? null,
      timestamp,
    };
    const hash = canonicalDigest(payload);

    const event: DriftSentinelEvent = {
      hash,
      parentHash: this.chainHead,
      delta,
      baselineMean,
      baselineStd,
      zScore,
      dynamicThreshold,
      severity,
      escalation,
      reasoningStepId: input.reasoningStepId,
      metadata: input.metadata,
      timestamp,
    };

    this.events.push(event);
    this.chainHead = hash;
    this.observedCount += 1;
    if (severity !== 'nominal') this.flaggedCount += 1;
    if (severity === 'critical') this.criticalCount += 1;
    this.updateRollingStats(delta);
    this.recordHistogram(delta);

    if (SEVERITY_ORDER[severity] >= SEVERITY_ORDER[this.stigmergicSignalFloor]) {
      this.pendingSignals.push(event);
    }

    return event;
  }

  /**
   * Drain pending stigmergic signals. Callers (StigmergyV5,
   * HolographicEtch growth ledger, continuous-learning loop) consume
   * these and decide how to feed them back into the substrate.
   */
  consumeStigmergicEvents(): DriftSentinelEvent[] {
    const drained = this.pendingSignals.toArray();
    this.pendingSignals.clear();
    return drained;
  }

  /** Peek at pending signals without draining. */
  peekStigmergicEvents(limit = 16): DriftSentinelEvent[] {
    return this.pendingSignals.recent(limit);
  }

  /**
   * Replay the Merkle chain backwards from the head, returning every
   * event whose severity crossed `minSeverity` (default: `'elevated'`).
   * Each entry includes the exact `reasoningStepId` of the originating
   * step, so dashboards can rewind to the divergence boundary.
   */
  rewindFlagged(minSeverity: DriftSeverity = 'elevated'): DriftSentinelEvent[] {
    const floor = SEVERITY_ORDER[minSeverity];
    return this.events
      .toArray()
      .filter(e => SEVERITY_ORDER[e.severity] >= floor);
  }

  /** Recent events, newest first. */
  recent(limit = 16): DriftSentinelEvent[] {
    return this.events.recent(limit);
  }

  /**
   * Divergence Telemetry surface — corpus-health & risk-index payload.
   * Cheap to call; safe to expose on dashboards.
   */
  getTelemetry(): DriftTelemetrySnapshot {
    const last = this.events.last();
    const baselineStd = this.observedCount > 1
      ? Math.sqrt(this.rollingM2 / (this.observedCount - 1))
      : 0;
    return {
      observedCount: this.observedCount,
      flaggedCount: this.flaggedCount,
      criticalCount: this.criticalCount,
      baselineMean: this.observedCount > 0 ? this.rollingMean : 0,
      baselineStd,
      lastDelta: last?.delta,
      lastSeverity: last?.severity,
      histogram: DEFAULT_HISTOGRAM_EDGES.map(([bucket], i) => ({
        bucket,
        count: this.histogramCounts[i],
      })),
      chainHead: this.chainHead,
    };
  }

  /**
   * Verify the Merkle linkage of the retained event ring. Returns
   * `{ valid: true }` if every event's `parentHash` matches the prior
   * event's `hash`, otherwise the index of the first break.
   */
  verifyChain(): { valid: true } | { valid: false; brokenAt: number } {
    const all = this.events.toArray();
    let prev: string | undefined;
    for (let i = 0; i < all.length; i++) {
      if (all[i].parentHash !== prev) {
        return { valid: false, brokenAt: i };
      }
      prev = all[i].hash;
    }
    return { valid: true };
  }

  private updateRollingStats(delta: number): void {
    // Welford's online algorithm.
    const n = this.observedCount; // already incremented to include this obs
    const meanPrev = this.rollingMean;
    const meanNext = meanPrev + (delta - meanPrev) / n;
    this.rollingM2 += (delta - meanPrev) * (delta - meanNext);
    this.rollingMean = meanNext;
  }

  private recordHistogram(delta: number): void {
    for (let i = 0; i < DEFAULT_HISTOGRAM_EDGES.length; i++) {
      if (delta < DEFAULT_HISTOGRAM_EDGES[i][1]) {
        this.histogramCounts[i] += 1;
        return;
      }
    }
    this.histogramCounts[this.histogramCounts.length - 1] += 1;
  }
}

function meanVector(vectors: ContextTensor[]): number[] {
  const dim = vectors.reduce((m, v) => Math.max(m, v.length), 0);
  if (dim === 0) return [];
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) out[i] += v[i];
  }
  const n = vectors.length;
  for (let i = 0; i < dim; i++) out[i] /= n;
  return out;
}

function cosineDistance(a: ContextTensor, b: ContextTensor): number {
  const aMag = magnitude(a);
  const bMag = magnitude(b);
  if (aMag === 0 || bMag === 0) return 1;
  const sim = cosineWithMagnitudes(a, b, aMag, bMag);
  // Map [-1, 1] → [0, 1]; identical vectors → 0, anti-aligned → 1.
  return clamp01((1 - sim) / 2);
}

function classifySeverity(
  delta: number,
  dynamicThreshold: number,
  criticalCeiling: number,
  baseSensitivity: number,
): DriftSeverity {
  if (delta >= criticalCeiling) return 'critical';
  if (delta >= dynamicThreshold) return 'elevated';
  if (delta >= baseSensitivity) return 'watch';
  return 'nominal';
}

function recommendEscalation(
  severity: DriftSeverity,
  delta: number,
  criticalCeiling: number,
): DriftEscalation {
  switch (severity) {
    case 'critical':
      return {
        kind: 'human-review',
        reason: `Δ=${delta.toFixed(3)} ≥ critical ceiling ${criticalCeiling.toFixed(3)}`,
      };
    case 'elevated':
      return {
        kind: 'lightweight-review',
        reason: `Δ=${delta.toFixed(3)} exceeded rolling dynamic threshold`,
      };
    case 'watch':
    case 'nominal':
    default:
      return { kind: 'none' };
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
