// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * sdkClaudeClient — an official `@anthropic-ai/sdk`-backed implementation of the
 * MCOP {@link ClaudeClient} dependency-injection seam.
 *
 * The framework's {@link ClaudeMCOPAdapter} dispatches MCOP-refined prompts
 * through a {@link ClaudeClient}. The historical {@link defaultClaudeClient}
 * hand-rolls the Anthropic Messages API over `fetch`; this client uses the
 * official Anthropic SDK instead, which unlocks modern, correctness-sensitive
 * behaviour that is awkward to maintain by hand:
 *
 *   • Adaptive thinking (`thinking: {type:'adaptive'}`) — the recommended mode
 *     for Opus 4.6+/Sonnet 4.6, enabled by default for capable models.
 *   • The effort parameter (`output_config.effort`).
 *   • Prompt caching — a `cache_control` breakpoint on the system prompt.
 *   • Automatic streaming for large `max_tokens` (via `.stream()` +
 *     `.finalMessage()`), which prevents SDK HTTP timeouts on long outputs.
 *   • Model-aware request shaping — Opus 4.7/4.8 reject sampling parameters
 *     (`temperature`/`top_p`) and fixed thinking budgets, so this client
 *     strips them automatically rather than 400-ing.
 *
 * Both clients satisfy the same interface, so callers swap implementations
 * without touching the adapter or the MCOP triad. Defaults follow Anthropic's
 * current guidance: model `claude-opus-4-8`, adaptive thinking on capable
 * models, and prompt caching on the system prompt.
 */

import Anthropic from '@anthropic-ai/sdk';

import {
  ClaudeApiError,
  CLAUDE_PRODUCTION_PROFILE,
  type ClaudeClient,
  type ClaudeCompletionOptions,
  type ClaudeCompletionResult,
  type ClaudeModel,
} from './claudeAdapter';

/**
 * Default flagship model for SDK-backed dispatch. Anthropic's most capable
 * generally available model at time of writing; overridable per client.
 */
export const SDK_CLAUDE_DEFAULT_MODEL: ClaudeModel = 'claude-opus-4-8';

/**
 * `max_tokens` at or above which the client switches to streaming to avoid
 * HTTP read timeouts on long unary responses. Mirrors the SDK's own guidance.
 */
export const SDK_CLAUDE_STREAM_THRESHOLD = 16_000;

/** Default output cap when a caller does not specify one. */
export const SDK_CLAUDE_DEFAULT_MAX_TOKENS = 16_000;

export interface SdkClaudeClientConfig {
  /** Anthropic API key. Falls back to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /** Override the API base URL (e.g. a gateway or proxy). */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** SDK automatic retry count for 429/5xx (defaults to the SDK's default). */
  maxRetries?: number;
  /** Default model when a request omits one. Defaults to {@link SDK_CLAUDE_DEFAULT_MODEL}. */
  defaultModel?: ClaudeModel;
  /**
   * Inject a pre-constructed SDK client (e.g. `AnthropicAWS`, or a test
   * double). When supplied, `apiKey`/`baseUrl`/`timeoutMs`/`maxRetries` are
   * ignored — configure them on the injected instance instead.
   */
  client?: Pick<Anthropic, 'messages'>;
}

/**
 * Opus 4.7 and 4.8 removed sampling parameters and fixed thinking budgets;
 * they accept adaptive thinking only. Requests that send `temperature`,
 * `top_p`, or `budget_tokens` to these models return a 400.
 */
function isAdaptiveOnlyModel(model: string): boolean {
  return /claude-opus-4-(7|8)\b/.test(model);
}

/** Models that support adaptive thinking: Opus 4.6/4.7/4.8 and Sonnet 4.6. */
function supportsAdaptiveThinking(model: string): boolean {
  return /claude-opus-4-(6|7|8)\b/.test(model) || /claude-sonnet-4-6\b/.test(model);
}

/**
 * Resolve the effective thinking mode for a model + caller preference.
 * Explicit caller intent always wins; otherwise adaptive thinking is enabled
 * for models that support it and omitted for everything else.
 */
function resolveThinkingMode(
  model: string,
  requested: ClaudeCompletionOptions['thinking'],
): 'adaptive' | 'omit' {
  if (requested === 'disabled') return 'omit';
  if (requested === 'adaptive') return 'adaptive';
  return supportsAdaptiveThinking(model) ? 'adaptive' : 'omit';
}

function buildSystem(
  system: string | undefined,
  cacheSystemPrompt: boolean | undefined,
): Anthropic.MessageCreateParamsNonStreaming['system'] {
  if (!system || system.trim().length === 0) return undefined;
  // Default to caching the system prefix; short prompts simply won't cache.
  if (cacheSystemPrompt === false) return system;
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

function extractText(content: ReadonlyArray<Anthropic.ContentBlock>): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function extractThinking(content: ReadonlyArray<Anthropic.ContentBlock>): string | undefined {
  const thinking = content
    .filter((block): block is Anthropic.ThinkingBlock => block.type === 'thinking')
    .map((block) => block.thinking)
    .filter((text) => text.length > 0)
    .join('\n');
  return thinking.length > 0 ? thinking : undefined;
}

function mapUsage(usage: Anthropic.Usage | undefined | null): ClaudeCompletionResult['usage'] {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    ...(usage.cache_read_input_tokens != null
      ? { cacheReadInputTokens: usage.cache_read_input_tokens }
      : {}),
    ...(usage.cache_creation_input_tokens != null
      ? { cacheCreationInputTokens: usage.cache_creation_input_tokens }
      : {}),
  };
}

function toResult(message: Anthropic.Message, fallbackModel: string): ClaudeCompletionResult {
  return {
    model: message.model ?? fallbackModel,
    content: extractText(message.content),
    stopReason: message.stop_reason ?? null,
    usage: mapUsage(message.usage),
    thinking: extractThinking(message.content),
    raw: message,
  };
}

function wrapError(error: unknown): never {
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === 'number' ? error.status : 0;
    let detail: string | null = null;
    try {
      detail = error.error ? JSON.stringify(error.error).slice(0, 512) : null;
    } catch {
      detail = null;
    }
    throw new ClaudeApiError(
      `Anthropic SDK request failed: ${status || 'network'} ${error.name}` +
        (error.message ? ` - ${error.message}` : ''),
      status,
      error.name,
      detail,
    );
  }
  throw error;
}

/**
 * Construct a {@link ClaudeClient} backed by the official Anthropic SDK.
 *
 * @example
 * ```ts
 * const adapter = new ClaudeMCOPAdapter({
 *   ...triad,
 *   client: sdkClaudeClient(),       // reads ANTHROPIC_API_KEY
 *   defaultModel: 'claude-opus-4-8',
 * });
 * ```
 */
export function sdkClaudeClient(config: SdkClaudeClientConfig = {}): ClaudeClient {
  const defaultModel = config.defaultModel ?? SDK_CLAUDE_DEFAULT_MODEL;

  const anthropic: Pick<Anthropic, 'messages'> =
    config.client ??
    (() => {
      const apiKey =
        config.apiKey ??
        (typeof process !== 'undefined' ? process.env?.ANTHROPIC_API_KEY : undefined);
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error(
          'sdkClaudeClient: missing ANTHROPIC_API_KEY - pass apiKey explicitly, ' +
            'set the environment variable, or inject a configured `client`.',
        );
      }
      return new Anthropic({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.timeoutMs !== undefined ? { timeout: config.timeoutMs } : {}),
        ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
      });
    })();

  return {
    async createMessage({ system, messages, options }) {
      const model = options.model ?? defaultModel ?? CLAUDE_PRODUCTION_PROFILE.defaultModel;
      const maxTokens = options.maxTokens ?? SDK_CLAUDE_DEFAULT_MAX_TOKENS;
      const thinkingMode = resolveThinkingMode(model, options.thinking);
      const adaptiveOnly = isAdaptiveOnlyModel(model);

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: maxTokens,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      };

      const builtSystem = buildSystem(
        options.systemPrompt ?? system,
        options.cacheSystemPrompt,
      );
      if (builtSystem !== undefined) params.system = builtSystem;

      if (thinkingMode === 'adaptive') {
        params.thinking = { type: 'adaptive' };
      }

      // Sampling params are incompatible with adaptive thinking and rejected
      // outright by Opus 4.7/4.8 — only forward them when the model accepts
      // them and adaptive thinking is not in play.
      if (!adaptiveOnly && thinkingMode !== 'adaptive') {
        if (options.temperature !== undefined) params.temperature = options.temperature;
        if (options.topP !== undefined) params.top_p = options.topP;
      }

      if (options.effort !== undefined) {
        params.output_config = { effort: options.effort };
      }

      if (options.stopSequences && options.stopSequences.length > 0) {
        params.stop_sequences = [...options.stopSequences];
      }

      const userId = options.metadata?.user_id;
      if (typeof userId === 'string' && userId.length > 0) {
        params.metadata = { user_id: userId };
      }

      const shouldStream = options.stream === true || maxTokens >= SDK_CLAUDE_STREAM_THRESHOLD;

      try {
        if (shouldStream) {
          const stream = anthropic.messages.stream(params);
          const message = await stream.finalMessage();
          return toResult(message, model);
        }
        const message = await anthropic.messages.create(params);
        return toResult(message, model);
      } catch (error) {
        return wrapError(error);
      }
    },
  };
}
