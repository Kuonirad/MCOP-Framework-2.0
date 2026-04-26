/**
 * Universal MCOP Adapter Integration Protocol (v2.1) — public surface.
 *
 * Adapters wire the deterministic MCOP triad (NOVA-NEO Encoder,
 * Stigmergy v5, Holographic Etch) to external creative-production
 * platforms behind a uniform contract. See
 * `docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md` for the full specification.
 */

export * from './types';
export * from './dialecticalSynthesizer';
export * from './baseAdapter';
export * from './freepikAdapter';
export * from './utopaiAdapter';
export * from './genericProductionAdapter';

/**
 * Plain-English aliases — additive, non-breaking.
 *
 * See `PLAIN_ENGLISH_GLOSSARY.md` in the repository root for the full
 * translation map. Original exports above remain canonical.
 */
export { DialecticalSynthesizer as HumanReviewRefinementLoop } from './dialecticalSynthesizer';
export type { ProvenanceMetadata as TraceabilityRecord } from './types';
