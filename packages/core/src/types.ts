export type ContextTensor = number[];

export interface NovaNeoConfig {
  dimensions: number;
  normalize?: boolean;
  entropyFloor?: number;
  /**
   * Encoding backend. `'hash'` = legacy SHA-256 deterministic hash
   * (default, fully backward-compatible). `'embedding'` = n-gram
   * feature-hashing backend that captures semantic overlap.
   */
  backend?: 'hash' | 'embedding' | 'novaNeoWeb';
  /** Enable graceful dimension growth to the nearest safe power-of-2. */
  selfHealDimensions?: boolean;
}

export interface PheromoneTrace {
  id: string;
  hash: string;
  parentHash?: string;
  context: ContextTensor;
  magnitude?: number; // Optimization: Cached Euclidean norm of the context tensor
  synthesisVector: number[];
  weight: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ResonanceResult {
  score: number;
  trace?: PheromoneTrace;
  thresholdUsed?: number;
  positiveFeedbackScore?: number;
}

export interface ResonantRecentQueryOptions {
  context?: ContextTensor;
  curiosityBonus?: number;
  includeLowResonance?: boolean;
}

export interface ResonantRecentTrace extends PheromoneTrace {
  resonanceScore: number;
  curiosityLift: number;
}

export interface EtchRecord {
  hash: string;
  deltaWeight: number;
  note?: string;
  timestamp: string;
  flourishingScore?: number;
  propagationHint?: 'seed' | 'bloom' | 'radiate';
}
