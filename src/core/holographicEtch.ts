import { ContextTensor, EtchRecord } from './types';
import { CircularBuffer } from './circularBuffer';
import { cosineWithMagnitudes, magnitude } from './vectorMath';
import { canonicalDigest } from './canonicalEncoding';

export interface HolographicEtchConfig {
  /**
   * Legacy static threshold below which an etch is skipped. Retained for
   * backward compatibility; the Adaptive Confidence Engine below blends this
   * floor with alignment, magnitude, and recent-etch variance to produce a
   * dynamic decision surface.
   */
  confidenceFloor?: number;
  /**
   * Emit an auditable record even when an etch is skipped. Defaults to true
   * so downstream replay can distinguish "we never saw this" from
   * "we saw this and rejected it".
   */
  auditLog?: boolean;
  /**
   * Maximum number of retained etches. The Etch Memory Guardian evicts the
   * oldest entries once this is exceeded. Previously unbounded.
   */
  maxEtches?: number;
  /**
   * Extra weight given to static-floor compliance in the adaptive score.
   * Higher = closer to the legacy static behaviour. Range [0, 1].
   */
  staticFloorWeight?: number;
}

export interface AdaptiveConfidenceBreakdown {
  alignment: number;
  magnitudeHealth: number;
  staticFloorMargin: number;
  recencyStability: number;
  score: number;
  accepted: boolean;
}

export class HolographicEtch {
  private readonly confidenceFloor: number;
  private readonly auditLog: boolean;
  private readonly staticFloorWeight: number;
  private readonly etches: CircularBuffer<EtchRecord>;
  private readonly audit: CircularBuffer<EtchRecord>;

  constructor(config: HolographicEtchConfig = {}) {
    this.confidenceFloor = config.confidenceFloor ?? 0.8;
    this.auditLog = config.auditLog ?? true;
    this.staticFloorWeight = clamp01(config.staticFloorWeight ?? 0.4);
    const cap = config.maxEtches ?? 4096;
    this.etches = new CircularBuffer<EtchRecord>(cap);
    this.audit = new CircularBuffer<EtchRecord>(cap);
  }

  /**
   * Adaptive Confidence Engine — blends four factors into a single score in
   * [0, 1]:
   *   1. alignment: cosine similarity between context and synthesis,
   *   2. magnitudeHealth: penalizes vanishing vectors,
   *   3. staticFloorMargin: distance above the configured confidence floor,
   *   4. recencyStability: inverse of recent deltaWeight variance.
   * The blend is deterministic and exposed for calibration.
   */
  scoreConfidence(
    context: ContextTensor,
    synthesisVector: number[],
  ): AdaptiveConfidenceBreakdown {
    const ctxMag = magnitude(context);
    const synMag = magnitude(synthesisVector);
    const alignment = Math.max(
      0,
      cosineWithMagnitudes(context, synthesisVector, ctxMag, synMag),
    );
    const magnitudeHealth = clamp01(Math.min(ctxMag, synMag));

    const minLen = Math.min(context.length, synthesisVector.length);
    let dotAcc = 0;
    for (let i = 0; i < minLen; i++) {
      dotAcc += context[i] * synthesisVector[i];
    }
    const normalizedDelta = dotAcc / (minLen || 1);
    const staticFloorMargin = clamp01(normalizedDelta - this.confidenceFloor + 1) / 2;

    const recencyStability = this.computeRecencyStability();

    const adaptiveWeight = 1 - this.staticFloorWeight;
    const adaptive =
      0.5 * alignment +
      0.2 * magnitudeHealth +
      0.3 * recencyStability;
    const score = clamp01(
      this.staticFloorWeight * staticFloorMargin + adaptiveWeight * adaptive,
    );

    const accepted = normalizedDelta >= this.confidenceFloor;

    return {
      alignment,
      magnitudeHealth,
      staticFloorMargin,
      recencyStability,
      score,
      accepted,
    };
  }

  applyEtch(
    context: ContextTensor,
    synthesisVector: number[],
    note?: string,
  ): EtchRecord {
    const minLen = Math.min(context.length, synthesisVector.length);
    let deltaWeight = 0;
    for (let i = 0; i < minLen; i++) {
      deltaWeight += context[i] * synthesisVector[i];
    }
    const normalizedDelta = deltaWeight / (minLen || 1);

    if (normalizedDelta < this.confidenceFloor) {
      const skipped: EtchRecord = {
        hash: '',
        deltaWeight: 0,
        note: 'skipped-low-confidence',
        timestamp: new Date().toISOString(),
      };
      // Audit trail: retain skip records on the dedicated audit ring so
      // downstream replay can distinguish "rejected" from "never seen"
      // without polluting committed-etch consumers.
      if (this.auditLog) this.audit.push(skipped);
      return skipped;
    }

    const payload = { context, synthesisVector, normalizedDelta, note };
    // RFC 8785 canonical JSON: byte-identical with the Python parity etch.
    const hash = canonicalDigest(payload);
    const record: EtchRecord = {
      hash,
      deltaWeight: normalizedDelta,
      note,
      timestamp: new Date().toISOString(),
    };

    this.etches.push(record);
    if (this.auditLog) this.audit.push(record);
    return record;
  }

  recent(limit = 5): EtchRecord[] {
    return this.etches.recent(limit);
  }

  /**
   * Audit Trail: combined view of committed and skipped etches, newest first.
   * Consumers can filter on `record.hash === ''` to identify rejections.
   */
  recentAudit(limit = 5): EtchRecord[] {
    return this.audit.recent(limit);
  }

  /** Memory Guardian: current fill statistics, for dashboards/alerts. */
  getMemoryStats(): {
    size: number;
    capacity: number;
    lifetimePushes: number;
    utilizationPct: number;
  } {
    return {
      size: this.etches.size,
      capacity: this.etches.capacity,
      lifetimePushes: this.etches.lifetimePushes,
      utilizationPct: Math.round(
        (this.etches.size / this.etches.capacity) * 1000,
      ) / 10,
    };
  }

  private computeRecencyStability(): number {
    const recent = this.etches.recent(16);
    if (recent.length < 2) return 1;
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (const r of recent) {
      if (r.hash === '') continue; // skipped records excluded from stability
      sum += r.deltaWeight;
      sumSq += r.deltaWeight * r.deltaWeight;
      count++;
    }
    if (count < 2) return 1;
    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    return clamp01(1 - Math.min(1, Math.sqrt(variance)));
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
