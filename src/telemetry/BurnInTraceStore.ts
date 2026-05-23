import { InstabilityNature, TelemetryProxies } from './types';

export interface BurnInTraceSample {
  timestamp: string;
  proxies: TelemetryProxies;
  instabilityScore: number;
  nature: InstabilityNature;
}

export interface BurnInTraceStoreConfig {
  maxSamples?: number;
  persistenceThreshold?: number;
  instabilityFloor?: number;
  leakyDecay?: number;
}

export class BurnInTraceStore {
  private readonly maxSamples: number;
  private readonly persistenceThreshold: number;
  private readonly instabilityFloor: number;
  private readonly leakyDecay: number;
  private readonly samples: BurnInTraceSample[] = [];
  private persistenceCounter = 0;
  private leakyIntegratorValue = 0;

  constructor(config: BurnInTraceStoreConfig = {}) {
    this.maxSamples = Math.max(1, config.maxSamples ?? 256);
    this.persistenceThreshold = Math.max(1, config.persistenceThreshold ?? 3);
    this.instabilityFloor = clamp01(config.instabilityFloor ?? 0.75);
    this.leakyDecay = clamp01(config.leakyDecay ?? 0.82);
  }

  public record(proxies: TelemetryProxies, timestamp = new Date().toISOString()): BurnInTraceSample {
    const instabilityScore = this.calculateInstabilityScore(proxies);
    this.persistenceCounter = instabilityScore >= this.instabilityFloor ? this.persistenceCounter + 1 : 0;
    this.leakyIntegratorValue = this.leakyDecay * this.leakyIntegratorValue + (1 - this.leakyDecay) * instabilityScore;

    const sample: BurnInTraceSample = {
      timestamp,
      proxies,
      instabilityScore,
      nature: this.classifyInstability(instabilityScore),
    };
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();

    return sample;
  }

  public getPersistenceCounter(): number {
    return this.persistenceCounter;
  }

  public getLeakyIntegratorValue(): number {
    return this.leakyIntegratorValue;
  }

  public isResetRecommended(): boolean {
    return this.persistenceCounter >= this.persistenceThreshold;
  }

  public getRecent(limit = this.samples.length): BurnInTraceSample[] {
    return this.samples.slice(Math.max(0, this.samples.length - limit));
  }

  public getMeanProxies(windowSize = this.samples.length): TelemetryProxies {
    const recent = this.getRecent(windowSize);
    if (!recent.length) {
      return { rho: 0, rInstability: 0, deltaVfe: 0, sigma: 0 };
    }

    const sums = recent.reduce(
      (acc, sample) => ({
        rho: acc.rho + sample.proxies.rho,
        rInstability: acc.rInstability + sample.proxies.rInstability,
        deltaVfe: acc.deltaVfe + sample.proxies.deltaVfe,
        sigma: acc.sigma + sample.proxies.sigma,
      }),
      { rho: 0, rInstability: 0, deltaVfe: 0, sigma: 0 },
    );
    const count = recent.length;

    return {
      rho: sums.rho / count,
      rInstability: sums.rInstability / count,
      deltaVfe: sums.deltaVfe / count,
      sigma: sums.sigma / count,
    };
  }

  private calculateInstabilityScore(proxies: TelemetryProxies): number {
    return clamp01((proxies.rho + proxies.rInstability + proxies.deltaVfe + proxies.sigma) / 4);
  }

  private classifyInstability(instabilityScore: number): InstabilityNature {
    if (this.persistenceCounter >= this.persistenceThreshold) return InstabilityNature.SYSTEMIC_BREAKDOWN;
    if (instabilityScore >= this.instabilityFloor) return InstabilityNature.PERSISTENT_FRICTION;
    return InstabilityNature.TRANSIENT_SPIKE;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
