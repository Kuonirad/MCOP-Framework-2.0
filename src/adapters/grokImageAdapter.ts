/**
 * Grok / xAI Images MCOP Adapter — wires xAI's OpenAI-compatible
 * `/v1/images/generations` endpoint into the deterministic MCOP triad.
 *
 * Companion to {@link ./grokAdapter | `GrokMCOPAdapter`} (chat-completions).
 * Kept as a separate class because the request/response shapes, retry
 * semantics, and provenance metadata differ from chat — and because the
 * Python `mcop_package/mcop/adapters/grok_image_adapter.py` already
 * follows the same split.  Sharing a base class would force one of the
 * two surfaces to grow vestigial fields.
 *
 * Like `GrokMCOPAdapter`, this adapter does NOT bundle the vendor SDK;
 * it accepts a thin `GrokImageClient` so callers can supply either the
 * bundled `defaultGrokImageClient(...)` or a fixture/replay harness.
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

/* ------------------------------------------------------------------ */
/*  Platform-native option shapes                                     */

/** xAI image-generation models known at the time of writing (May 2026). */
export type GrokImageModel =
  | 'grok-imagine-image'
  | 'grok-imagine-image-quality'
  | 'grok-imagine-image-pro'
  | (string & {});

export type GrokImageResponseFormat = 'url' | 'b64_json';

export type GrokImageAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '2:3'
  | '3:2';

export type GrokImageResolution = '1k' | '2k';

export interface GrokImageOptions {
  model?: GrokImageModel;
  /** Number of images to generate (1–10). Defaults to 1. */
  n?: number;
  responseFormat?: GrokImageResponseFormat;
  aspectRatio?: GrokImageAspectRatio;
  resolution?: GrokImageResolution;
  /** Optional caller/user identifier for vendor-side abuse monitoring. */
  user?: string;
  /** Per-request retry policy for xAI 429/5xx responses. */
  retry?: Partial<GrokImageRetryConfig>;
  /** Free-form xAI request fields not yet typed by this adapter. */
  extraBody?: Record<string, unknown>;
}

export interface GrokImageRequest extends AdapterRequest {
  payload?: {
    options?: GrokImageOptions;
  };
}

export interface GrokImageDatum {
  readonly url?: string;
  readonly b64_json?: string;
  readonly revisedPrompt?: string;
}

export interface GrokImageResult {
  readonly model: string;
  readonly responseFormat: GrokImageResponseFormat;
  readonly images: ReadonlyArray<GrokImageDatum>;
  readonly raw?: unknown;
}

export interface GrokImageRetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly retryStatuses: ReadonlyArray<number>;
}

export interface GrokImagePipelineHookContext {
  readonly dispatch: PreparedDispatch;
  readonly request: GrokImageRequest;
  readonly options: GrokImageOptions;
}

export interface GrokImagePipelineHooks {
  readonly beforeDispatch?: (context: GrokImagePipelineHookContext) => void | Promise<void>;
  readonly afterDispatch?: (context: GrokImagePipelineHookContext & { result: GrokImageResult }) => void | Promise<void>;
}

/**
 * Minimal client surface — keeps the adapter SDK-agnostic and trivial to
 * mock.  Implementations MUST forward `prompt` verbatim and return one
 * `GrokImageDatum` per generated image.
 */
export interface GrokImageClient {
  generateImage(args: {
    prompt: string;
    options: GrokImageOptions;
  }): Promise<GrokImageResult>;
}

export interface GrokImageAdapterConfig extends BaseAdapterDeps {
  client: GrokImageClient;
  hooks?: GrokImagePipelineHooks;
  defaultModel?: GrokImageModel;
  /** Default entropy target for visual prompts (lower than text). */
  defaultEntropyTarget?: number;
}

export const GROK_IMAGE_PRODUCTION_PROFILE = Object.freeze({
  id: 'grok_imagine',
  adapter: 'xai-grok-images',
  defaultModel: 'grok-imagine-image' as GrokImageModel,
  qualityModel: 'grok-imagine-image-quality' as GrokImageModel,
  proModel: 'grok-imagine-image-pro' as GrokImageModel,
  entropyTarget: 0.12,
  retry: Object.freeze({
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    retryStatuses: [429, 500, 502, 503, 504] as ReadonlyArray<number>,
  }),
});

export class GrokImageMCOPAdapter extends BaseAdapter<
  GrokImageRequest,
  GrokImageResult
> {
  private readonly client: GrokImageClient;
  private readonly defaultModel: GrokImageModel;
  private readonly defaultEntropyTarget: number;
  private readonly hooks: GrokImagePipelineHooks;

  constructor(config: GrokImageAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultModel = config.defaultModel ?? GROK_IMAGE_PRODUCTION_PROFILE.defaultModel;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? GROK_IMAGE_PRODUCTION_PROFILE.entropyTarget;
    this.hooks = config.hooks ?? {};
  }

  protected platformName(): string {
    return 'xai-grok-images';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'xai-grok-images',
      version: '2026-05',
      models: [
        'grok-imagine-image',
        'grok-imagine-image-quality',
        'grok-imagine-image-pro',
      ],
      supportsAudit: true,
      maxResolution: '2k',
      features: [
        'text-to-image',
        'batch-generation',
        'url-output',
        'base64-output',
        'aspect-ratio',
        'resolution',
        'mcop-triad-refinement',
        'human-veto',
        'merkle-audit',
      ],
      notes:
        "OpenAI-compatible Images API on https://api.x.ai/v1/images/generations. " +
        "Refined prompts route through the MCOP triad (encode → resonate → " +
        "dialectical synth → etch) before dispatch; provenance is recorded " +
        "for replay.",
    };
  }

  /**
   * Convenience facade that mirrors `GrokMCOPAdapter.generateOptimizedCompletion`.
   * Wraps the prompt in an `imaging`-domain MCOP request and returns the
   * full `AdapterResponse` carrying both the generated image data and the
   * Merkle-rooted provenance bundle.
   */
  async generateOptimizedImage(
    prompt: string,
    options: GrokImageOptions = {},
    extras: Pick<
      GrokImageRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    return this.generate({
      prompt,
      domain: 'graphic',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: {
        ...(extras.metadata ?? {}),
        assetKind: 'image',
        model: options.model ?? this.defaultModel,
        n: options.n ?? 1,
        responseFormat: options.responseFormat ?? 'url',
      },
      payload: { options },
    });
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: GrokImageRequest,
  ): Promise<GrokImageResult> {
    const opts: GrokImageOptions = {
      ...(request.payload?.options ?? {}),
      model: request.payload?.options?.model ?? this.defaultModel,
      n: clampN(request.payload?.options?.n ?? 1),
      responseFormat: request.payload?.options?.responseFormat ?? 'url',
    };

    const context: GrokImagePipelineHookContext = { dispatch, request, options: opts };
    await this.hooks.beforeDispatch?.(context);
    const result = await this.client.generateImage({
      prompt: dispatch.refinedPrompt,
      options: opts,
    });
    await this.hooks.afterDispatch?.({ ...context, result });
    return result;
  }
}

function clampN(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.floor(n)));
}

/* --------------------------------------------------------------------- */
/* Default fetch-based GrokImageClient implementation                     */
/* --------------------------------------------------------------------- */

export interface DefaultGrokImageClientConfig {
  /** xAI API key — read from `process.env.XAI_API_KEY` if absent. */
  apiKey?: string;
  /** Override the API base. Defaults to `https://api.x.ai/v1`. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. Defaults to 120s (image gen is slow). */
  timeoutMs?: number;
  retry?: Partial<GrokImageRetryConfig>;
}

interface XaiImagesResponse {
  readonly model?: string;
  readonly data: ReadonlyArray<{
    readonly url?: string;
    readonly b64_json?: string;
    readonly revised_prompt?: string;
  }>;
}

export function defaultGrokImageClient(
  config: DefaultGrokImageClientConfig = {},
): GrokImageClient {
  const apiKey =
    config.apiKey ??
    (typeof process !== 'undefined'
      ? process.env?.XAI_API_KEY
      : undefined);
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      'defaultGrokImageClient: missing XAI_API_KEY — pass `apiKey` ' +
        'explicitly or set the environment variable before constructing ' +
        'the client.',
    );
  }
  const baseUrl = (config.baseUrl ?? 'https://api.x.ai/v1').replace(/\/+$/u, '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'defaultGrokImageClient: no fetch implementation available — ' +
        'provide `fetchImpl` explicitly when running on a runtime ' +
        'without a global fetch.',
    );
  }
  const timeoutMs = config.timeoutMs ?? 120_000;
  const retry = normalizeImageRetryConfig(config.retry);

  return {
    async generateImage({ prompt, options }) {
      const body: Record<string, unknown> = {
        model: options.model ?? GROK_IMAGE_PRODUCTION_PROFILE.defaultModel,
        prompt,
        n: clampN(options.n ?? 1),
        response_format: options.responseFormat ?? 'url',
      };
      if (options.aspectRatio) body.aspect_ratio = options.aspectRatio;
      if (options.resolution) body.resolution = options.resolution;
      if (options.user) body.user = options.user;
      if (options.extraBody) Object.assign(body, options.extraBody);

      const requestRetry = normalizeImageRetryConfig({
        ...retry,
        ...options.retry,
      });

      let response = await postXaiImage(fetchImpl, `${baseUrl}/images/generations`, apiKey, body, timeoutMs);
      for (let attempt = 0; shouldRetryXaiImage(response.status, attempt, requestRetry); attempt += 1) {
        const delay = computeImageBackoffMs(attempt, requestRetry);
        await sleep(delay);
        response = await postXaiImage(fetchImpl, `${baseUrl}/images/generations`, apiKey, body, timeoutMs);
      }

      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new GrokImageApiError(
          `xAI image request failed: ${response.status} ${response.statusText}` +
            (detail ? ` — ${detail}` : ''),
          response.status,
          response.statusText,
          detail,
        );
      }

      const json = (await response.json()) as XaiImagesResponse;
      if (!Array.isArray(json.data)) {
        throw new Error('xAI image response did not include a data array');
      }
      const images: GrokImageDatum[] = json.data.map((d) => ({
        url: d.url,
        b64_json: d.b64_json,
        revisedPrompt: d.revised_prompt,
      }));

      return {
        model: json.model ?? options.model ?? GROK_IMAGE_PRODUCTION_PROFILE.defaultModel,
        responseFormat: options.responseFormat ?? 'url',
        images,
        raw: json,
      };
    },
  };
}

async function postXaiImage(
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

export class GrokImageApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'GrokImageApiError';
  }
}

function normalizeImageRetryConfig(
  config: Partial<GrokImageRetryConfig> = {},
): GrokImageRetryConfig {
  return {
    maxRetries: Math.max(0, Math.floor(config.maxRetries ?? GROK_IMAGE_PRODUCTION_PROFILE.retry.maxRetries)),
    baseDelayMs: Math.max(1, Math.floor(config.baseDelayMs ?? GROK_IMAGE_PRODUCTION_PROFILE.retry.baseDelayMs)),
    maxDelayMs: Math.max(1, Math.floor(config.maxDelayMs ?? GROK_IMAGE_PRODUCTION_PROFILE.retry.maxDelayMs)),
    retryStatuses: config.retryStatuses ?? GROK_IMAGE_PRODUCTION_PROFILE.retry.retryStatuses,
  };
}

function shouldRetryXaiImage(
  status: number,
  attempt: number,
  config: GrokImageRetryConfig,
): boolean {
  return attempt < config.maxRetries && config.retryStatuses.includes(status);
}

function computeImageBackoffMs(
  attempt: number,
  config: GrokImageRetryConfig,
): number {
  return Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt);
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
