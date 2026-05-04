import { HashingTrickBackend, defaultEmbeddingBackend } from './embeddingEngine';
import { StigmergyV5 } from './stigmergyV5';
import { HolographicEtch } from './holographicEtch';
import { SynthesisProvenanceTracer } from './provenanceTracer';
import type { ContextTensor } from './types';

/**
 * Long-form video orchestrator — composes the MCOP triad
 * (embedding → stigmergy → etch → provenance) around any clip-level
 * video adapter to produce coherent, Merkle-traced video sequences
 * beyond the per-call duration ceiling of underlying providers
 * (PAI 3 min, Veo ~2 min, Sora ~1 min).
 *
 * Architectural correspondence to arXiv 2510.01784 (MemoryPack + Direct
 * Forcing) — see `examples/memorypack_direct_forcing.py`:
 *
 *   FramePack (short-term)        ↔ recent stigmergy traces (last K clips)
 *   SemanticPack (long-term)      ↔ {@link StigmergyV5.getResonance} over
 *                                    the embedded narrative prompt
 *   Direct Forcing                ↔ feed each clip's *generated* fingerprint
 *                                    (not the prompt) back into the bank, so
 *                                    subsequent clips condition on what was
 *                                    actually produced
 *   Provenance                    ↔ {@link SynthesisProvenanceTracer}
 *
 * The orchestrator intentionally does not bundle a diffusion backbone;
 * production deployments inject a {@link VideoClipAdapter} backed by
 * MagnificMCOPAdapter, an in-house Wan/CogVideoX runner, or a test stub.
 */
export interface VideoClipAdapter {
  generateClip(input: VideoClipInput): Promise<VideoClipOutput>;
}

export interface VideoClipInput {
  /** Prompt augmented with retrieval context for this clip. */
  prompt: string;
  /** Target clip duration in seconds. */
  durationSeconds: number;
  /** Zero-based index within the long-form sequence. */
  clipIndex: number;
  /** Total number of clips planned for the sequence. */
  totalClips: number;
  /** Resonance score (0..1) against prior clips, for downstream metrics. */
  priorResonance: number;
  /** Optional adapter-specific options (model, fps, seed, …). */
  options?: Record<string, unknown>;
}

export interface VideoClipOutput {
  assetUrl: string;
  /**
   * Optional latent or feature vector representing the generated clip.
   * If absent, the orchestrator falls back to embedding `assetUrl` so the
   * memory chain remains intact.
   */
  fingerprint?: ContextTensor;
  raw?: unknown;
}

export interface LongFormGenerateOptions {
  totalDurationSec: number;
  clipDurationSec?: number;
  /** Embedding dimensionality used for retrieval and etching. */
  embeddingDimensions?: number;
  /** Forwarded to the adapter as `input.options`. */
  adapterOptions?: Record<string, unknown>;
}

export interface ClipRecord {
  clipIndex: number;
  prompt: string;
  assetUrl: string;
  fingerprint: ContextTensor;
  resonance: number;
  etchHash: string;
  traceId: string;
  /** Merkle hash of this clip's `synthesize` event chain root. */
  provenanceRoot: string;
}

export interface LongFormGenerateResult {
  clips: ClipRecord[];
  /** Final Merkle root after all clips, or `undefined` if zero produced. */
  finalRoot: string | undefined;
}

export interface LongFormVideoOrchestratorDeps {
  adapter: VideoClipAdapter;
  tracer: SynthesisProvenanceTracer;
  stigmergy: StigmergyV5;
  etch: HolographicEtch;
  embedder?: HashingTrickBackend;
}

const DEFAULT_CLIP_SEC = 30;
const DEFAULT_DIM = 256;

export class LongFormVideoOrchestrator {
  private readonly adapter: VideoClipAdapter;
  private readonly tracer: SynthesisProvenanceTracer;
  private readonly stigmergy: StigmergyV5;
  private readonly etch: HolographicEtch;
  private readonly embedder: HashingTrickBackend;

  constructor(deps: LongFormVideoOrchestratorDeps) {
    this.adapter = deps.adapter;
    this.tracer = deps.tracer;
    this.stigmergy = deps.stigmergy;
    this.etch = deps.etch;
    this.embedder = deps.embedder ?? (defaultEmbeddingBackend as HashingTrickBackend);
  }

  async generate(
    narrativePrompt: string,
    options: LongFormGenerateOptions,
  ): Promise<LongFormGenerateResult> {
    const clipSec = options.clipDurationSec ?? DEFAULT_CLIP_SEC;
    if (clipSec <= 0) {
      throw new Error('clipDurationSec must be positive');
    }
    if (options.totalDurationSec <= 0) {
      throw new Error('totalDurationSec must be positive');
    }
    const totalClips = Math.max(1, Math.ceil(options.totalDurationSec / clipSec));
    const dim = options.embeddingDimensions ?? DEFAULT_DIM;

    const clips: ClipRecord[] = [];

    for (let i = 0; i < totalClips; i++) {
      const remaining = options.totalDurationSec - i * clipSec;
      const duration = Math.min(clipSec, remaining);

      const queryEmbedding = this.embedder.encode(narrativePrompt, dim, true);
      const resonance = this.stigmergy.getResonance(queryEmbedding);

      const augmentedPrompt = this.composePrompt(narrativePrompt, i, totalClips, resonance.score);

      const output = await this.adapter.generateClip({
        prompt: augmentedPrompt,
        durationSeconds: duration,
        clipIndex: i,
        totalClips,
        priorResonance: resonance.score,
        options: options.adapterOptions,
      });

      const fingerprint =
        output.fingerprint ?? this.embedder.encode(output.assetUrl, dim, true);

      // Direct Forcing analog: feed the *generated* fingerprint (not the
      // prompt embedding) back into the memory chain, so subsequent clips
      // condition on what the model actually produced.
      const provenance = this.tracer.synthesize(augmentedPrompt, {
        clipIndex: i,
        totalClips,
        assetUrl: output.assetUrl,
        priorResonance: resonance.score,
      });

      const memoryContext = blendFingerprints(queryEmbedding, fingerprint);
      const trace = this.stigmergy.recordTrace(memoryContext, fingerprint, {
        clipIndex: i,
        assetUrl: output.assetUrl,
        provenanceRoot: provenance.root,
      });

      const etchRecord = this.etch.applyEtch(
        fingerprint,
        fingerprint,
        `clip-${i}:${output.assetUrl}`,
      );

      clips.push({
        clipIndex: i,
        prompt: augmentedPrompt,
        assetUrl: output.assetUrl,
        fingerprint,
        resonance: resonance.score,
        etchHash: etchRecord.hash,
        traceId: trace.id,
        provenanceRoot: provenance.root,
      });
    }

    return { clips, finalRoot: this.tracer.getRoot() };
  }

  /** Verify the orchestrator's underlying provenance chain. */
  verify(): { ok: true } | { ok: false; brokenAt: number } {
    return this.tracer.verify();
  }

  private composePrompt(
    narrative: string,
    clipIndex: number,
    totalClips: number,
    priorResonance: number,
  ): string {
    const continuity =
      clipIndex === 0
        ? 'opening shot'
        : `continuation of clip ${clipIndex} of ${totalClips} (prior coherence ${priorResonance.toFixed(3)})`;
    return `[${continuity}] ${narrative}`;
  }
}

function blendFingerprints(a: ContextTensor, b: ContextTensor): ContextTensor {
  const len = Math.max(a.length, b.length);
  const out = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    out[i] = ((a[i] ?? 0) + (b[i] ?? 0)) / 2;
  }
  return out;
}
