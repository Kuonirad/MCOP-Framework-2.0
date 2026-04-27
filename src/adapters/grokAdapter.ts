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
import {
  AdapterCapabilities,
  AdapterRequest,
} from './types';

/** Names of the xAI hosted Grok models known at the time of writing. */
export type GrokModel =
  | 'grok-4'
  | 'grok-4-mini'
  | 'grok-3'
  | 'grok-3-mini'
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

export interface GrokCompletionResult {
  readonly model: string;
  readonly content: string;
  readonly finishReason: string | null;
  readonly usage: GrokUsage | null;
  readonly raw?: unknown;
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
  /** Default model when the request does not supply one. */
  defaultModel?: GrokModel;
  /**
   * Default entropy target for natural-language prompts (0.18 in the
   * specification table — slightly higher than the graphic-domain
   * default because language tensors are inherently more diffuse).
   */
  defaultEntropyTarget?: number;
}

export class GrokMCOPAdapter extends BaseAdapter<
  GrokRequest,
  GrokCompletionResult
> {
  private readonly client: GrokClient;
  private readonly defaultModel: GrokModel;
  private readonly defaultEntropyTarget: number;

  constructor(config: GrokAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultModel = config.defaultModel ?? 'grok-3-mini';
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? 0.18;
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
        'grok-4-mini',
        'grok-3',
        'grok-3-mini',
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
    return this.generate({
      prompt,
      domain: 'narrative',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: {
        ...(extras.metadata ?? {}),
        assetKind: 'completion',
        model: options.model ?? this.defaultModel,
      },
      payload: { options },
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

    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];
    if (opts.systemPrompt && opts.systemPrompt.trim().length > 0) {
      messages.push({ role: 'system', content: opts.systemPrompt.trim() });
    }
    messages.push({ role: 'user', content: dispatch.refinedPrompt });

    return this.client.createCompletion({ messages, options: opts });
  }
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
        model: options.model ?? 'grok-3-mini',
        messages,
        temperature: options.temperature ?? 0.4,
      };
      if (options.topP !== undefined) body.top_p = options.topP;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.stop && options.stop.length > 0) body.stop = [...options.stop];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
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

      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new Error(
          `xAI request failed: ${response.status} ${response.statusText}` +
            (detail ? ` — ${detail}` : ''),
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
        model: json.model ?? options.model ?? 'grok-3-mini',
        content: choice.message?.content ?? '',
        finishReason: choice.finish_reason ?? null,
        usage,
        raw: json,
      };
    },
  };
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
