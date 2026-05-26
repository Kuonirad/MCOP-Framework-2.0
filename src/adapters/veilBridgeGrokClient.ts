/**
 * VeilBridgeGrokClient — GrokClient implementation that drives the user's
 * primary local Grok build (the one behind grok-veil + veil-bridge).
 *
 * This connects MCOP's full adapter machinery (GrokMCOPAdapter + triad +
 * organelleMode) to your local `~/.grok` installation via the existing
 * veil-bridge HTTP API (default http://127.0.0.1:57321).
 *
 * The bridge already knows how to:
 *   - Execute real prompts against the local grok.exe (via `grok -p`)
 *   - Stream output over SSE
 *   - Carry session history
 *
 * This client translates the MCOP call shape into the bridge's protocol
 * and back, so all MCOP orchestration, provenance, stigmergy memory,
 * holographic etch, and organelle features work against your local build.
 *
 * Usage (basic):
 *
 *   import { VeilBridgeGrokClient, GrokMCOPAdapter, ... } from '@/adapters';
 *
 *   const client = new VeilBridgeGrokClient({ bridgeUrl: 'http://127.0.0.1:57321' });
 *
 *   const adapter = new GrokMCOPAdapter({
 *     encoder: ...,
 *     stigmergy: ...,
 *     etch: ...,
 *     client,
 *     defaultModel: 'grok-4.3',
 *   });
 *
 * For the even cleaner long-term path, also add an OpenAI-compatible
 * /v1/chat/completions handler to the bridge (see grok-veil bridge code).
 * Then you can just use the built-in defaultGrokClient({ baseUrl: '...' }).
 */

import type {
  GrokClient,
  GrokCompletionOptions,
  GrokCompletionResult,
  GrokUsage,
  GrokRateLimitMetadata,
} from './grokAdapter';

export interface VeilBridgeGrokClientConfig {
  /** Base URL of the running veil-bridge (default matches the bridge default). */
  bridgeUrl?: string;
  /** Request timeout in ms. */
  timeoutMs?: number;
  /**
   * Optional override for the model name reported back to MCOP.
   * If not provided, we use the model from options or a sensible default.
   */
  reportedModel?: string;
  /** Extra headers to send with every request to the bridge. */
  headers?: Record<string, string>;
}

interface BridgePromptRequest {
  prompt: string;
  model?: string;
  history?: Array<{ role: string; content: string }>;

  // Extended generation controls for local Grok builds (forwarded to the binary)
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  reasoning_effort?: string; // low | medium | high | xhigh | max
  effort?: string;           // low | medium | high | xhigh | max (TUI/agent effort level)
  output_format?: string;    // plain | json | streaming-json
  stop?: string[];
}

interface BridgeChunkEvent {
  event: string;
  data: string;
}

export class VeilBridgeGrokClient implements GrokClient {
  private readonly bridgeUrl: string;
  private readonly timeoutMs: number;
  private readonly reportedModel?: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(config: VeilBridgeGrokClientConfig = {}) {
    this.bridgeUrl = (config.bridgeUrl ?? 'http://127.0.0.1:57321').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 300_000; // 5 minutes for long local generations
    this.reportedModel = config.reportedModel;
    this.extraHeaders = config.headers ?? {};
  }

  async createCompletion({
    messages,
    options,
  }: {
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    options: GrokCompletionOptions;
  }): Promise<GrokCompletionResult> {
    const prompt = this.extractPrompt(messages);
    const history = this.buildHistory(messages);

    const body: BridgePromptRequest = {
      prompt,
      model: options.model ?? undefined,
      history: history.length > 0 ? history : undefined,

      // Forward extended controls (temperature etc. already in GrokCompletionOptions; effort/outputFormat via extras)
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      reasoning_effort: (options as any).reasoningEffort ?? (options as any).reasoning_effort,
      effort: (options as any).effort,
      // When organelleMode is active, default to streaming-json for best structured artifact support
      // (the local Grok build can emit clean JSON deltas that the adapter parses for trace/etch merge).
      output_format: (options as any).outputFormat ??
                     (options as any).output_format ??
                     ((options as any).organelleMode ? 'streaming-json' : undefined),
      stop: options.stop ? [...options.stop] : undefined,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.bridgeUrl}/api/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...this.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new Error(
          `veil-bridge request failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`
        );
      }

      const { content, rawEvents } = await this.parseSSEStream(response);

      const model =
        this.reportedModel ??
        options.model ??
        (rawEvents.find((e) => e.event === 'model')?.data) ??
        'local-grok';

      const usage = this.estimateUsage(prompt, content, messages);

      return {
        model,
        content,
        finishReason: 'stop',
        usage,
        raw: { bridgeEvents: rawEvents },
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(
          `veil-bridge request timed out after ${this.timeoutMs}ms. ` +
            `Is your local Grok build (grok-veil + bridge) running?`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractPrompt(messages: ReadonlyArray<{ role: string; content: string }>): string {
    // The last user message is the new prompt. The bridge + history carries context.
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return messages[messages.length - 1]?.content ?? '';
  }

  private buildHistory(
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Array<{ role: string; content: string }> {
    const history: Array<{ role: string; content: string }> = [];

    // Convert all messages except the final user prompt into bridge history format.
    // The bridge already does smart truncation on its side.
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      const role = m.role === 'assistant' ? 'grok' : m.role;
      history.push({ role, content: m.content });
    }

    return history;
  }

  private async parseSSEStream(response: Response): Promise<{
    content: string;
    rawEvents: BridgeChunkEvent[];
  }> {
    const text = await response.text();
    const events: BridgeChunkEvent[] = [];
    let content = '';

    // Very simple SSE parser sufficient for the veil-bridge format.
    // Events are separated by blank lines; we care about "event:" and "data:" lines.
    const blocks = text.split(/\n\n+/);

    for (const block of blocks) {
      if (!block.trim()) continue;

      let event = 'message';
      let data = '';

      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data = line.slice(5).trim();
        }
      }

      events.push({ event, data });

      if (event === 'chunk' && data) {
        content += data + '\n';
      }
      if (event === 'error' && data) {
        // Surface bridge errors in the content for visibility during development.
        content += `\n[bridge error] ${data}\n`;
      }
    }

    // Trim trailing newlines we added for chunk assembly.
    content = content.replace(/\n+$/, '');

    return { content, rawEvents: events };
  }

  private estimateUsage(
    prompt: string,
    completion: string,
    messages: ReadonlyArray<{ role: string; content: string }>
  ): GrokUsage | null {
    // The local grok.exe / bridge does not currently surface token counts in the SSE stream.
    // We return a length-based estimate so MCOP pipelines can still do rough cost/resonance accounting.
    // Real tokenization would require the actual model tokenizer.
    const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0) + prompt.length;
    const completionChars = completion.length;

    // Very rough heuristic (many tokenizers are ~4 chars per token on English).
    const promptTokens = Math.ceil(promptChars / 4);
    const completionTokens = Math.ceil(completionChars / 4);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Convenience factory, mirroring the style of defaultGrokClient().
 */
export function createVeilBridgeGrokClient(
  config: VeilBridgeGrokClientConfig = {}
): VeilBridgeGrokClient {
  return new VeilBridgeGrokClient(config);
}
