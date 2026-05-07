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
import type { PheromoneTrace } from '../core/types';
import {
  AdapterCapabilities,
  AdapterRequest,
} from './types';
import {
  GROK_4_3_LOW_MEMORY_MCOP_PRESET,
  LowMemoryMCOPMode,
  LowMemoryMCOPModeConfig,
} from '../core/lowMemoryMCOPMode';

/** Names of the xAI hosted Grok models known at the time of writing. */
export type GrokModel =
  | 'grok-4'
  | 'grok-4-fast'
  | 'grok-4-mini'
  | 'grok-3'
  | 'grok-3-fast'
  | 'grok-3-mini'
  | 'grok-3-mini-fast'
  | 'grok-2'
  | 'grok-beta'
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
}

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

export interface GrokModelMapping {
  readonly model: GrokModel;
  readonly tier: 'flagship' | 'fast' | 'balanced' | 'legacy';
  readonly contextWindow: number;
  readonly defaultTemperature: number;
  readonly useCases: ReadonlyArray<string>;
}

export const GROK_MODEL_MAPPINGS: Readonly<Record<string, GrokModelMapping>> = Object.freeze({
  'grok-4': Object.freeze({
    model: 'grok-4',
    tier: 'flagship',
    contextWindow: 256_000,
    defaultTemperature: 0.35,
    useCases: ['hard-reasoning', 'arc-agi', 'agentic-planning'],
  }),
  'grok-4-fast': Object.freeze({
    model: 'grok-4-fast',
    tier: 'fast',
    contextWindow: 256_000,
    defaultTemperature: 0.3,
    useCases: ['low-latency-routing', 'meta-tuning', 'tool-use'],
  }),
  'grok-4-mini': Object.freeze({
    model: 'grok-4-mini',
    tier: 'balanced',
    contextWindow: 128_000,
    defaultTemperature: 0.4,
    useCases: ['production-default', 'cost-aware-completions', 'stigmergy-recall'],
  }),
  'grok-3': Object.freeze({
    model: 'grok-3',
    tier: 'legacy',
    contextWindow: 128_000,
    defaultTemperature: 0.4,
    useCases: ['compatibility', 'replay'],
  }),
  'grok-3-mini': Object.freeze({
    model: 'grok-3-mini',
    tier: 'legacy',
    contextWindow: 128_000,
    defaultTemperature: 0.4,
    useCases: ['compatibility', 'ci-fixtures'],
  }),
});

export const MAPPING_GROK_PRODUCTION_PROFILE = Object.freeze({
  id: 'mapping_grok',
  adapter: 'xai-grok',
  defaultModel: 'grok-4-mini' as GrokModel,
  fallbackModel: 'grok-3-mini' as GrokModel,
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

  constructor(config: GrokAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultModel = config.defaultModel ?? MAPPING_GROK_PRODUCTION_PROFILE.defaultModel;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? MAPPING_GROK_PRODUCTION_PROFILE.entropyTarget;
    this.hooks = config.hooks ?? {};
  }

  protected platformName(): string {
    return 'xai-grok';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'xai-grok',
      version: '2025-01',
      models: [
        'grok-4',
        'grok-4-fast',
        'grok-4-mini',
        'grok-3',
        'grok-3-fast',
        'grok-3-mini',
        'grok-3-mini-fast',
        'grok-2',
        'grok-beta',
      ],
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
   */
  async generateOptimizedCompletion(
    prompt: string,
    options: GrokCompletionOptions = {},
    extras: Pick<
      GrokRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    const { lowMemory, stigmergyHistory, ...platformOptions } = options;
    const lowMemoryConfig = lowMemory === true
      ? GROK_4_3_LOW_MEMORY_MCOP_PRESET
      : lowMemory;
    const effectivePrompt = lowMemoryConfig
      ? new LowMemoryMCOPMode(lowMemoryConfig).prunePrompt(prompt)
      : prompt;
    return this.generate({
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

    const context: GrokPipelineHookContext = { dispatch, request, options: clientOptions };
    await this.hooks.beforeDispatch?.(context);
    const result = await this.client.createCompletion({ messages, options: clientOptions });
    await this.hooks.afterDispatch?.({ ...context, result });
    return result;
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
  const baseUrl = (config.baseUrl ?? 'https://api.x.ai/v1').replace(
    /\/+$/u,
    '',
  );
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
