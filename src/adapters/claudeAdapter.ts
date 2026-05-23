import {
  BaseAdapter,
  BaseAdapterDeps,
  PreparedDispatch,
} from './baseAdapter';
import {
  AdapterCapabilities,
  AdapterRequest,
} from './types';
import { trimTrailingSlashes } from '../utils/urlSafety';

export type ClaudeModel =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-1-20250805'
  | 'claude-opus-4-20250514'
  | 'claude-sonnet-4-20250514'
  | 'claude-3-7-sonnet-20250219'
  | (string & {});

export interface ClaudeCompletionOptions {
  model?: ClaudeModel;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  stopSequences?: ReadonlyArray<string>;
  metadata?: Record<string, unknown>;
}

export interface ClaudeRequest extends AdapterRequest {
  payload?: {
    options?: ClaudeCompletionOptions;
  };
}

export interface ClaudeUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ClaudeCompletionResult {
  readonly model: string;
  readonly content: string;
  readonly stopReason: string | null;
  readonly usage: ClaudeUsage | null;
  readonly raw?: unknown;
}

export interface ClaudeClient {
  createMessage(args: {
    system?: string;
    messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
    options: ClaudeCompletionOptions;
  }): Promise<ClaudeCompletionResult>;
}

export interface ClaudeAdapterConfig extends BaseAdapterDeps {
  client: ClaudeClient;
  defaultModel?: ClaudeModel;
  defaultEntropyTarget?: number;
}

export const CLAUDE_MODEL_MAPPINGS: Readonly<Record<string, {
  readonly model: ClaudeModel;
  readonly tier: 'flagship' | 'balanced' | 'legacy';
  readonly defaultTemperature: number;
  readonly useCases: ReadonlyArray<string>;
}>> = Object.freeze({
  'claude-sonnet-4-6': Object.freeze({
    model: 'claude-sonnet-4-6',
    tier: 'balanced',
    defaultTemperature: 0.3,
    useCases: ['agentic-coding', 'hard-reasoning', 'long-horizon-planning'],
  }),
  'claude-opus-4-7': Object.freeze({
    model: 'claude-opus-4-7',
    tier: 'flagship',
    defaultTemperature: 0.25,
    useCases: ['frontier-review', 'deep-analysis', 'research-synthesis'],
  }),
  'claude-haiku-4-5-20251001': Object.freeze({
    model: 'claude-haiku-4-5-20251001',
    tier: 'balanced',
    defaultTemperature: 0.3,
    useCases: ['low-latency', 'tool-use', 'cost-aware-completions'],
  }),
  'claude-sonnet-4-20250514': Object.freeze({
    model: 'claude-sonnet-4-20250514',
    tier: 'legacy',
    defaultTemperature: 0.3,
    useCases: ['compatibility', 'general-completions'],
  }),
  'claude-opus-4-1-20250805': Object.freeze({
    model: 'claude-opus-4-1-20250805',
    tier: 'flagship',
    defaultTemperature: 0.25,
    useCases: ['frontier-review', 'deep-analysis', 'research-synthesis'],
  }),
  'claude-opus-4-20250514': Object.freeze({
    model: 'claude-opus-4-20250514',
    tier: 'legacy',
    defaultTemperature: 0.25,
    useCases: ['compatibility', 'deep-analysis', 'research-synthesis'],
  }),
  'claude-3-7-sonnet-20250219': Object.freeze({
    model: 'claude-3-7-sonnet-20250219',
    tier: 'legacy',
    defaultTemperature: 0.3,
    useCases: ['compatibility', 'general-completions'],
  }),
});

export const CLAUDE_PRODUCTION_PROFILE = Object.freeze({
  id: 'mapping_claude',
  adapter: 'anthropic-claude',
  defaultModel: 'claude-sonnet-4-6' as ClaudeModel,
  entropyTarget: 0.18,
});

export class ClaudeMCOPAdapter extends BaseAdapter<
  ClaudeRequest,
  ClaudeCompletionResult
> {
  private readonly client: ClaudeClient;
  private readonly defaultModel: ClaudeModel;
  private readonly defaultEntropyTarget: number;

  constructor(config: ClaudeAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultModel = config.defaultModel ?? CLAUDE_PRODUCTION_PROFILE.defaultModel;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? CLAUDE_PRODUCTION_PROFILE.entropyTarget;
  }

  protected platformName(): string {
    return 'anthropic-claude';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'anthropic-claude',
      version: '2026-05',
      models: Object.keys(CLAUDE_MODEL_MAPPINGS),
      supportsAudit: true,
      features: [
        'messages-api',
        'system-prompt',
        'temperature-control',
        'usage-metering',
        'mcop-triad-refinement',
        'human-veto',
      ],
      notes:
        'Anthropic Messages API adapter. Refined prompts route through the MCOP triad before dispatch.',
    };
  }

  async generateOptimizedCompletion(
    prompt: string,
    options: ClaudeCompletionOptions = {},
    extras: Pick<ClaudeRequest, 'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'> = {},
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
    request: ClaudeRequest,
  ): Promise<ClaudeCompletionResult> {
    const options: ClaudeCompletionOptions = {
      ...(request.payload?.options ?? {}),
      model: request.payload?.options?.model ?? this.defaultModel,
    };
    const messages = [{ role: 'user' as const, content: dispatch.refinedPrompt }];
    return this.client.createMessage({
      system: options.systemPrompt,
      messages,
      options,
    });
  }
}

export interface DefaultClaudeClientConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  anthropicVersion?: string;
}

interface AnthropicMessageResponse {
  readonly model?: string;
  readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
  readonly stop_reason?: string | null;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
}

export function defaultClaudeClient(config: DefaultClaudeClientConfig = {}): ClaudeClient {
  const apiKey = config.apiKey ?? (typeof process !== 'undefined' ? process.env?.ANTHROPIC_API_KEY : undefined);
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('defaultClaudeClient: missing ANTHROPIC_API_KEY - pass apiKey explicitly or set the environment variable.');
  }
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('defaultClaudeClient: no fetch implementation available.');
  }
  const baseUrl = trimTrailingSlashes(config.baseUrl ?? 'https://api.anthropic.com');
  const timeoutMs = config.timeoutMs ?? 60_000;
  const anthropicVersion = config.anthropicVersion ?? '2023-06-01';

  return {
    async createMessage({ system, messages, options }) {
      const body: Record<string, unknown> = {
        model: options.model ?? CLAUDE_PRODUCTION_PROFILE.defaultModel,
        max_tokens: options.maxTokens ?? 1024,
        messages,
      };
      if (system && system.trim().length > 0) body.system = system;
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.topP !== undefined) body.top_p = options.topP;
      if (options.stopSequences && options.stopSequences.length > 0) {
        body.stop_sequences = [...options.stopSequences];
      }
      if (options.metadata !== undefined) body.metadata = options.metadata;

      const response = await postAnthropicMessage(fetchImpl, `${baseUrl}/v1/messages`, apiKey, anthropicVersion, body, timeoutMs);
      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new ClaudeApiError(
          `Anthropic request failed: ${response.status} ${response.statusText}` +
            (detail ? ` - ${detail}` : ''),
          response.status,
          response.statusText,
          detail,
        );
      }
      const json = (await response.json()) as AnthropicMessageResponse;
      return {
        model: json.model ?? options.model ?? CLAUDE_PRODUCTION_PROFILE.defaultModel,
        content: (json.content ?? [])
          .filter((part) => part.type === 'text' || part.text)
          .map((part) => part.text ?? '')
          .join(''),
        stopReason: json.stop_reason ?? null,
        usage: json.usage
          ? {
              inputTokens: json.usage.input_tokens ?? 0,
              outputTokens: json.usage.output_tokens ?? 0,
            }
          : null,
        raw: json,
      };
    },
  };
}

export class ClaudeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'ClaudeApiError';
  }
}

async function postAnthropicMessage(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  anthropicVersion: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': anthropicVersion,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.length > 0 ? text.slice(0, 512) : null;
  } catch {
    return null;
  }
}
