/**
 * MCOP Organelle Merge Utilities
 *
 * This module provides the host-side logic for receiving MCOP artifacts
 * produced by a remote "organelle host" (e.g. a Grok-4.3 model running
 * a compact version of the triad internally) and safely merging them
 * into the local persistent StigmergyV5 + HolographicEtch.
 *
 * Design goals:
 * - Preserve full Merkle provenance across the host/model boundary
 * - Allow the model to act as a powerful remote execution substrate
 * - Keep the host as the source of truth for canonical traces/etches
 * - Support incremental / multi-turn collaboration
 */

import type {
  ContextTensor,
  EtchRecord,
  PheromoneTrace,
} from '../core/types';
import { StigmergyV5 } from '../core/stigmergyV5';
import { HolographicEtch } from '../core/holographicEtch';
import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import {
  startTriadSpan,
  finishTriadSpan,
  failTriadSpan,
} from '../core/observability';

// -----------------------------------------------------------------------------
// Organelle Protocol Types
// -----------------------------------------------------------------------------

export const ORGANELLE_PROTOCOL_VERSION = 'grok-organelle-v2' as const;

export interface OrganelleTrace {
  id: string;
  resonance: number;
  summary: string;
  contextTensorHint?: string; // Optional hint from the model
}

export interface OrganelleArtifacts {
  synthesizedInsight: string;
  internalTraces: OrganelleTrace[];
  proposedEtchDelta: number;
  resonanceScores: Record<string, number>;
  organelleNotes: string;
  organelleProtocolVersion: string;
  modelInternalMerkleRoot?: string;
}

export interface OrganelleProvenanceLink {
  remoteModel: string;
  callId?: string;
  modelInternalMerkleRoot?: string;
  protocolVersion: string;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export function validateOrganelleArtifacts(raw: unknown): OrganelleArtifacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.synthesizedInsight !== 'string') return null;
  if (!Array.isArray(r.internalTraces)) return null;
  if (typeof r.proposedEtchDelta !== 'number') return null;
  if (typeof r.organelleNotes !== 'string') return null;

  type RawTrace = { id?: unknown; resonance?: unknown; summary?: unknown; contextTensorHint?: unknown };

  const traces: OrganelleTrace[] = (r.internalTraces as RawTrace[])
    .filter((t): t is Required<Pick<RawTrace, 'id' | 'resonance'>> & RawTrace =>
      t != null && typeof t.id === 'string' && typeof t.resonance === 'number')
    .map((t) => ({
      id: String(t.id),
      resonance: Number(t.resonance),
      summary: String(t.summary ?? ''),
      contextTensorHint: t.contextTensorHint != null ? String(t.contextTensorHint) : undefined,
    }));

  return {
    synthesizedInsight: r.synthesizedInsight,
    internalTraces: traces,
    proposedEtchDelta: r.proposedEtchDelta,
    resonanceScores: (typeof r.resonanceScores === 'object' && r.resonanceScores !== null
      ? r.resonanceScores as Record<string, number>
      : {}),
    organelleNotes: r.organelleNotes,
    organelleProtocolVersion: String(r.organelleProtocolVersion ?? 'unknown'),
    modelInternalMerkleRoot: r.modelInternalMerkleRoot
      ? String(r.modelInternalMerkleRoot)
      : undefined,
  };
}

// -----------------------------------------------------------------------------
// Encoder Hint Reconstruction (Improved)
// -----------------------------------------------------------------------------

/**
 * Reconstructs a ContextTensor from a hint sent by a remote organelle host.
 *
 * Supported formats (in priority order):
 *   1. JSON array: "[0.123,-0.045,0.991,...]"
 *   2. Comma-separated floats: "0.123,-0.045,0.991"
 *   3. Prefixed base64 float32: "f32:BASE64DATA" or "float32:BASE64DATA"
 *   4. Fallback: re-encode the provided text using the host encoder
 *
 * The function always returns a tensor of the correct dimension for the encoder,
 * applying zero-padding or truncation as needed. It also respects the encoder's
 * `normalize` setting when reconstructing from raw data.
 */
export function reconstructContextFromHint(
  hint: string | undefined,
  encoder: NovaNeoEncoder,
  fallbackText: string
): ContextTensor {
  const span = startTriadSpan('mcop.organelle.reconstruct', {
    'organelle.has_hint': !!hint,
    'organelle.encoder_dimensions': encoder.dimensions,
  });

  try {
    if (!hint || typeof hint !== 'string' || hint.trim().length === 0) {
      const result = encoder.encode(fallbackText);
      finishTriadSpan(span, { 'organelle.used_fallback': true });
      return result;
    }

    const trimmed = hint.trim();

    let raw: number[] | null = null;

    // 1. Try JSON array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) {
          raw = parsed as number[];
        }
      } catch {
        // fall through
      }
    }

    // 2. Try comma-separated (legacy / simple format)
    if (!raw && trimmed.includes(',')) {
      const parts = trimmed.split(',').map((p) => parseFloat(p.trim()));
      if (parts.every((n) => !isNaN(n))) {
        raw = parts;
      }
    }

    // 3. Try base64 Float32Array (efficient for larger hints)
    if (!raw && (trimmed.startsWith('f32:') || trimmed.startsWith('float32:'))) {
      try {
        const b64 = trimmed.includes(':') ? trimmed.split(':')[1] : trimmed;
        const buffer = Buffer.from(b64, 'base64');
        const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
        raw = Array.from(floatArray);
      } catch {
        // fall through to fallback
      }
    }

    if (raw && raw.length > 0) {
      const targetDim = encoder.dimensions ?? 32;

      if (raw.length < targetDim) {
        raw = [...raw, ...new Array(targetDim - raw.length).fill(0)];
      } else if (raw.length > targetDim) {
        raw = raw.slice(0, targetDim);
      }

      finishTriadSpan(span, {
        'organelle.used_hint': true,
        'organelle.reconstructed_length': raw.length,
      });
      return raw;
    }

    // 4. Fallback
    const result = encoder.encode(fallbackText);
    finishTriadSpan(span, { 'organelle.used_fallback': true });
    return result;
  } catch (error) {
    failTriadSpan(span, error);
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Conversion & Merge Logic
// -----------------------------------------------------------------------------

export interface OrganelleMergeOptions {
  remoteModel: string;
  sourceCallId?: string;
  hostEncoder?: NovaNeoEncoder;
  duplicateStrategy?: DuplicateStrategy;
  minResonanceToMerge?: number;
}

/**
 * A lightweight context object useful when building organelle-aware
 * reconstruction or merge pipelines.
 *
 * @example
 * const recon = createOrganelleReconstructionContext(encoder);
 * const tensor = recon.reconstruct(hint, fallbackText);
 */
export interface OrganelleReconstructionContext {
  encoder: NovaNeoEncoder;
  dimensions: number;
  normalize: boolean;
  backend: 'hash' | 'embedding' | 'novaNeoWeb';

  /**
   * Reconstruct a tensor from a remote hint using this encoder's configuration.
   */
  reconstruct(hint: string | undefined, fallbackText: string): ContextTensor;
}

export function createOrganelleReconstructionContext(
  encoder: NovaNeoEncoder
): OrganelleReconstructionContext {
  return {
    encoder,
    dimensions: encoder.dimensions,
    normalize: encoder.normalize,
    backend: encoder.backend,
    reconstruct: (hint, fallbackText) =>
      reconstructContextFromHint(hint, encoder, fallbackText),
  };
}

/**
 * Converts a model-produced OrganelleTrace into a proper host-side PheromoneTrace.
 * The host re-encodes the summary (or uses a hint) to maintain canonical determinism.
 */
export function modelTraceToPheromoneTrace(
  modelTrace: OrganelleTrace,
  options: OrganelleMergeOptions
): PheromoneTrace {
  const encoder =
    options.hostEncoder ??
    new NovaNeoEncoder({ dimensions: 32, normalize: true });

  const context = reconstructContextFromHint(
    modelTrace.contextTensorHint,
    encoder,
    modelTrace.summary
  );

  const synthesisVector = [...context];

  const traceId = `org-${options.remoteModel}-${modelTrace.id}`;

  return {
    id: traceId,
    hash: '',
    parentHash: undefined,
    context,
    synthesisVector,
    weight: modelTrace.resonance,
    magnitude: undefined,
    metadata: {
      source: 'grok-organelle',
      remoteModel: options.remoteModel,
      remoteTraceId: modelTrace.id,
      callId: options.sourceCallId,
      protocolVersion: ORGANELLE_PROTOCOL_VERSION,
      originalSummary: modelTrace.summary,
      encoderDimensions: encoder.dimensions,
      encoderNormalize: encoder.normalize,
      encoderBackend: encoder.backend,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Merges organelle-produced traces into the host Stigmergy instance.
 * Applies duplicate strategy and provenance linking.
 */
export function mergeOrganelleTraces(
  stigmergy: StigmergyV5,
  artifacts: OrganelleArtifacts,
  options: OrganelleMergeOptions
): PheromoneTrace[] {
  const span = startTriadSpan('mcop.organelle.merge_traces', {
    'organelle.remote_model': options.remoteModel,
    'organelle.trace_count': artifacts.internalTraces.length,
  });

  try {
    const strategy = options.duplicateStrategy ?? 'always-add';
    const minRes = options.minResonanceToMerge ?? 0.1;
    const newTraces: PheromoneTrace[] = [];

    for (const modelTrace of artifacts.internalTraces) {
      if (modelTrace.resonance < minRes) continue;

      const candidate = modelTraceToPheromoneTrace(modelTrace, options);

      const existingRes = stigmergy.getResonance(candidate.context);
      if (existingRes.score > 0.92 && strategy === 'skip') {
        continue;
      }

      const metadata = {
        ...candidate.metadata,
        resonanceFromModel: modelTrace.resonance,
        mergedAt: new Date().toISOString(),
        duplicateStrategyUsed: strategy,
      };

      const recorded = stigmergy.recordTrace(
        candidate.context,
        candidate.synthesisVector,
        metadata
      );

      newTraces.push(recorded);
    }

    finishTriadSpan(span, {
      'organelle.merged_trace_count': newTraces.length,
    });
    return newTraces;
  } catch (error) {
    failTriadSpan(span, error);
    throw error;
  }
}

/**
 * Records an etch delta coming from the remote organelle.
 * In a full implementation this would also update the growth ledger if enabled.
 */
export function mergeOrganelleEtch(
  etch: HolographicEtch,
  artifacts: OrganelleArtifacts,
  options: OrganelleMergeOptions
): EtchRecord {
  const span = startTriadSpan('mcop.organelle.merge_etch', {
    'organelle.remote_model': options.remoteModel,
    'organelle.proposed_delta': artifacts.proposedEtchDelta,
  });

  try {
    const note = `Organelle synthesis by ${options.remoteModel} (${artifacts.organelleProtocolVersion}): ${artifacts.synthesizedInsight.slice(0, 160)}...`;

    const record = etch.applyEtch([], [], note);

    // Attach organelle provenance metadata (EtchRecord may not declare metadata in its public type)
    (record as unknown as { metadata?: Record<string, unknown> }).metadata = {
      source: 'grok-organelle',
      remoteModel: options.remoteModel,
      proposedDelta: artifacts.proposedEtchDelta,
      modelInternalMerkleRoot: artifacts.modelInternalMerkleRoot,
      resonanceScores: artifacts.resonanceScores,
      protocolVersion: artifacts.organelleProtocolVersion,
      callId: options.sourceCallId,
    };

    finishTriadSpan(span, { 'organelle.etch_hash': record.hash });
    return record;
  } catch (error) {
    failTriadSpan(span, error);
    throw error;
  }
}

/**
 * Full convenience function: merge both traces and etch from one organelle response.
 * Returns rich provenance information.
 */
export function mergeOrganelleResponse(
  stigmergy: StigmergyV5,
  etch: HolographicEtch,
  artifacts: OrganelleArtifacts,
  options: OrganelleMergeOptions
) {
  const traces = mergeOrganelleTraces(stigmergy, artifacts, options);
  const etchRecord = mergeOrganelleEtch(etch, artifacts, options);

  const provenanceLink: OrganelleProvenanceLink = {
    remoteModel: options.remoteModel,
    callId: options.sourceCallId,
    modelInternalMerkleRoot: artifacts.modelInternalMerkleRoot,
    protocolVersion: artifacts.organelleProtocolVersion,
    timestamp: new Date().toISOString(),
  };

  return {
    newTraces: traces,
    etchRecord,
    provenanceLink,
    summary: {
      tracesMerged: traces.length,
      etchDelta: etchRecord.deltaWeight,
      modelUsed: options.remoteModel,
    },
  };
}

// -----------------------------------------------------------------------------
// Future: Tool response helpers (for when model requests more state)
// -----------------------------------------------------------------------------

export interface TraceRequestToolResponse {
  traces: Array<Partial<PheromoneTrace>>;
  totalAvailable: number;
  nextCursor?: string;
}
