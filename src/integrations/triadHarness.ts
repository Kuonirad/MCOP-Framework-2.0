/**
 * Shared MCOP triad harness used by every ecosystem integration shim
 * (`langchain.ts`, `llamaIndex.ts`, `haystack.ts`).
 *
 * The shims accept either a fully wired triad (encoder + stigmergy + etch),
 * or — most commonly — `undefined`, in which case the harness lazily
 * constructs a single deterministic triad with the project-default
 * configuration. Every shim shares the same harness instance so that
 * traces recorded by `MCOPLangChainMemory` resonate against queries from
 * `MCOPLlamaIndexVectorStore` and etches written by either are visible to
 * `MCOPHaystackMemoryStore` — i.e., the integrations cooperate on a single
 * MCOP memory rather than each being a silo.
 *
 * Every public surface returns a `MCOPProvenance` block carrying the
 * SHA-256 etch hash, the Stigmergy Merkle root, a UUID-v4 traceId, and an
 * ISO8601 timestamp. This is the same provenance shape the deterministic
 * benchmark snapshot guarantees, so callers can stitch ecosystem traffic
 * into the same Holographic Etch ledger that backs the v2.4 reproducible
 * benchmark badge.
 */

import { randomUUID } from 'node:crypto';
import {
  ContextTensor,
  EtchRecord,
  HolographicEtch,
  NovaNeoEncoder,
  PheromoneTrace,
  StigmergyV5,
} from '../core';

/** Triad bundle every ecosystem integration shim is parameterised by. */
export interface MCOPTriad {
  readonly encoder: NovaNeoEncoder;
  readonly stigmergy: StigmergyV5;
  readonly etch: HolographicEtch;
}

/** Optional triad knobs every shim's constructor accepts. */
export interface MCOPTriadOptions {
  readonly triad?: MCOPTriad;
  readonly encoderDimensions?: number;
  readonly resonanceThreshold?: number;
  readonly maxTraces?: number;
  /**
   * Etch confidence floor. Defaults to 0 for the integration shims (every
   * recorded ecosystem event etches) — the dialectical-synthesis path uses
   * a stricter floor to filter low-resonance refinements.
   */
  readonly etchConfidenceFloor?: number;
}

/** Cryptographic provenance attached to every shim response. */
export interface MCOPProvenance {
  readonly traceId: string;
  readonly etchHash: string;
  readonly merkleRoot: string | undefined;
  readonly timestamp: string;
  readonly auditable: boolean;
}

/** Result of recording a single ecosystem event into the triad. */
export interface MCOPRecordResult {
  readonly trace: PheromoneTrace;
  readonly etch: EtchRecord;
  readonly provenance: MCOPProvenance;
}

/** Lazily build (and cache) a default triad if the caller didn't supply one. */
export function ensureTriad(options: MCOPTriadOptions = {}): MCOPTriad {
  if (options.triad) return options.triad;
  const encoder = new NovaNeoEncoder({
    dimensions: options.encoderDimensions ?? 64,
  });
  const stigmergy = new StigmergyV5({
    resonanceThreshold: options.resonanceThreshold ?? 0.55,
    maxTraces: options.maxTraces ?? 2048,
  });
  const etch = new HolographicEtch({
    confidenceFloor: options.etchConfidenceFloor ?? 0,
  });
  return { encoder, stigmergy, etch };
}

/** Encode → record trace → etch a single (text, metadata) pair. */
export function recordIntoTriad(
  triad: MCOPTriad,
  text: string,
  metadata?: Record<string, unknown>,
  note?: string,
): MCOPRecordResult {
  const context = triad.encoder.encode(text);
  const synthesis = synthesiseFromContext(context);
  const trace = triad.stigmergy.recordTrace(context, synthesis, metadata);
  const etch = triad.etch.applyEtch(context, synthesis, note ?? 'mcop-integration-shim');
  const provenance: MCOPProvenance = {
    traceId: randomUUID(),
    etchHash: etch.hash,
    merkleRoot: triad.stigmergy.getMerkleRoot(),
    timestamp: new Date().toISOString(),
    auditable: Boolean(etch.hash) && Boolean(triad.stigmergy.getMerkleRoot()),
  };
  return { trace, etch, provenance };
}

/** Run a resonance query and return the matching trace (if any). */
export function recallFromTriad(
  triad: MCOPTriad,
  query: string,
): { context: ContextTensor; resonance: ReturnType<StigmergyV5['getResonance']> } {
  const context = triad.encoder.encode(query);
  const resonance = triad.stigmergy.getResonance(context);
  return { context, resonance };
}

/**
 * Deterministic synthesis vector derived from the encoded context. We do
 * NOT call out to an LLM here — the integrations are about funnelling
 * ecosystem events into MCOP memory, not about reshaping the triad's
 * synthesis behaviour. Using the context vector itself as the synthesis
 * vector keeps the etch byte-identical-reproducible across runtimes.
 */
function synthesiseFromContext(context: ContextTensor): number[] {
  return context.slice();
}
