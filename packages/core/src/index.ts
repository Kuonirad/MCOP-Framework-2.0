export * from './types';
export * from './novaNeoEncoder';
export * from './stigmergyV5';
export * from './holographicEtch';
export * from './positiveResonanceAmplifier';
export * from './lowMemoryMCOPMode';
export * from './vectorMath';
export * from './tensorGuard';
export * from './circularBuffer';
export * from './provenanceTracer';
export * from './canonicalEncoding';
export * from './embeddingEngine';
export * from './universalCrypto';

/**
 * Plain-English aliases — additive, non-breaking.
 *
 * See `PLAIN_ENGLISH_GLOSSARY.md` in the repository root for the full
 * translation map. Original exports above remain canonical.
 */
export { NovaNeoEncoder as ContextTensorEncoder } from './novaNeoEncoder';
export { StigmergyV5 as SharedTraceMemoryV5 } from './stigmergyV5';
export { HolographicEtch as ChangeAuditLogger } from './holographicEtch';
export type { PheromoneTrace as MemoryTraceRecord } from './types';
