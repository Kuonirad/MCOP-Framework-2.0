export * from './types';
export * from './novaNeoEncoder';
export * from './stigmergyV5';
export * from './holographicEtch';
export * from './pGoT_types';
export * from './pGoT_algorithms';
export * from './vectorMath';
export * from './tensorGuard';
export * from './circularBuffer';
export * from './provenanceTracer';
export * from './planning';
export * from './canonicalEncoding';
export * from './embeddingEngine';
export * from './universalCrypto';
export * from './longFormVideoOrchestrator';
export * from './observability';

/**
 * Plain-English aliases — additive, non-breaking.
 *
 * These aliases resolve to the same constructs as their canonical names and
 * exist solely to make the public surface approachable for consumers who
 * haven't yet internalized the framework vocabulary. See
 * `PLAIN_ENGLISH_GLOSSARY.md` for the full translation map.
 */
export { NovaNeoEncoder as ContextTensorEncoder } from './novaNeoEncoder';
export { StigmergyV5 as SharedTraceMemoryV5 } from './stigmergyV5';
export { HolographicEtch as ChangeAuditLogger } from './holographicEtch';
export type { PheromoneTrace as MemoryTraceRecord } from './types';
