/**
 * Grok / xAI MCOP Adapter — wires xAI's OpenAI-compatible chat-completions
 * endpoint into the deterministic MCOP triad. Like the other adapters in
 * this directory, it does NOT bundle the vendor SDK; instead it accepts a
 * thin client interface so callers can supply either:
 *
 *   - the bundled `defaultGrokClient(...)` (a small `fetch`-based wrapper
 *     that talks directly to `https://api.x.ai/v1/chat/completions`), or
 *   - a Jest fixture / in-house wrapper / replay harness for tests.
 *
 * Beyond the standard `IMCOPAdapter` surface this adapter ships the
 * self-referential routing helper `chooseProviderByEntropyResonance`,
 * which lets MCOP itself decide whether to call Grok or fall back to a
 * local model based on the encoder's entropy estimate and the stigmergy
 * resonance score for the incoming prompt. The routing thresholds are
 * configurable per call so an orchestrator can A/B-test policies without
 * patching the adapter.
 */

import {
  BaseAdapter,
  BaseAdapterDeps,
  PreparedDispatch,
} from './baseAdapter';
import type { AdapterResponse } from './types';
import type { PheromoneTrace } from '../core/types';
import {
  AdapterCapabilities,
  AdapterRequest,
} from './types';
import { trimTrailingSlashes } from '../utils/urlSafety';
import {
  GROK_4_3_LOW_MEMORY_MCOP_PRESET,
  LowMemoryMCOPMode,
  LowMemoryMCOPModeConfig,
} from '../core/lowMemoryMCOPMode';
import {
  createOrganelleReconstructionContext,
  validateOrganelleArtifacts,
  type OrganelleArtifacts,
  type OrganelleProvenanceLink,
} from '../utils/organelleMerge';
import {
  startTriadSpan,
  finishTriadSpan,
  failTriadSpan,
} from '../core/observability';
import type {
  LedgerClient,
  BackgroundLedgerForwarder,
  RedisAsyncLedgerForwarder,
} from '../ledger';

/**
 * Names of the xAI hosted Grok chat models known at the time of writing
 * (catalog refreshed 2026-05 against https://docs.x.ai/docs/models).
 *
 * The legacy `grok-4-mini` / `grok-4-fast` / `grok-3*` / `grok-2` /
 * `grok-beta` identifiers were removed by xAI in early 2026 and now
 * return `400 Model not found` from the live endpoint.  Callers that
 * still need them can pass an arbitrary string via the `(string & {})`
 * branch — the adapter forwards model names verbatim and does not
 * validate against the union.
 */
export type GrokModel =
  | 'grok-4.3'
  | 'grok-4.20-0309-reasoning'
  | 'grok-4.20-0309-non-reasoning'
  | 'grok-4.20-multi-agent-0309'
  | 'grok-4-1-fast-reasoning'
  | 'grok-4-1-fast-non-reasoning'
  | (string & {});

/** Per-request options forwarded to the xAI chat-completions endpoint. */
export interface GrokCompletionOptions {
  model?: GrokModel;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /**
   * Optional system message prepended to the dispatch. The user prompt
   * (the MCOP-refined prompt) is always sent as the trailing `user`
   * message regardless of this field.
   */
  systemPrompt?: string;
  /** Stop sequences forwarded verbatim to the vendor. */
  stop?: ReadonlyArray<string>;
  /** xAI-compatible response format, e.g. `{ type: 'json_object' }`. */
  responseFormat?: Record<string, unknown>;
  /** OpenAI-compatible tool/function declarations forwarded to xAI. */
  tools?: ReadonlyArray<Record<string, unknown>>;
  /** Tool choice forwarded to xAI when tools are present. */
  toolChoice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  /** Optional caller/user identifier for vendor-side abuse monitoring. */
  user?: string;
  /** Per-request retry policy for xAI 429/5xx responses. */
  retry?: Partial<GrokRateLimitRetryConfig>;
  /** Optional deterministic prompt pruning for high-capability model routing. */
  lowMemory?: LowMemoryMCOPModeConfig | boolean;
  /**
   * Inject prior Stigmergy traces as a compact Merkle-auditable memory block
   * before the current refined prompt. `true` uses the default of 10 traces.
   */
  stigmergyHistory?: boolean | GrokStigmergyHistoryOptions;

  /**
   * Enable bidirectional MCOP Organelle Host mode.
   *
   * When enabled for capable models (grok-4.3+), the adapter will:
   * - Ship the LowMemoryMCOPProfile + reconstruction instructions.
   * - Expect the model to perform MCOP operations internally.
   * - Parse returned organelle artifacts and merge them into the host
   *   StigmergyV5 + HolographicEtch using the public reconstruction APIs.
   *
   * This turns Grok into a remote execution substrate for the MCOP triad.
   */
  organelleMode?: boolean | {
    enabled?: boolean;
    /** Which profile to instruct the model to use internally */
    profile?: 'low-memory' | 'full';
    /** Whether to attempt merging model-produced traces back into host stigmergy */
    mergeTraces?: boolean;
    /** Whether to attempt recording model-produced etches */
    mergeEtches?: boolean;
    /** If true, fail the request if we cannot parse organelle artifacts */
    strictParsing?: boolean;
  };
}

export interface GrokStigmergyHistoryOptions {
  /** Maximum number of prior traces to inject. Default: 10. */
  limit?: number;
  /** Optional task/session label surfaced in the memory block header. */
  label?: string;
  /** Include trace metadata keys in the memory block. Default: true. */
  includeMetadata?: boolean;
}

export interface GrokRequest extends AdapterRequest {
  payload?: {
    options?: GrokCompletionOptions;
  };
}

/** Subset of the xAI usage block we surface to callers. */
export interface GrokUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface GrokRateLimitMetadata {
  readonly limitRequests?: string;
  readonly remainingRequests?: string;
  readonly resetRequests?: string;
  readonly limitTokens?: string;
  readonly remainingTokens?: string;
  readonly resetTokens?: string;
  readonly retryAfterMs?: number;
}

export interface GrokCompletionResult {
  readonly model: string;
  readonly content: string;
  readonly finishReason: string | null;
  readonly usage: GrokUsage | null;
  readonly rateLimit?: GrokRateLimitMetadata;
  readonly raw?: unknown;

  /**
   * When organelleMode was requested, this field contains parsed artifacts
   * and merge information. This provides a richer return type for
   * bidirectional MCOP organelle usage.
   */
  organelle?: {
    /** The raw parsed artifacts from the model (if successfully parsed as JSON) */
    artifacts?: OrganelleArtifacts;
    /** Detailed information about automatic merging performed into host state */
    merged?: {
      traces: number;
      etch: boolean;
      newTraceIds?: string[];
      newEtchHash?: string;
      provenanceLink?: OrganelleProvenanceLink;
    };
    /** Whether organelle mode was active for this call */
    modeUsed: boolean;
  };
}

/** Rich organelle provenance surfaced at the AdapterResponse level. */
export interface GrokOrganelleProvenance {
  modeUsed: boolean;
  artifactsPresent: boolean;
  merged: {
    traces: number;
    etch: boolean;
    newTraceIds?: string[];
    newEtchHash?: string;
    provenanceLink?: OrganelleProvenanceLink;
  };
}

/**
 * Extended AdapterResponse returned by GrokMCOPAdapter methods when
 * organelle mode is used. Contains top-level organelle provenance for
 * convenient typed access.
 */
export type GrokAdapterResponse = AdapterResponse<GrokCompletionResult> & {
  organelleProvenance?: GrokOrganelleProvenance;
};

export interface GrokRateLimitRetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
  readonly retryStatuses: ReadonlyArray<number>;
}

export interface GrokPipelineHookContext {
  readonly dispatch: PreparedDispatch;
  readonly request: GrokRequest;
  readonly options: GrokCompletionOptions;
}

export interface GrokPipelineHooks {
  readonly beforeDispatch?: (context: GrokPipelineHookContext) => void | Promise<void>;
  readonly afterDispatch?: (context: GrokPipelineHookContext & { result: GrokCompletionResult }) => void | Promise<void>;
  readonly onRateLimit?: (event: GrokRateLimitRetryEvent) => void | Promise<void>;
}

export interface GrokRateLimitRetryEvent {
  readonly attempt: number;
  readonly status: number;
  readonly retryAfterMs: number;
  readonly rateLimit: GrokRateLimitMetadata;
}

/**
 * Minimal client surface — keeps the adapter SDK-agnostic and trivial to
 * mock in unit tests.  Implementations MUST pass `messages` through
 * verbatim and return a `GrokCompletionResult` for the first choice.
 */
export interface GrokClient {
  createCompletion(args: {
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    options: GrokCompletionOptions;
  }): Promise<GrokCompletionResult>;
}

export interface GrokAdapterConfig extends BaseAdapterDeps {
  client: GrokClient;
  /** MCOP pipeline hooks for observability, queueing, and production tracing. */
  hooks?: GrokPipelineHooks;
  /** Default model when the request does not supply one. */
  defaultModel?: GrokModel;
  /**
   * Default entropy target for natural-language prompts (0.18 in the
   * specification table — slightly higher than the graphic-domain
   * default because language tensors are inherently more diffuse).
   */
  defaultEntropyTarget?: number;
}

/**
 * Configuration for creating a GrokMCOPAdapter that is automatically
 * wired with reliable (Redis or in-memory) ledger forwarding for organelle mode.
 */
export interface LedgerAwareGrokAdapterConfig extends Omit<GrokAdapterConfig, 'etch'> {
  // Ledger integration
  ledgerClient: LedgerClient;
  ledgerTenantId: string;

  /**
   * Optional Redis client (ioredis, node-redis, or compatible).
   * When provided, the adapter will use RedisAsyncLedgerForwarder (with retry + DLQ)
   * for all organelle ledger writes.
   */
  redis?: unknown;

  /** Forwarder tuning options (passed through) */
  ledgerForwarderConfig?: Record<string, unknown>;

  /**
   * If you want to supply a fully custom HolographicEtch (e.g. with custom storage),
   * you can pass it here. Otherwise one will be created automatically with ledger support.
   */
  etch?: import('../core/holographicEtch').HolographicEtch;
}

export interface GrokModelMapping {
  readonly model: GrokModel;
  readonly tier: 'flagship' | 'fast' | 'balanced' | 'legacy';
  readonly contextWindow: number;
  readonly defaultTemperature: number;
  readonly useCases: ReadonlyArray<string>;
}

/**
 * Catalog of currently-served xAI Grok chat models (refreshed 2026-05).
 *
 * Context windows reflect xAI's public-docs claim of 256k tokens for the
 * grok-4 family at the time of refresh; treat as approximate and verify
 * against live `usage` blocks for cost-critical paths.  `defaultTemperature`
 * is a sensible adapter-level default, NOT a vendor-published constant.
 */
export const GROK_MODEL_MAPPINGS: Readonly<Record<string, GrokModelMapping>> = Object.freeze({
  'grok-4.3': Object.freeze({
    model: 'grok-4.3',
    tier: 'flagship',
    contextWindow: 256_000,
    defaultTemperature: 0.3,
    useCases: ['hard-reasoning', 'arc-agi', 'agentic-planning'],
  }),
  'grok-4.20-0309-reasoning': Object.freeze({
    model: 'grok-4.20-0309-reasoning',
    tier: 'flagship',
    contextWindow: 256_000,
    defaultTemperature: 0.25,
    useCases: ['hard-reasoning', 'chain-of-thought', 'verification'],
  }),
  'grok-4.20-0309-non-reasoning': Object.freeze({
    model: 'grok-4.20-0309-non-reasoning',
    tier: 'balanced',
    contextWindow: 256_000,
    defaultTemperature: 0.4,
    useCases: ['general-completions', 'narrative-refinement', 'stigmergy-recall'],
  }),
  'grok-4.20-multi-agent-0309': Object.freeze({
    model: 'grok-4.20-multi-agent-0309',
    tier: 'flagship',
    contextWindow: 256_000,
    defaultTemperature: 0.3,
    useCases: ['multi-agent-coordination', 'tool-use', 'agentic-planning'],
  }),
  'grok-4-1-fast-reasoning': Object.freeze({
    model: 'grok-4-1-fast-reasoning',
    tier: 'fast',
    contextWindow: 256_000,
    defaultTemperature: 0.3,
    useCases: ['low-latency-reasoning', 'meta-tuning', 'cost-aware-verification'],
  }),
  'grok-4-1-fast-non-reasoning': Object.freeze({
    model: 'grok-4-1-fast-non-reasoning',
    tier: 'fast',
    contextWindow: 256_000,
    defaultTemperature: 0.4,
    useCases: ['production-default', 'cost-aware-completions', 'image-prompt-refinement'],
  }),
});

export const MAPPING_GROK_PRODUCTION_PROFILE = Object.freeze({
  id: 'mapping_grok',
  adapter: 'xai-grok',
  defaultModel: 'grok-4-1-fast-non-reasoning' as GrokModel,
  fallbackModel: 'grok-4.20-0309-non-reasoning' as GrokModel,
  entropyTarget: 0.18,
  stigmergyHistory: Object.freeze({ limit: 10, label: 'mapping_grok', includeMetadata: true }),
  retry: Object.freeze({ maxRetries: 3, baseDelayMs: 500, maxDelayMs: 10_000, jitterRatio: 0.15 }),
  pipelineHooks: Object.freeze(['beforeDispatch', 'afterDispatch', 'onRateLimit']),
});

export class GrokMCOPAdapter extends BaseAdapter<
  GrokRequest,
  GrokCompletionResult
> {
  private readonly client: GrokClient;
  private readonly defaultModel: GrokModel;
  private readonly defaultEntropyTarget: number;
  private readonly hooks: GrokPipelineHooks;

  /**
   * Internal ledger forwarder (if the adapter was created via createLedgerAware).
   * Used by the convenience helper `processOrganelleResultWithLedger`.
   */
  private readonly _ledgerForwarder?: BackgroundLedgerForwarder | RedisAsyncLedgerForwarder;

  private get ledgerForwarder(): BackgroundLedgerForwarder | RedisAsyncLedgerForwarder | undefined {
    return this._ledgerForwarder;
  }

  constructor(config: GrokAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultModel = config.defaultModel ?? MAPPING_GROK_PRODUCTION_PROFILE.defaultModel;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? MAPPING_GROK_PRODUCTION_PROFILE.entropyTarget;
    this.hooks = config.hooks ?? {};
  }

  /**
   * Internal helper that enhances organelleMode options for automatic
   * merge + ledger forwarding when the adapter is ledger-aware.
   */
  private _enhanceOrganelleMode(
    organelleMode: GrokCompletionOptions['organelleMode']
  ): GrokCompletionOptions['organelleMode'] {
    if (!organelleMode) return organelleMode;

    const isLedgerAware = !!this.ledgerForwarder;

    if (!isLedgerAware) return organelleMode;

    const current = typeof organelleMode === 'object' ? organelleMode : { enabled: true };

    return {
      enabled: true,
      mergeTraces: current.mergeTraces !== false,
      mergeEtches: current.mergeEtches !== false,
      strictParsing: current.strictParsing ?? false,
      ...current,
    };
  }

  /**
   * Lower-level generate that returns the richer `GrokAdapterResponse` type
   * when organelleMode is requested.
   */
  generate(input: GrokRequest & { payload?: { options?: { organelleMode: NonNullable<GrokCompletionOptions['organelleMode']> } } }): Promise<GrokAdapterResponse>;

  generate(input: GrokRequest): Promise<AdapterResponse<GrokCompletionResult>>;

  /**
   * Lower-level generate override that performs automatic detection for
   * ledger-aware adapters (those created via `createLedgerAware`).
   *
   * When `organelleMode: true` (or `{ enabled: true }`) is passed in the request
   * payload and the adapter has an internal ledger forwarder, this method
   * automatically enables full trace/etch merging + reliable ledger forwarding
   * (with retry + DLQ) without requiring the caller to set explicit merge flags.
   *
   * This provides consistent "magic" behavior across both the high-level
   * `generateOptimizedCompletion` and the lower-level `generate` APIs.
   */
  async generate(input: GrokRequest): Promise<AdapterResponse<GrokCompletionResult> | GrokAdapterResponse> {
    const enhancedInput = { ...input };

    if (enhancedInput.payload?.options) {
      const opts = { ...enhancedInput.payload.options };
      if (opts.organelleMode) {
        opts.organelleMode = this._enhanceOrganelleMode(opts.organelleMode);
      }
      enhancedInput.payload = { ...enhancedInput.payload, options: opts };
    }

    return super.generate(enhancedInput);
  }

  /**
   * Convenience factory that automatically creates a HolographicEtch with
   * the best available ledger forwarding (Redis-backed with retry + DLQ
   * when a Redis client is provided).
   *
   * This is the recommended way to create a GrokMCOPAdapter when you plan
   * to use organelleMode in production.
   */
  static createLedgerAware(config: LedgerAwareGrokAdapterConfig): GrokMCOPAdapter {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createOrganelleReadyEtch } = require('../ledger/createLedgerAwareHolographicEtch');

    let etch = config.etch;
    let forwarder: BackgroundLedgerForwarder | RedisAsyncLedgerForwarder | undefined;

    if (!etch) {
      const ready = createOrganelleReadyEtch({
        ledgerClient: config.ledgerClient,
        ledgerTenantId: config.ledgerTenantId,
        redis: config.redis,
        ledgerForwarderConfig: config.ledgerForwarderConfig,
        growthLedger: (config as unknown as Record<string, unknown>).growthLedger,
        storage: (config as unknown as Record<string, unknown>).storage,
      });
      etch = ready.etch;
      forwarder = ready.forwarder;
    }

    const adapter = new GrokMCOPAdapter({
      ...config,
      etch: etch!,
    });

    // Store the forwarder for the convenience helper
    // (field is private readonly; this is the only place we set it, after construction)
    (adapter as unknown as { _ledgerForwarder?: BackgroundLedgerForwarder | RedisAsyncLedgerForwarder })._ledgerForwarder = forwarder;

    return adapter;
  }

  protected platformName(): string {
    return 'xai-grok';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'xai-grok',
      version: '2026-05',
      models: Object.keys(GROK_MODEL_MAPPINGS),
      supportsAudit: true,
      features: [
        'chat-completions',
        'system-prompt',
        'temperature-control',
        'usage-metering',
        'mcop-triad-refinement',
        'human-veto',
        'entropy-resonance-routing',
        'low-memory-prompt-pruning',
        'stigmergy-history-injection',
        'mapping-grok-production-profile',
        'rate-limit-retry-after',
        'pipeline-hooks',
        'tool-calling',
        'json-response-format',
        'organelle-host-mode',                    // bidirectional MCOP execution on Grok
        'organelle-hint-reconstruction',          // uses public NovaNeoEncoder API
        'organelle-trace-merge',                  // merges remote traces into host StigmergyV5
      ],
      notes:
        "OpenAI-compatible Chat Completions on https://api.x.ai/v1. " +
        "Refined prompts route through the MCOP triad (encode → resonate → " +
        "dialectical synth → etch) before dispatch; provenance is recorded " +
        "for replay.",
    };
  }

  /**
   * v2.1-spec convenience facade: produces a Grok completion while
   * preserving narrative continuity through the stigmergy layer.  The
   * returned `AdapterResponse` carries the Merkle-rooted provenance
   * bundle so downstream consumers can reproduce or audit the call.
   *
   * When `organelleMode` is enabled, the underlying `GrokCompletionResult`
   * will contain a richer `organelle` field with parsed artifacts and
   * merge provenance information.
   *
   * Additionally, this method automatically propagates key merged organelle
   * provenance to the top level of the returned `AdapterResponse` under
   * the `organelleProvenance` field for convenient access without digging
   * into the platform result.
   *
   * If the adapter was created via `createLedgerAware(...)`, simply passing
   * `organelleMode: true` or `organelleMode: { enabled: true }` will
   * automatically enable full merging + reliable ledger forwarding (using
   * the internal forwarder with retry + DLQ). No need to manually set
   * merge flags or pass forwarders.
   */
  generateOptimizedCompletion(
    prompt: string,
    options: GrokCompletionOptions & { organelleMode: NonNullable<GrokCompletionOptions['organelleMode']> },
    extras?: Record<string, unknown>
  ): Promise<GrokAdapterResponse>;

  generateOptimizedCompletion(
    prompt: string,
    options?: GrokCompletionOptions,
    extras?: Record<string, unknown>
  ): Promise<AdapterResponse<GrokCompletionResult>>;

  async generateOptimizedCompletion(
    prompt: string,
    options: GrokCompletionOptions = {},
    extras: Pick<
      GrokRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    const organelleRequested = !!options.organelleMode && (typeof options.organelleMode !== 'object' || options.organelleMode.enabled !== false);

    const outerSpan = organelleRequested
      ? startTriadSpan('mcop.organelle.generate_optimized', {
          'organelle.requested': true,
          'organelle.ledger_aware': !!this.ledgerForwarder,
          'organelle.auto_merge': true,
        })
      : null;

    try {
      const { lowMemory, stigmergyHistory, ...platformOptions } = options;
    const lowMemoryConfig = lowMemory === true
      ? GROK_4_3_LOW_MEMORY_MCOP_PRESET
      : lowMemory;
    const effectivePrompt = lowMemoryConfig
      ? new LowMemoryMCOPMode(lowMemoryConfig).prunePrompt(prompt)
      : prompt;
    const response = await this.generate({
      prompt: effectivePrompt,
      domain: 'narrative',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: {
        ...(extras.metadata ?? {}),
        assetKind: 'completion',
        model: platformOptions.model ?? this.defaultModel,
        ...(lowMemoryConfig
          ? {
            lowMemory: true,
            originalPromptLength: prompt.length,
            prunedPromptLength: effectivePrompt.length,
          }
          : {}),
        ...(stigmergyHistory
          ? {
            stigmergyHistoryInjected: true,
            stigmergyHistoryLimit: normalizeStigmergyHistoryOptions(stigmergyHistory).limit,
          }
          : {}),
      },
      payload: { options: { ...platformOptions, ...(stigmergyHistory ? { stigmergyHistory } : {}) } },
    });

    // Automatic propagation of merged organelle provenance to the top-level AdapterResponse
    const innerResult = response.result as GrokCompletionResult;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organelle = innerResult?.organelle as any; // complex optional union from new organelle result typing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (organelle?.merged as any);
    if (m) {
      (response as GrokAdapterResponse).organelleProvenance = {
        modeUsed: organelle?.modeUsed ?? false,
        artifactsPresent: !!organelle?.artifacts,
        merged: {
          traces: m.traces,
          etch: m.etch,
          newTraceIds: m.newTraceIds,
          newEtchHash: m.newEtchHash,
          provenanceLink: m.provenanceLink,
        },
      };
    }

    if (outerSpan) {
      finishTriadSpan(outerSpan, {
        'organelle.artifacts_present': !! (response.result as GrokCompletionResult)?.organelle?.artifacts,
        'organelle.merged_traces': (response as GrokAdapterResponse).organelleProvenance?.merged?.traces ?? 0,
        'organelle.fully_automatic': !!this.ledgerForwarder,
      });
    }

    return response;
  } catch (error) {
    if (outerSpan) {
      failTriadSpan(outerSpan, error);
    }
    throw error;
  } finally {
    // Note: the real enrichment span lives inside processOrganelleResult
  }
}

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: GrokRequest,
  ): Promise<GrokCompletionResult> {
    const opts: GrokCompletionOptions = {
      ...(request.payload?.options ?? {}),
      model: request.payload?.options?.model ?? this.defaultModel,
    };
    const { stigmergyHistory, lowMemory: _lowMemory, ...clientOptions } = opts;
    void _lowMemory;

    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];
    if (clientOptions.systemPrompt && clientOptions.systemPrompt.trim().length > 0) {
      messages.push({ role: 'system', content: clientOptions.systemPrompt.trim() });
    }

    const memoryBlock = stigmergyHistory
      ? this.buildStigmergyHistoryBlock(stigmergyHistory, dispatch.trace.id)
      : undefined;
    if (memoryBlock) {
      messages.push({ role: 'system', content: memoryBlock });
    }

    messages.push({ role: 'user', content: dispatch.refinedPrompt });

    // Organelle mode: inject instructions so the model knows it should host MCOP internally
    const organelleInstructions = this.buildOrganelleInstructions(opts, dispatch);
    if (organelleInstructions) {
      messages.push({ role: 'system', content: organelleInstructions });
    }

    const context: GrokPipelineHookContext = { dispatch, request, options: clientOptions };
    await this.hooks.beforeDispatch?.(context);
    const result = await this.client.createCompletion({ messages, options: clientOptions });
    await this.hooks.afterDispatch?.({ ...context, result });

    // Enrich the result with organelle metadata when organelleMode was active.
    // This provides a richer return type containing parsed artifacts and merge provenance.
    const organelleConfig = opts.organelleMode;
    const organelleWasRequested = !!organelleConfig && (typeof organelleConfig !== 'object' || organelleConfig.enabled !== false);

    if (organelleWasRequested) {
      const mergeConfig = typeof organelleConfig === 'object' ? organelleConfig : {};
      const shouldAutoMerge = mergeConfig.mergeTraces !== false || mergeConfig.mergeEtches !== false;

      const isLedgerAware = !!this.ledgerForwarder;
      const _forwarderType = this.ledgerForwarder?.constructor?.name?.includes('Redis')
        ? 'redis'
        : isLedgerAware ? 'memory' : 'none';

      let artifacts: OrganelleArtifacts | undefined;
      try {
        if (result.content) {
          const parsed = JSON.parse(result.content);
          artifacts = validateOrganelleArtifacts(parsed) ?? undefined;
        }
      } catch {
        // Non-fatal
      }

      let mergedInfo: GrokCompletionResult['organelle']['merged'] | undefined;

      if (artifacts && shouldAutoMerge) {
        try {
          const mergeResult = await this.processOrganelleResult(result, {
            mergeTraces: mergeConfig.mergeTraces !== false,
            mergeEtches: mergeConfig.mergeEtches !== false,
            strict: mergeConfig.strictParsing ?? false,
            ledgerClient: (this as unknown as { ledgerClient?: LedgerClient }).ledgerClient,
            ledgerTenantId: (this as unknown as { ledgerTenantId?: string }).ledgerTenantId,
            ledgerForwarder: (this as unknown as { ledgerForwarder?: BackgroundLedgerForwarder | RedisAsyncLedgerForwarder }).ledgerForwarder,
          });

          mergedInfo = {
            traces: mergeResult.mergedTraces,
            etch: mergeResult.mergedEtch,
            newTraceIds: mergeResult.newTraceIds,
            newEtchHash: mergeResult.newEtchHash,
            provenanceLink: mergeResult.provenanceLink,
          };
        } catch {
          // Merging failed, but we still surface parsed artifacts
        }
      }

      (result as GrokCompletionResult & { organelle?: GrokCompletionResult['organelle'] }).organelle = {
        artifacts,
        merged: mergedInfo,
        modeUsed: true,
      };

      // Note: telemetry for organelle enrichment is attached inside
      // processOrganelleResult (and the outer generateOptimized span).
    }

    return result;
  }

  /**
   * Production-grade helper: Given a GrokCompletionResult that may contain
   * organelle artifacts, attempt to reconstruct and merge them into the
   * host's Stigmergy + Etch using the new public NovaNeoEncoder APIs.
   *
   * This is the bridge that turns a raw Grok response into merged host state
   * when operating in bidirectional organelle mode.
   *
   * If the adapter was created via `createLedgerAware(...)`, this method
   * will automatically use the internal ledger forwarder (no need to pass it).
   */
  public async processOrganelleResult(
    result: GrokCompletionResult,
    options: {
      mergeTraces?: boolean;
      mergeEtches?: boolean;
      strict?: boolean;
      /** Optional: forward the resulting organelle etch to the hosted ledger */
      ledgerClient?: LedgerClient;
      ledgerTenantId?: string;
      /** Preferred: pass an already-started BackgroundLedgerForwarder for retry + DLQ */
      ledgerForwarder?: BackgroundLedgerForwarder | RedisAsyncLedgerForwarder;
    } = {}
  ): Promise<{
    mergedTraces: number;
    mergedEtch: boolean;
    newTraceIds: string[];
    newEtchHash?: string;
    provenanceLink?: OrganelleProvenanceLink;
  }> {
    const forwarder = options.ledgerForwarder || this.ledgerForwarder;
    const forwarderType = forwarder?.constructor?.name?.toLowerCase().includes('redis') ? 'redis' : forwarder ? 'memory' : 'none';

    const span = startTriadSpan('mcop.organelle.process_result', {
      'organelle.remote_model': result.model ?? 'unknown',
      'organelle.forwarder_type': forwarderType,
      'organelle.merge_traces': options.mergeTraces !== false,
      'organelle.merge_etches': options.mergeEtches !== false,
      'organelle.strict': !!options.strict,
    });

    // Auto-inject the internal forwarder if the caller didn't provide one
    // and the adapter was created via createLedgerAware.
    if (!options.ledgerForwarder && this.ledgerForwarder) {
      (options as { ledgerForwarder?: BackgroundLedgerForwarder | RedisAsyncLedgerForwarder }).ledgerForwarder = this.ledgerForwarder;
    }

    try {
      const { mergeTraces = true, mergeEtches = true, strict = false } = options;

    if (!result.content) {
      if (strict) throw new Error('No content in organelle result');
      return { mergedTraces: 0, mergedEtch: false, newTraceIds: [] };
    }

    let artifacts: OrganelleArtifacts | null = null;
    try {
      const parsed = JSON.parse(result.content);
      artifacts = validateOrganelleArtifacts(parsed);
    } catch {
      if (strict) throw new Error('Failed to parse organelle artifacts as JSON');
      return { mergedTraces: 0, mergedEtch: false, newTraceIds: [] };
    }

    if (!artifacts) {
      if (strict) throw new Error('Invalid organelle artifacts shape');
      return { mergedTraces: 0, mergedEtch: false, newTraceIds: [] };
    }

    const newTraceIds: string[] = [];
    let newEtchHash: string | undefined;

    const recon = createOrganelleReconstructionContext(this.encoder);

    if (mergeTraces && artifacts.internalTraces?.length) {
      for (const t of artifacts.internalTraces) {
        try {
          const context = recon.reconstruct(t.contextTensorHint, t.summary);
          const recorded = this.stigmergy.recordTrace(context, context, {
            source: 'grok-organelle',
            remoteModel: result.model,
            remoteTraceId: t.id,
            resonanceFromModel: t.resonance,
            modelInternalMerkleRoot: artifacts.modelInternalMerkleRoot,
          });
          newTraceIds.push(recorded.id);
        } catch (err) {
          if (strict) throw err;
        }
      }
    }

    if (mergeEtches) {
      try {
        const etchRecord = this.etch.applyEtch([], [], `Organelle etch from ${result.model}`);
        (etchRecord as unknown as { metadata?: Record<string, unknown> }).metadata = {
          source: 'grok-organelle',
          delta: artifacts.proposedEtchDelta,
          modelInternalMerkleRoot: artifacts.modelInternalMerkleRoot,
          resonanceScores: artifacts.resonanceScores,
        };
        newEtchHash = etchRecord.hash;

        // Direct ledger forwarding for organelle (in addition to any etch-level wiring)
        if (options.ledgerClient && options.ledgerTenantId) {
          const etchRequest = {
            tenantId: options.ledgerTenantId,
            context: [],
            score: artifacts.proposedEtchDelta,
            note: `Grok organelle etch: ${artifacts.synthesizedInsight.slice(0, 120)}`,
            metadata: {
              source: 'grok-organelle',
              model: result.model,
              protocolVersion: artifacts.organelleProtocolVersion,
              modelInternalMerkleRoot: artifacts.modelInternalMerkleRoot,
              resonanceScores: artifacts.resonanceScores,
            },
          };

          // Prefer async forwarder if one is passed or can be created
          if (options.ledgerForwarder) {
            options.ledgerForwarder.forward(etchRequest);
          } else {
            options.ledgerClient.etch(etchRequest).catch((e: unknown) =>
              console.warn?.('[processOrganelleResult] ledger forward failed', e instanceof Error ? e.message : String(e))
            );
          }
        }
      } catch (err) {
        if (strict) throw err;
      }
    }

    const provenanceLink: OrganelleProvenanceLink = {
      remoteModel: result.model,
      modelInternalMerkleRoot: artifacts.modelInternalMerkleRoot,
      protocolVersion: artifacts.organelleProtocolVersion,
      timestamp: new Date().toISOString(),
    };

    const resultSummary = {
      mergedTraces: newTraceIds.length,
      mergedEtch: !!newEtchHash,
      newTraceIds,
      newEtchHash,
      provenanceLink,
    };

    finishTriadSpan(span, {
      'organelle.merged_traces': resultSummary.mergedTraces,
      'organelle.merged_etch': resultSummary.mergedEtch,
      'organelle.new_trace_count': resultSummary.newTraceIds.length,
      'organelle.had_ledger_forward': !!options.ledgerForwarder || !!this.ledgerForwarder,
    });

    return resultSummary;
  } catch (error) {
    failTriadSpan(span, error);
    throw error;
  }
}

/**
 * Convenience helper that automatically uses the internal ledger forwarder
 * (if the adapter was created via `createLedgerAware`).
 *
 * This is the recommended way to process organelle results when using the
 * ledger-aware factory — you no longer need to manually pass the forwarder.
 */
public async processOrganelleResultWithLedger(
  result: GrokCompletionResult,
  options: {
    strict?: boolean;
    mergeTraces?: boolean;
    mergeEtches?: boolean;
  } = {}
) {
  const forwarder = this._ledgerForwarder;

  return this.processOrganelleResult(result, {
    ...options,
    ledgerForwarder: forwarder,
    // Also pass raw client/tenant as fallback if someone created the adapter manually
    ledgerClient: (this as unknown as { ledgerClient?: LedgerClient }).ledgerClient,
    ledgerTenantId: (this as unknown as { ledgerTenantId?: string }).ledgerTenantId,
  });
}

/**
 * High-level one-shot helper for the common production pattern:
 *
 *   Generate a completion with organelleMode enabled +
 *   automatically perform merge + ledger forwarding in a single call,
 *   using the internal forwarder that was wired during `createLedgerAware`.
 *
 * This is the most ergonomic way to do "generate + organelle ledger forward" in one shot.
 */
public async generateOptimizedCompletionWithOrganelleLedger(
  prompt: string,
  organelleOptions: Partial<NonNullable<GrokCompletionOptions['organelleMode']>> & {
    mergeTraces?: boolean;
    mergeEtches?: boolean;
  } = {},
  extras: Pick<
    GrokRequest,
    'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
  > = {}
) {
  const baseMode = {
    enabled: true,
    mergeTraces: organelleOptions.mergeTraces !== false,
    mergeEtches: organelleOptions.mergeEtches !== false,
  };
  const fullOrganelleMode = { ...baseMode, ...(organelleOptions as Record<string, unknown>) };

  return this.generateOptimizedCompletion(
    prompt,
    {
      organelleMode: fullOrganelleMode,
    },
    extras
  );
}

  private buildOrganelleInstructions(
    options: GrokCompletionOptions,
    _dispatch: PreparedDispatch,
  ): string | undefined {
    const mode = options.organelleMode;
    if (!mode) return undefined;

    const config = typeof mode === 'object' ? mode : {};
    if (config.enabled === false) return undefined;

    const profile = config.profile ?? 'low-memory';
    const profileData = profile === 'low-memory' ? GROK_4_3_LOW_MEMORY_MCOP_PRESET : null;

    if (!profileData) {
      return undefined; // only low-memory supported in v1
    }

    const instructions = [
      `You are now operating as a host for the MCOP organelle under protocol grok-organelle-v2.`,
      ``,
      `You have been given the following compact LowMemoryMCOPProfile. You MUST use these exact parameters for all internal MCOP operations:`,
      JSON.stringify(profileData, null, 2),
      ``,
      `Required behavior:`,
      `- Perform internal encoding using the profile.`,
      `- Do stigmergic recall against any history provided earlier in this conversation.`,
      `- Execute at least one round of resonance + dialectical synthesis internally.`,
      `- Emit structured artifacts at the end in the required JSON shape (see organelle contract).`,
      ``,
      `When possible, include a "contextTensorHint" field in your returned traces using JSON array format for high-fidelity reconstruction on the host side.`,
    ].join('\n');

    return instructions;
  }

  private buildStigmergyHistoryBlock(
    history: boolean | GrokStigmergyHistoryOptions,
    currentTraceId: string,
  ): string | undefined {
    const options = normalizeStigmergyHistoryOptions(history);
    if (options.limit <= 0) return undefined;

    const traces = this.stigmergy
      .getRecent(options.limit + 1)
      .filter((trace) => trace.id !== currentTraceId)
      .slice(-options.limit);
    if (traces.length === 0) return undefined;

    const label = options.label ? ` (${options.label})` : '';
    const lines = traces.map((trace, index) =>
      formatStigmergyHistoryTrace(trace, index + 1, options.includeMetadata),
    );
    return [
      `MCOP Stigmergy v5 Merkle memory${label}:`,
      'Use these prior verified traces for continuity; do not fabricate missing steps.',
      ...lines,
    ].join('\n');
  }
}

function normalizeStigmergyHistoryOptions(
  history: boolean | GrokStigmergyHistoryOptions,
): Required<GrokStigmergyHistoryOptions> {
  if (history === true) {
    return { limit: 10, label: '', includeMetadata: true };
  }
  if (history === false) {
    return { limit: 0, label: '', includeMetadata: true };
  }
  const rawLimit = history.limit ?? 10;
  const limit = Number.isFinite(rawLimit)
    ? Math.max(0, Math.floor(rawLimit))
    : 10;
  return {
    limit,
    label: history.label ?? '',
    includeMetadata: history.includeMetadata ?? true,
  };
}

function formatStigmergyHistoryTrace(
  trace: PheromoneTrace,
  ordinal: number,
  includeMetadata: boolean,
): string {
  const parts = [
    `${ordinal}. trace=${trace.id}`,
    `hash=${trace.hash}`,
    trace.parentHash ? `parent=${trace.parentHash}` : undefined,
    `weight=${trace.weight.toFixed(4)}`,
    `timestamp=${trace.timestamp}`,
  ];
  if (includeMetadata && trace.metadata) {
    parts.push(`metadata=${JSON.stringify(redactHistoryMetadata(trace.metadata))}`);
  }
  return parts.filter(Boolean).join(' | ');
}

function redactHistoryMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/api[_-]?key|token|secret|password/iu.test(key)) {
      redacted[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > 160) {
      redacted[key] = `${value.slice(0, 157)}…`;
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/* --------------------------------------------------------------------- */
/* Default fetch-based GrokClient implementation                          */
/* --------------------------------------------------------------------- */

export interface DefaultGrokClientConfig {
  /** xAI API key — required.  Read from `process.env.XAI_API_KEY` if absent. */
  apiKey?: string;
  /** Override the API base.  Defaults to `https://api.x.ai/v1`. */
  baseUrl?: string;
  /**
   * Custom fetch implementation — defaults to the platform global.
   * Useful in Node 18+ tests, edge runtimes, or when piping through a
   * proxy.
   */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms.  Defaults to 60s. */
  timeoutMs?: number;
  /** Retry policy for 429/rate-limit and transient 5xx responses. */
  retry?: Partial<GrokRateLimitRetryConfig>;
  /** Optional hook fired before each retry sleep. */
  onRateLimit?: GrokPipelineHooks['onRateLimit'];
}

interface XaiChatCompletionResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices: ReadonlyArray<{
    readonly index: number;
    readonly message: { readonly role: string; readonly content: string };
    readonly finish_reason: string | null;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

/**
 * Returns a `GrokClient` backed by `fetch` and the public xAI REST API.
 * The function is intentionally separate from `GrokMCOPAdapter` so unit
 * tests can construct adapters without ever touching the network.
 */
export function defaultGrokClient(
  config: DefaultGrokClientConfig = {},
): GrokClient {
  const apiKey =
    config.apiKey ??
    (typeof process !== 'undefined'
      ? process.env?.XAI_API_KEY
      : undefined);
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      'defaultGrokClient: missing XAI_API_KEY — pass `apiKey` explicitly ' +
        'or set the environment variable before constructing the client.',
    );
  }
  const baseUrl = trimTrailingSlashes(config.baseUrl ?? 'https://api.x.ai/v1');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'defaultGrokClient: no fetch implementation available — provide ' +
        '`fetchImpl` explicitly when running on a runtime without a ' +
        'global fetch.',
    );
  }
  const timeoutMs = config.timeoutMs ?? 60_000;

  return {
    async createCompletion({ messages, options }) {
      const body: Record<string, unknown> = {
        model: options.model ?? MAPPING_GROK_PRODUCTION_PROFILE.defaultModel,
        messages,
        temperature:
          options.temperature ??
          GROK_MODEL_MAPPINGS[String(options.model ?? MAPPING_GROK_PRODUCTION_PROFILE.defaultModel)]?.defaultTemperature ??
          0.4,
      };
      if (options.topP !== undefined) body.top_p = options.topP;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.stop && options.stop.length > 0) body.stop = [...options.stop];
      if (options.responseFormat !== undefined) body.response_format = options.responseFormat;
      if (options.tools !== undefined) body.tools = [...options.tools];
      if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
      if (options.user !== undefined) body.user = options.user;

      const requestRetryConfig = normalizeGrokRetryConfig({
        ...config.retry,
        ...options.retry,
      });
      let response = await postXaiCompletion(fetchImpl, `${baseUrl}/chat/completions`, apiKey, body, timeoutMs);
      let rateLimit = readGrokRateLimit(response);
      for (let attempt = 0; shouldRetryXai(response.status, attempt, requestRetryConfig); attempt += 1) {
        const retryAfterMs = rateLimit.retryAfterMs ?? computeGrokBackoffMs(attempt, requestRetryConfig);
        await config.onRateLimit?.({ attempt: attempt + 1, status: response.status, retryAfterMs, rateLimit });
        await sleep(retryAfterMs);
        response = await postXaiCompletion(fetchImpl, `${baseUrl}/chat/completions`, apiKey, body, timeoutMs);
        rateLimit = readGrokRateLimit(response);
      }

      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new GrokApiError(
          `xAI request failed: ${response.status} ${response.statusText}` +
            (detail ? ` — ${detail}` : ''),
          response.status,
          response.statusText,
          rateLimit,
          detail,
        );
      }

      const json = (await response.json()) as XaiChatCompletionResponse;
      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error('xAI response contained no choices');
      }

      const usage: GrokUsage | null = json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? 0,
          }
        : null;

      return {
        model: json.model ?? options.model ?? MAPPING_GROK_PRODUCTION_PROFILE.defaultModel,
        content: choice.message?.content ?? '',
        finishReason: choice.finish_reason ?? null,
        usage,
        rateLimit,
        raw: json,
      };
    },
  };
}


async function postXaiCompletion(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export class GrokApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly rateLimit: GrokRateLimitMetadata,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'GrokApiError';
  }
}

function normalizeGrokRetryConfig(
  config: Partial<GrokRateLimitRetryConfig> = {},
): GrokRateLimitRetryConfig {
  return {
    maxRetries: Math.max(0, Math.floor(config.maxRetries ?? 2)),
    baseDelayMs: Math.max(1, Math.floor(config.baseDelayMs ?? 500)),
    maxDelayMs: Math.max(1, Math.floor(config.maxDelayMs ?? 8_000)),
    jitterRatio: Math.max(0, Math.min(1, config.jitterRatio ?? 0.15)),
    retryStatuses: config.retryStatuses ?? [429, 500, 502, 503, 504],
  };
}

function shouldRetryXai(
  status: number,
  attempt: number,
  config: GrokRateLimitRetryConfig,
): boolean {
  return attempt < config.maxRetries && config.retryStatuses.includes(status);
}

function computeGrokBackoffMs(
  attempt: number,
  config: GrokRateLimitRetryConfig,
): number {
  const exponential = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt);
  const deterministicJitter = Math.round(exponential * config.jitterRatio * ((attempt % 3) / 3));
  return Math.min(config.maxDelayMs, exponential + deterministicJitter);
}

function readGrokRateLimit(response: Response): GrokRateLimitMetadata {
  const headers = response.headers;
  const getHeader = typeof headers?.get === 'function'
    ? (name: string) => headers.get(name)
    : () => null;
  const retryAfterMs = parseRetryAfterMs(getHeader('retry-after'));
  return {
    limitRequests: getHeader('x-ratelimit-limit-requests') ?? undefined,
    remainingRequests: getHeader('x-ratelimit-remaining-requests') ?? undefined,
    resetRequests: getHeader('x-ratelimit-reset-requests') ?? undefined,
    limitTokens: getHeader('x-ratelimit-limit-tokens') ?? undefined,
    remainingTokens: getHeader('x-ratelimit-remaining-tokens') ?? undefined,
    resetTokens: getHeader('x-ratelimit-reset-tokens') ?? undefined,
    retryAfterMs,
  };
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.length > 0 ? text.slice(0, 512) : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------- */
/* Self-referential entropy / resonance routing                           */
/* --------------------------------------------------------------------- */

export type GrokRoutingDecision = 'grok' | 'local' | 'human-review';

export interface EntropyResonanceRouterConfig {
  /**
   * Above this entropy the prompt is "novel" enough to merit a remote
   * call (Grok). Default 0.55 — calibrated against the encoder's
   * normalised entropy range (0..~0.9 in practice).
   */
  noveltyEntropyFloor?: number;
  /**
   * Above this resonance score the prompt strongly matches an existing
   * trace and is cheap to satisfy locally. Default 0.7.
   */
  highResonanceCeiling?: number;
  /**
   * Below this resonance AND above {@link noveltyEntropyFloor} the
   * router escalates to human review instead of silently dispatching
   * a low-confidence remote call. Default 0.15.
   */
  lowResonanceFloor?: number;
}

/**
 * Deterministic routing helper used by `examples/grok_orchestrated_completion.ts`
 * (and any orchestrator wishing to apply the same policy).
 *
 * The decision tree is intentionally tiny so it can be reasoned about
 * by humans in code review:
 *
 *   - `resonance >= highResonanceCeiling`              → `'local'`
 *   - `entropy >= noveltyEntropyFloor && resonance < lowResonanceFloor`
 *                                                       → `'human-review'`
 *   - `entropy >= noveltyEntropyFloor`                 → `'grok'`
 *   - everything else                                  → `'local'`
 *
 * The function is pure: same inputs always produce the same decision,
 * and it never mutates the supplied config.
 */
export function chooseProviderByEntropyResonance(
  signals: { readonly entropy: number; readonly resonance: number },
  config: EntropyResonanceRouterConfig = {},
): GrokRoutingDecision {
  const noveltyFloor = config.noveltyEntropyFloor ?? 0.55;
  const highResCeiling = config.highResonanceCeiling ?? 0.7;
  const lowResFloor = config.lowResonanceFloor ?? 0.15;

  if (signals.resonance >= highResCeiling) return 'local';
  if (
    signals.entropy >= noveltyFloor &&
    signals.resonance < lowResFloor
  ) {
    return 'human-review';
  }
  if (signals.entropy >= noveltyFloor) return 'grok';
  return 'local';
}
