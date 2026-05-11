/**
 * Qwen / Alibaba DashScope MCOP Adapter — wires Qwen's OpenAI-compatible
 * chat-completions endpoint into the deterministic MCOP triad. Mirrors
 * the surface of `grokAdapter.ts` 1:1 so an orchestrator can swap
 * providers without touching the triad configuration. Like the other
 * adapters in this directory, it does NOT bundle the vendor SDK; instead
 * it accepts a thin client interface so callers can supply either:
 *
 *   - the bundled `defaultQwenClient(...)` (a small `fetch`-based wrapper
 *     that talks directly to
 *     `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`),
 *     or
 *   - a Jest fixture / in-house wrapper / replay harness for tests.
 *
 * Beyond the standard `IMCOPAdapter` surface this adapter ships the
 * self-referential routing helper `chooseQwenByEntropyResonance`, which
 * lets MCOP itself decide whether to call Qwen or fall back to a local
 * model based on the encoder's entropy estimate and the stigmergy
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
  QWEN3_LOW_MEMORY_MCOP_PRESET,
  LowMemoryMCOPMode,
  LowMemoryMCOPModeConfig,
} from '../core/lowMemoryMCOPMode';

/**
 * Names of the Alibaba DashScope Qwen chat models known at the time of
 * writing (catalog refreshed 2026-05 against
 * https://docs.qwencloud.com/developer-guides/getting-started/text-generation-models
 * and https://www.alibabacloud.com/help/en/model-studio/models).
 *
 * Callers that need a model outside this union (e.g. a fine-tuned
 * deployment ID, or a newly-released model not yet in this list) can
 * pass an arbitrary string via the `(string & {})` branch — the adapter
 * forwards model names verbatim and does not validate against the union.
 */
export type QwenModel =
  | 'qwen3-max'
  | 'qwen3.5-plus'
  | 'qwen3.5-flash'
  | 'qwen3.6-plus'
  | 'qwen3.6-flash'
  | 'qwen3-coder-plus'
  | 'qwen3-coder-flash'
  | 'qwen-plus'
  | 'qwen-flash'
  | 'qwen-turbo'
  | 'qwen-max'
  | (string & {});

/** Per-request options forwarded to the DashScope chat-completions endpoint. */
export interface QwenCompletionOptions {
  model?: QwenModel;
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
  /** OpenAI-compatible response format, e.g. `{ type: 'json_object' }`. */
  responseFormat?: Record<string, unknown>;
  /** OpenAI-compatible tool/function declarations forwarded to DashScope. */
  tools?: ReadonlyArray<Record<string, unknown>>;
  /** Tool choice forwarded to DashScope when tools are present. */
  toolChoice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  /** Optional caller/user identifier for vendor-side abuse monitoring. */
  user?: string;
  /**
   * Toggle Qwen3+ thinking mode. When `true` the adapter forwards
   * `enable_thinking: true` as a top-level body field — DashScope's
   * OpenAI-compat layer accepts this for Qwen3 hybrid-thinking models.
   */
  enableThinking?: boolean;
  /** Per-request retry policy for DashScope 429/5xx responses. */
  retry?: Partial<QwenRateLimitRetryConfig>;
  /** Optional deterministic prompt pruning for high-capability model routing. */
  lowMemory?: LowMemoryMCOPModeConfig | boolean;
  /**
   * Inject prior Stigmergy traces as a compact Merkle-auditable memory block
   * before the current refined prompt. `true` uses the default of 10 traces.
   */
  stigmergyHistory?: boolean | QwenStigmergyHistoryOptions;
}

export interface QwenStigmergyHistoryOptions {
  /** Maximum number of prior traces to inject. Default: 10. */
  limit?: number;
  /** Optional task/session label surfaced in the memory block header. */
  label?: string;
  /** Include trace metadata keys in the memory block. Default: true. */
  includeMetadata?: boolean;
}

export interface QwenRequest extends AdapterRequest {
  payload?: {
    options?: QwenCompletionOptions;
  };
}

/** Subset of the DashScope usage block we surface to callers. */
export interface QwenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface QwenRateLimitMetadata {
  readonly limitRequests?: string;
  readonly remainingRequests?: string;
  readonly resetRequests?: string;
  readonly limitTokens?: string;
  readonly remainingTokens?: string;
  readonly resetTokens?: string;
  readonly retryAfterMs?: number;
}

export interface QwenCompletionResult {
  readonly model: string;
  readonly content: string;
  readonly finishReason: string | null;
  readonly usage: QwenUsage | null;
  readonly rateLimit?: QwenRateLimitMetadata;
  readonly raw?: unknown;
}

export interface QwenRateLimitRetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
  readonly retryStatuses: ReadonlyArray<number>;
}

export interface QwenPipelineHookContext {
  readonly dispatch: PreparedDispatch;
  readonly request: QwenRequest;
  readonly options: QwenCompletionOptions;
}

export interface QwenPipelineHooks {
  readonly beforeDispatch?: (context: QwenPipelineHookContext) => void | Promise<void>;
  readonly afterDispatch?: (context: QwenPipelineHookContext & { result: QwenCompletionResult }) => void | Promise<void>;
  readonly onRateLimit?: (event: QwenRateLimitRetryEvent) => void | Promise<void>;
}

export interface QwenRateLimitRetryEvent {
  readonly attempt: number;
  readonly status: number;
  readonly retryAfterMs: number;
  readonly rateLimit: QwenRateLimitMetadata;
}

/**
 * Minimal client surface — keeps the adapter SDK-agnostic and trivial to
 * mock in unit tests. Implementations MUST pass `messages` through
 * verbatim and return a `QwenCompletionResult` for the first choice.
 */
export interface QwenClient {
  createCompletion(args: {
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    options: QwenCompletionOptions;
  }): Promise<QwenCompletionResult>;
}

export interface QwenAdapterConfig extends BaseAdapterDeps {
  client: QwenClient;
  /** MCOP pipeline hooks for observability, queueing, and production tracing. */
  hooks?: QwenPipelineHooks;
  /** Default model when the request does not supply one. */
  defaultModel?: QwenModel;
  /**
   * Default entropy target for natural-language prompts (0.18 in the
   * specification table — slightly higher than the graphic-domain
   * default because language tensors are inherently more diffuse).
   */
  defaultEntropyTarget?: number;
}

export interface QwenModelMapping {
  readonly model: QwenModel;
  readonly tier: 'flagship' | 'fast' | 'balanced' | 'coder' | 'legacy';
  readonly contextWindow: number;
  readonly defaultTemperature: number;
  readonly useCases: ReadonlyArray<string>;
}

/**
 * Catalog of currently-served DashScope Qwen chat models (refreshed
 * 2026-05).
 *
 * Context windows reflect Alibaba Cloud Model Studio's public-docs
 * claims at the time of refresh; treat as approximate and verify against
 * live `usage` blocks for cost-critical paths. `defaultTemperature`
 * is a sensible adapter-level default, NOT a vendor-published constant.
 */
export const QWEN_MODEL_MAPPINGS: Readonly<Record<string, QwenModelMapping>> = Object.freeze({
  'qwen3-max': Object.freeze({
    model: 'qwen3-max',
    tier: 'flagship',
    contextWindow: 262_144,
    defaultTemperature: 0.3,
    useCases: ['hard-reasoning', 'arc-agi', 'agentic-planning'],
  }),
  'qwen3.5-plus': Object.freeze({
    model: 'qwen3.5-plus',
    tier: 'balanced',
    contextWindow: 1_000_000,
    defaultTemperature: 0.4,
    useCases: ['general-completions', 'long-context', 'narrative-refinement'],
  }),
  'qwen3.5-flash': Object.freeze({
    model: 'qwen3.5-flash',
    tier: 'fast',
    contextWindow: 1_000_000,
    defaultTemperature: 0.4,
    useCases: ['production-default', 'cost-aware-completions', 'low-latency'],
  }),
  'qwen3.6-plus': Object.freeze({
    model: 'qwen3.6-plus',
    tier: 'flagship',
    contextWindow: 1_000_000,
    defaultTemperature: 0.3,
    useCases: ['hard-reasoning', 'chain-of-thought', 'tool-use'],
  }),
  'qwen3.6-flash': Object.freeze({
    model: 'qwen3.6-flash',
    tier: 'fast',
    contextWindow: 1_000_000,
    defaultTemperature: 0.4,
    useCases: ['low-latency-reasoning', 'meta-tuning', 'cost-aware-verification'],
  }),
  'qwen3-coder-plus': Object.freeze({
    model: 'qwen3-coder-plus',
    tier: 'coder',
    contextWindow: 1_000_000,
    defaultTemperature: 0.2,
    useCases: ['code-generation', 'repo-level-edits', 'agentic-coding'],
  }),
  'qwen3-coder-flash': Object.freeze({
    model: 'qwen3-coder-flash',
    tier: 'coder',
    contextWindow: 1_000_000,
    defaultTemperature: 0.2,
    useCases: ['code-generation', 'low-latency-coding', 'cost-aware-coding'],
  }),
  'qwen-plus': Object.freeze({
    model: 'qwen-plus',
    tier: 'legacy',
    contextWindow: 1_000_000,
    defaultTemperature: 0.4,
    useCases: ['legacy-completions', 'batch-mode'],
  }),
  'qwen-flash': Object.freeze({
    model: 'qwen-flash',
    tier: 'legacy',
    contextWindow: 1_000_000,
    defaultTemperature: 0.4,
    useCases: ['legacy-completions', 'cost-aware-batch'],
  }),
});

export const MAPPING_QWEN_PRODUCTION_PROFILE = Object.freeze({
  id: 'mapping_qwen',
  adapter: 'alibaba-qwen',
  defaultModel: 'qwen3.5-plus' as QwenModel,
  fallbackModel: 'qwen3.5-flash' as QwenModel,
  entropyTarget: 0.18,
  stigmergyHistory: Object.freeze({ limit: 10, label: 'mapping_qwen', includeMetadata: true }),
  retry: Object.freeze({ maxRetries: 3, baseDelayMs: 500, maxDelayMs: 10_000, jitterRatio: 0.15 }),
  pipelineHooks: Object.freeze(['beforeDispatch', 'afterDispatch', 'onRateLimit']),
});

export class QwenMCOPAdapter extends BaseAdapter<
  QwenRequest,
  QwenCompletionResult
> {
  private readonly client: QwenClient;
  private readonly defaultModel: QwenModel;
  private readonly defaultEntropyTarget: number;
  private readonly hooks: QwenPipelineHooks;

  constructor(config: QwenAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultModel = config.defaultModel ?? MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? MAPPING_QWEN_PRODUCTION_PROFILE.entropyTarget;
    this.hooks = config.hooks ?? {};
  }

  protected platformName(): string {
    return 'alibaba-qwen';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'alibaba-qwen',
      version: '2026-05',
      models: Object.keys(QWEN_MODEL_MAPPINGS),
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
        'mapping-qwen-production-profile',
        'rate-limit-retry-after',
        'pipeline-hooks',
        'tool-calling',
        'json-response-format',
        'qwen3-thinking-mode',
        'long-context-1m-tokens',
      ],
      notes:
        "OpenAI-compatible Chat Completions on " +
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1. " +
        "Refined prompts route through the MCOP triad (encode → resonate → " +
        "dialectical synth → etch) before dispatch; provenance is recorded " +
        "for replay. Mirrors GrokMCOPAdapter 1:1 — both adapters share the " +
        "same pipeline-hook surface and stigmergy-history protocol.",
    };
  }

  /**
   * v2.1-spec convenience facade: produces a Qwen completion while
   * preserving narrative continuity through the stigmergy layer. The
   * returned `AdapterResponse` carries the Merkle-rooted provenance
   * bundle so downstream consumers can reproduce or audit the call.
   */
  async generateOptimizedCompletion(
    prompt: string,
    options: QwenCompletionOptions = {},
    extras: Pick<
      QwenRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    const { lowMemory, stigmergyHistory, ...platformOptions } = options;
    const lowMemoryConfig = lowMemory === true
      ? QWEN3_LOW_MEMORY_MCOP_PRESET
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
    request: QwenRequest,
  ): Promise<QwenCompletionResult> {
    const opts: QwenCompletionOptions = {
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

    const context: QwenPipelineHookContext = { dispatch, request, options: clientOptions };
    await this.hooks.beforeDispatch?.(context);
    const result = await this.client.createCompletion({ messages, options: clientOptions });
    await this.hooks.afterDispatch?.({ ...context, result });
    return result;
  }

  private buildStigmergyHistoryBlock(
    history: boolean | QwenStigmergyHistoryOptions,
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
  history: boolean | QwenStigmergyHistoryOptions,
): Required<QwenStigmergyHistoryOptions> {
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
/* Default fetch-based QwenClient implementation                          */
/* --------------------------------------------------------------------- */

export interface DefaultQwenClientConfig {
  /**
   * DashScope API key — required. Read from `process.env.QWEN_API_KEY`
   * (preferred) or `process.env.DASHSCOPE_API_KEY` (fallback) if absent.
   */
  apiKey?: string;
  /**
   * Override the API base. Defaults to
   * `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
   * (Singapore / international deployment). For the mainland-China
   * deployment use `https://dashscope.aliyuncs.com/compatible-mode/v1`.
   */
  baseUrl?: string;
  /**
   * Custom fetch implementation — defaults to the platform global.
   * Useful in Node 18+ tests, edge runtimes, or when piping through a
   * proxy.
   */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. Defaults to 60s. */
  timeoutMs?: number;
  /** Retry policy for 429/rate-limit and transient 5xx responses. */
  retry?: Partial<QwenRateLimitRetryConfig>;
  /** Optional hook fired before each retry sleep. */
  onRateLimit?: QwenPipelineHooks['onRateLimit'];
}

interface DashScopeChatCompletionResponse {
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
 * Returns a `QwenClient` backed by `fetch` and the public DashScope REST
 * API. The function is intentionally separate from `QwenMCOPAdapter` so
 * unit tests can construct adapters without ever touching the network.
 */
export function defaultQwenClient(
  config: DefaultQwenClientConfig = {},
): QwenClient {
  const apiKey =
    config.apiKey ??
    (typeof process !== 'undefined'
      ? process.env?.QWEN_API_KEY ?? process.env?.DASHSCOPE_API_KEY
      : undefined);
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      'defaultQwenClient: missing QWEN_API_KEY (or DASHSCOPE_API_KEY) — pass ' +
        '`apiKey` explicitly or set the environment variable before ' +
        'constructing the client.',
    );
  }
  const baseUrl = (
    config.baseUrl ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  ).replace(/\/+$/u, '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'defaultQwenClient: no fetch implementation available — provide ' +
        '`fetchImpl` explicitly when running on a runtime without a ' +
        'global fetch.',
    );
  }
  const timeoutMs = config.timeoutMs ?? 60_000;

  return {
    async createCompletion({ messages, options }) {
      const body: Record<string, unknown> = {
        model: options.model ?? MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel,
        messages,
        temperature:
          options.temperature ??
          QWEN_MODEL_MAPPINGS[String(options.model ?? MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel)]?.defaultTemperature ??
          0.4,
      };
      if (options.topP !== undefined) body.top_p = options.topP;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.stop && options.stop.length > 0) body.stop = [...options.stop];
      if (options.responseFormat !== undefined) body.response_format = options.responseFormat;
      if (options.tools !== undefined) body.tools = [...options.tools];
      if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
      if (options.user !== undefined) body.user = options.user;
      if (options.enableThinking !== undefined) body.enable_thinking = options.enableThinking;

      const requestRetryConfig = normalizeQwenRetryConfig({
        ...config.retry,
        ...options.retry,
      });
      let response = await postDashScopeCompletion(fetchImpl, `${baseUrl}/chat/completions`, apiKey, body, timeoutMs);
      let rateLimit = readQwenRateLimit(response);
      for (let attempt = 0; shouldRetryDashScope(response.status, attempt, requestRetryConfig); attempt += 1) {
        const retryAfterMs = rateLimit.retryAfterMs ?? computeQwenBackoffMs(attempt, requestRetryConfig);
        await config.onRateLimit?.({ attempt: attempt + 1, status: response.status, retryAfterMs, rateLimit });
        await sleep(retryAfterMs);
        response = await postDashScopeCompletion(fetchImpl, `${baseUrl}/chat/completions`, apiKey, body, timeoutMs);
        rateLimit = readQwenRateLimit(response);
      }

      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new QwenApiError(
          `DashScope request failed: ${response.status} ${response.statusText}` +
            (detail ? ` — ${detail}` : ''),
          response.status,
          response.statusText,
          rateLimit,
          detail,
        );
      }

      const json = (await response.json()) as DashScopeChatCompletionResponse;
      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error('DashScope response contained no choices');
      }

      const usage: QwenUsage | null = json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? 0,
          }
        : null;

      return {
        model: json.model ?? options.model ?? MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel,
        content: choice.message?.content ?? '',
        finishReason: choice.finish_reason ?? null,
        usage,
        rateLimit,
        raw: json,
      };
    },
  };
}


async function postDashScopeCompletion(
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

export class QwenApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly rateLimit: QwenRateLimitMetadata,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'QwenApiError';
  }
}

function normalizeQwenRetryConfig(
  config: Partial<QwenRateLimitRetryConfig> = {},
): QwenRateLimitRetryConfig {
  return {
    maxRetries: Math.max(0, Math.floor(config.maxRetries ?? 2)),
    baseDelayMs: Math.max(1, Math.floor(config.baseDelayMs ?? 500)),
    maxDelayMs: Math.max(1, Math.floor(config.maxDelayMs ?? 8_000)),
    jitterRatio: Math.max(0, Math.min(1, config.jitterRatio ?? 0.15)),
    retryStatuses: config.retryStatuses ?? [429, 500, 502, 503, 504],
  };
}

function shouldRetryDashScope(
  status: number,
  attempt: number,
  config: QwenRateLimitRetryConfig,
): boolean {
  return attempt < config.maxRetries && config.retryStatuses.includes(status);
}

function computeQwenBackoffMs(
  attempt: number,
  config: QwenRateLimitRetryConfig,
): number {
  const exponential = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt);
  const deterministicJitter = Math.round(exponential * config.jitterRatio * ((attempt % 3) / 3));
  return Math.min(config.maxDelayMs, exponential + deterministicJitter);
}

function readQwenRateLimit(response: Response): QwenRateLimitMetadata {
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

export type QwenRoutingDecision = 'qwen' | 'local' | 'human-review';

export interface QwenEntropyResonanceRouterConfig {
  /**
   * Above this entropy the prompt is "novel" enough to merit a remote
   * call (Qwen). Default 0.55 — calibrated against the encoder's
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
 * Deterministic routing helper used by
 * `examples/qwen_orchestrated_completion.ts` (and any orchestrator
 * wishing to apply the same policy). Mirrors
 * `chooseProviderByEntropyResonance` (the Grok variant) so an
 * orchestrator can swap the routing target by importing a different
 * function — the decision-tree shape is intentionally identical.
 *
 * The decision tree is intentionally tiny so it can be reasoned about
 * by humans in code review:
 *
 *   - `resonance >= highResonanceCeiling`              → `'local'`
 *   - `entropy >= noveltyEntropyFloor && resonance < lowResonanceFloor`
 *                                                       → `'human-review'`
 *   - `entropy >= noveltyEntropyFloor`                 → `'qwen'`
 *   - everything else                                  → `'local'`
 *
 * The function is pure: same inputs always produce the same decision,
 * and it never mutates the supplied config.
 */
export function chooseQwenByEntropyResonance(
  signals: { readonly entropy: number; readonly resonance: number },
  config: QwenEntropyResonanceRouterConfig = {},
): QwenRoutingDecision {
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
  if (signals.entropy >= noveltyFloor) return 'qwen';
  return 'local';
}
