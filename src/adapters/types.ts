/**
 * Universal MCOP Adapter Integration Protocol — shared types.
 *
 * This module defines the minimal contract that any platform adapter must
 * satisfy to plug into the MCOP cognitive layer (NOVA-NEO Encoder,
 * Stigmergy v5, Holographic Etch). It is intentionally framework-agnostic:
 * adapters speak only in terms of these primitives plus the existing
 * `src/core` triad types, never the underlying vendor SDKs.
 */

import type { ContextTensor, ResonanceResult } from '../core/types';

/** Domain bias hint propagated to the encoder for entropy targeting. */
export type AdapterDomain =
  | 'graphic'
  | 'cinematic'
  | 'narrative'
  | 'audio'
  | 'healthcare'
  | 'finance'
  | 'generic';

/** Inbound request shape for any platform adapter. */
export interface AdapterRequest<TPayload = Record<string, unknown>> {
  /** Free-form user prompt or script segment to encode. */
  prompt: string;
  /** Optional style anchor (prior asset tensor) for stigmergic resonance. */
  styleContext?: ContextTensor;
  /** Optional domain hint (defaults to `'generic'`). */
  domain?: AdapterDomain;
  /** Optional entropy target override forwarded to the encoder caller. */
  entropyTarget?: number;
  /** Optional human feedback channel for the dialectical synthesizer. */
  humanFeedback?: HumanFeedback;
  /** Platform-specific payload (model name, resolution, motion refs, ...). */
  payload?: TPayload;
  /** Free-form metadata persisted with the trace + etch. */
  metadata?: Record<string, unknown>;
  /**
   * Optional pre-planned action sequence produced by the MCTS+MAB
   * planner (`@kuonirad/mcop-framework` `MCOPMCTSPlanner.plan().bestSequence`).
   *
   * When supplied the adapter does **not** re-plan; it forwards the
   * sequence verbatim to the dispatch function (or vendor SDK) and
   * records it in trace metadata under `plannedSequence` so the entire
   * planning trace remains Merkle-auditable end-to-end.
   *
   * Read-only: the adapter never mutates this field. Omit it to keep
   * the existing reactive (non-planned) pipeline behaviour unchanged.
   */
  plannedSequence?: ReadonlyArray<string>;
}

/** Provenance record returned alongside every generation. */
export interface ProvenanceMetadata {
  /** Hash of the encoded prompt tensor (NOVA-NEO output). */
  tensorHash: string;
  /** Stigmergy trace ID and Merkle hash (when a trace was recorded). */
  traceId?: string;
  traceHash?: string;
  /** Resonance score against prior style/motion references. */
  resonanceScore: number;
  /** Etch Merkle root (empty string when the etch was skipped). */
  etchHash: string;
  /** Cumulative delta weight from the etch. */
  etchDelta: number;
  /** Refined prompt produced by the dialectical synthesizer. */
  refinedPrompt: string;
  /** ISO-8601 timestamp recorded at adapter entry. */
  timestamp: string;
}

/** Outbound response from a platform adapter. */
export interface AdapterResponse<TResult = unknown> {
  /** Platform-native result payload (image URL, video job, ...). */
  result: TResult;
  /** Top-level Merkle root for downstream consumers (etch hash). */
  merkleRoot: string;
  /** Full provenance bundle for compliance / replay. */
  provenance: ProvenanceMetadata;
}

/** Capabilities surface — used for feature detection. */
export interface AdapterCapabilities {
  platform: string;
  version: string;
  models: string[];
  supportsAudit: boolean;
  features?: string[];
  maxResolution?: string;
  notes?: string;
}

/** Optional human override delivered through the dialectical synthesizer. */
export interface HumanFeedback {
  /** Direct prompt rewrite. When present, takes precedence over `notes`. */
  rewrittenPrompt?: string;
  /** Additive guidance appended to the prompt. */
  notes?: string;
  /** Hard veto: when true, the adapter MUST refuse to call the platform. */
  veto?: boolean;
}

/**
 * Dialectical synthesizer contract — preserves human primacy by giving the
 * operator a deterministic seam to override or augment the encoded prompt
 * before it is dispatched to the downstream platform.
 */
export interface IDialecticalSynthesizer {
  synthesize(
    prompt: string,
    resonance: ResonanceResult,
    feedback?: HumanFeedback,
  ): string;
}

/**
 * Minimal contract every platform adapter must implement. Adapters may
 * expose richer convenience methods (e.g. `generateOptimizedImage`) but
 * MUST satisfy this surface for orchestrator compatibility.
 */
export interface IMCOPAdapter<TRequest = AdapterRequest, TResult = unknown> {
  generate(input: TRequest): Promise<AdapterResponse<TResult>>;
  getCapabilities(): Promise<AdapterCapabilities>;
}

/** Veto thrown when human feedback hard-stops a generation. */
export class HumanVetoError extends Error {
  constructor(message = 'Human override vetoed this generation') {
    super(message);
    this.name = 'HumanVetoError';
  }
}
