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
export * from './openAICompatibleChatClient';
export * from './openAICompatibleMCOPAdapter';
export * from './magnificAdapter';
export * from './freepikAdapter';
export * from './utopaiAdapter';
export * from './genericProductionAdapter';
export * from './regulatedProvenanceAdapter';
export * from './grokAdapter';
export * from './grokImageAdapter';
export * from './veilBridgeGrokClient';
export * from './qwenAdapter';
export * from './claudeAdapter';
// NOTE: `sdkClaudeClient` (the official `@anthropic-ai/sdk`-backed ClaudeClient)
// is intentionally NOT re-exported here. The Anthropic SDK is server-only (it
// pulls Node built-ins such as `node:fs/promises`), and this barrel is imported
// by client components (e.g. dialectical/DialecticalStudio.tsx). Re-exporting it
// would drag the SDK into the client bundle and break the Turbopack build.
// Import it directly from '@/adapters/sdkClaudeClient' in server-side code.
export * from './deepSeekAdapter';
export * from './kimiAdapter';
export * from './multiProviderRouter';
export * from './devinOrchestratorAdapter';
export * from './linearSlackOrchestratorAdapter';

/**
 * Plain-English aliases — additive, non-breaking.
 *
 * See `PLAIN_ENGLISH_GLOSSARY.md` in the repository root for the full
 * translation map. Original exports above remain canonical.
 */
export { DialecticalSynthesizer as HumanReviewRefinementLoop } from './dialecticalSynthesizer';
export type { ProvenanceMetadata as TraceabilityRecord } from './types';
