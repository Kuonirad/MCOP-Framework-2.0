export type ContextTensor = number[];

export interface NovaNeoConfig {
  dimensions: number;
  normalize?: boolean;
  entropyFloor?: number;
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
}

export interface EtchRecord {
  hash: string;
  deltaWeight: number;
  note?: string;
  timestamp: string;
}
