import { trimTrailingSlashes } from '../utils/urlSafety';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface OpenAICompatibleMessage {
  readonly role: ChatRole;
  readonly content: string;
}

export interface OpenAICompatibleCompletionOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stop?: ReadonlyArray<string>;
  responseFormat?: Record<string, unknown>;
  tools?: ReadonlyArray<Record<string, unknown>>;
  toolChoice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  user?: string;
  extraBody?: Record<string, unknown>;
}

export interface OpenAICompatibleUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface OpenAICompatibleCompletionResult {
  readonly model: string;
  readonly content: string;
  readonly finishReason: string | null;
  readonly usage: OpenAICompatibleUsage | null;
  readonly raw?: unknown;
}

export interface OpenAICompatibleChatClient {
  createCompletion(args: {
    messages: ReadonlyArray<OpenAICompatibleMessage>;
    options: OpenAICompatibleCompletionOptions;
  }): Promise<OpenAICompatibleCompletionResult>;
}

export interface DefaultOpenAICompatibleClientConfig {
  apiKey?: string;
  apiKeyEnvNames?: ReadonlyArray<string>;
  baseUrl: string;
  defaultModel: string;
  providerName: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  readonly model?: string;
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string | null };
    readonly finish_reason?: string | null;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

export function createOpenAICompatibleChatClient(
  config: DefaultOpenAICompatibleClientConfig,
): OpenAICompatibleChatClient {
  const apiKey = config.apiKey ?? readFirstEnv(config.apiKeyEnvNames ?? []);
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      `${config.providerName}: missing API key - pass apiKey explicitly` +
        (config.apiKeyEnvNames?.length
          ? ` or set one of ${config.apiKeyEnvNames.join(', ')}.`
          : '.'),
    );
  }
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(`${config.providerName}: no fetch implementation available.`);
  }
  const baseUrl = trimTrailingSlashes(config.baseUrl);
  const timeoutMs = config.timeoutMs ?? 60_000;

  return {
    async createCompletion({ messages, options }) {
      const body: Record<string, unknown> = {
        model: options.model ?? config.defaultModel,
        messages,
      };
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.topP !== undefined) body.top_p = options.topP;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.stop && options.stop.length > 0) body.stop = [...options.stop];
      if (options.responseFormat !== undefined) body.response_format = options.responseFormat;
      if (options.tools !== undefined) body.tools = [...options.tools];
      if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
      if (options.user !== undefined) body.user = options.user;
      if (options.extraBody) Object.assign(body, options.extraBody);

      const response = await postJson(
        fetchImpl,
        `${baseUrl}/chat/completions`,
        apiKey,
        body,
        timeoutMs,
      );
      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new OpenAICompatibleChatError(
          `${config.providerName} request failed: ${response.status} ${response.statusText}` +
            (detail ? ` - ${detail}` : ''),
          response.status,
          response.statusText,
          detail,
        );
      }

      const json = (await response.json()) as ChatCompletionResponse;
      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error(`${config.providerName} response contained no choices.`);
      }
      return {
        model: json.model ?? options.model ?? config.defaultModel,
        content: choice.message?.content ?? '',
        finishReason: choice.finish_reason ?? null,
        usage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
              totalTokens: json.usage.total_tokens ?? 0,
            }
          : null,
        raw: json,
      };
    },
  };
}

export class OpenAICompatibleChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'OpenAICompatibleChatError';
  }
}

async function postJson(
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
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function readFirstEnv(names: ReadonlyArray<string>): string | undefined {
  if (typeof process === 'undefined') return undefined;
  for (const name of names) {
    const value = process.env?.[name];
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
}

async function safeReadText(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.length > 0 ? text.slice(0, 512) : null;
  } catch {
    return null;
  }
}
