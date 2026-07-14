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
  /** Optional embedding backend override. Async backends require encodeAsync(). */
  embeddingBackend?: import('./embeddingEngine').IEmbeddingBackend | import('./embeddingEngine').IAsyncEmbeddingBackend;
  /** Enable graceful dimension growth to the nearest safe power-of-2. */
  selfHealDimensions?: boolean;
}

export interface PheromoneTrace {
  id: string;
  hash: string;
  parentHash?: string;
  context: ContextTensor;
  magnitude?: number; // Optimization: Cached Euclidean norm of the context tensor
  /**
   * Dual-key trace: optional embedding tensor carrying semantic locality
   * alongside the hash tensor's cryptographic identity (`context`). When
   * present it is bound under the same canonical digest as the rest of the
   * payload, so semantic recall and integrity verification are orthogonal
   * axes of one sealed object. See `docs/RESONANCE_CALIBRATION.md`.
   */
  semanticContext?: ContextTensor;
  /** Cached Euclidean norm of `semanticContext`. */
  semanticMagnitude?: number;
  synthesisVector: number[];
  weight: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Which key of a dual-key trace a resonance query matches against:
 * `'context'` = hash tensor (cryptographic identity, exact-match memory),
 * `'semantic'` = embedding tensor (semantic locality). Traces recorded
 * without a semantic key are skipped by `'semantic'` queries.
 */
export type ResonanceKeyspace = 'context' | 'semantic';

export interface ResonanceQueryOptions {
  keyspace?: ResonanceKeyspace;
}

export interface RecordTraceOptions {
  /** Embedding tensor to seal alongside the hash tensor (dual-key trace). */
  semanticContext?: ContextTensor;
  /**
   * Optional caller-supplied UUID for deterministic replay and cross-runtime
   * conformance fixtures. Production callers should normally omit this so the
   * runtime generates a fresh UUID v4.
   */
  traceId?: string;
}

export interface ResonanceResult {
  score: number;
  trace?: PheromoneTrace;
  thresholdUsed?: number;
  positiveFeedbackScore?: number;
  /**
   * Temporal pheromone strength of the matched trace at query time. Present
   * only when temporal dynamics are enabled (advance #3). A faded trail returns
   * a low value even at high cosine similarity.
   */
  pheromoneStrength?: number;
}

export interface ResonantRecentQueryOptions {
  context?: ContextTensor;
  curiosityBonus?: number;
  includeLowResonance?: boolean;
}

export interface ResonantRecentTrace extends PheromoneTrace {
  resonanceScore: number;
  curiosityLift: number;
  /**
   * Temporal pheromone strength folded into `resonanceScore` (advance #3).
   * Present only when temporal dynamics are enabled; stale trails fade in the
   * attention ranking even when geometrically similar.
   */
  pheromoneStrength?: number;
}

export interface EtchRecord {
  hash: string;
  deltaWeight: number;
  note?: string;
  timestamp: string;
  flourishingScore?: number;
  propagationHint?: 'seed' | 'bloom' | 'radiate';
  metadata?: Record<string, unknown>;
}
