import { canonicalDigest } from './canonicalEncoding';
import { CircularBuffer } from './circularBuffer';

export type PositiveGrowthDomain =
  | 'identity'
  | 'determinism'
  | 'link-integrity'
  | 'dependency-hygiene'
  | 'doc-code-sync'
  | 'branch-hygiene'
  | 'provenance'
  | 'joy';

export interface PositiveGrowthEventInput {
  domain: PositiveGrowthDomain;
  title: string;
  positiveBuilding: string;
  resonanceDelta: number;
  evidence?: Record<string, unknown>;
  humanCelebration?: string;
}

export interface PositiveGrowthEvent extends PositiveGrowthEventInput {
  id: string;
  hash: string;
  parentHash?: string;
  timestamp: string;
  resonanceScore: number;
}

export interface PositiveImpactMetrics {
  contributorJoy: number;
  adoptionVelocity: number;
  beneficialOutcomeAmplification: number;
  growthEvents: number;
  merkleRoot?: string;
}

export interface PositiveResonanceAmplifierConfig {
  maxEvents?: number;
  humanCelebrationEnabled?: boolean;
}

/**
 * PositiveResonanceAmplifier is an append-only growth ledger for joyful
 * remediation and constructive audit work. Every entry is Merkle-chained so
 * contributor-facing celebration remains replayable and tamper-evident.
 */
export class PositiveResonanceAmplifier {
  private readonly events: CircularBuffer<PositiveGrowthEvent>;
  private readonly humanCelebrationEnabled: boolean;

  constructor(config: PositiveResonanceAmplifierConfig = {}) {
    this.events = new CircularBuffer<PositiveGrowthEvent>(config.maxEvents ?? 1024);
    this.humanCelebrationEnabled = config.humanCelebrationEnabled ?? true;
  }

  recordGrowthEvent(input: PositiveGrowthEventInput): PositiveGrowthEvent {
    const parentHash = this.events.last()?.hash;
    const timestamp = new Date().toISOString();
    const resonanceScore = clamp01(0.5 + clampSigned(input.resonanceDelta) / 2);
    const payload = {
      domain: input.domain,
      evidence: input.evidence ?? null,
      parentHash: parentHash ?? null,
      positiveBuilding: input.positiveBuilding,
      resonanceDelta: clampSigned(input.resonanceDelta),
      resonanceScore,
      title: input.title,
    };
    const hash = canonicalDigest(payload);
    const event: PositiveGrowthEvent = {
      ...input,
      humanCelebration: this.humanCelebrationEnabled
        ? input.humanCelebration ?? celebrate(input.domain, input.title)
        : undefined,
      parentHash,
      hash,
      id: hash.slice(0, 16),
      timestamp,
      resonanceDelta: clampSigned(input.resonanceDelta),
      resonanceScore,
    };
    this.events.push(event);
    return event;
  }

  getPositiveImpactMetrics(): PositiveImpactMetrics {
    const events = this.events.toArray();
    if (events.length === 0) {
      return {
        contributorJoy: 0,
        adoptionVelocity: 0,
        beneficialOutcomeAmplification: 0,
        growthEvents: 0,
        merkleRoot: undefined,
      };
    }

    const joyEvents = events.filter((event) => event.humanCelebration).length;
    const meanResonance = mean(events.map((event) => event.resonanceScore));
    const domainDiversity = new Set(events.map((event) => event.domain)).size /
      Math.max(1, events.length);
    const positiveDelta = events.reduce(
      (sum, event) => sum + Math.max(0, event.resonanceDelta),
      0,
    );

    return {
      contributorJoy: roundMetric(clamp01(0.35 + meanResonance * 0.45 + joyEvents / events.length * 0.2)),
      adoptionVelocity: roundMetric(clamp01(0.25 + domainDiversity * 0.35 + Math.log2(events.length + 1) / 10)),
      beneficialOutcomeAmplification: roundMetric(clamp01(0.3 + positiveDelta / Math.max(1, events.length) * 0.7)),
      growthEvents: events.length,
      merkleRoot: this.getMerkleRoot(),
    };
  }

  recentGrowthEvents(limit = 8): PositiveGrowthEvent[] {
    return this.events.recent(limit);
  }

  getMerkleRoot(): string | undefined {
    return this.events.last()?.hash;
  }
}

function celebrate(domain: PositiveGrowthDomain, title: string): string {
  return `Positive Building of ${domain}: ${title} now radiates more trust.`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
