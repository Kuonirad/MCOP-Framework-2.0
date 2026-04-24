/**
 * Freepik MCOP Adapter — orchestrates Freepik's REST/MCP image, video and
 * upscale endpoints through the MCOP cognitive layer. The adapter does
 * NOT bundle the Freepik SDK; instead it accepts a thin client interface
 * so callers can wire either the official `@freepik/mcp` package, an
 * in-house HTTP wrapper, or a fixture for tests.
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

export interface FreepikImageOptions {
  model?: 'mystic' | 'classic-fast' | 'flux-dev' | string;
  resolution?: '1k' | '2k' | '4k' | string;
  aspectRatio?: string;
  seed?: number;
}

export interface FreepikVideoOptions {
  model?: 'kling-v2' | 'minimax-hailuo' | string;
  durationSeconds?: number;
  fps?: number;
}

export interface FreepikUpscaleOptions {
  scale?: 2 | 4;
  preserveDetail?: boolean;
}

export type FreepikAssetKind = 'image' | 'video' | 'upscale';

export interface FreepikRequest extends AdapterRequest {
  payload?: {
    kind?: FreepikAssetKind;
    image?: FreepikImageOptions;
    video?: FreepikVideoOptions;
    upscale?: FreepikUpscaleOptions;
    /** For upscale jobs: a URL or asset id supplied by the caller. */
    sourceAssetUrl?: string;
  };
}

export interface FreepikGenerationResult {
  kind: FreepikAssetKind;
  assetUrl: string;
  jobId?: string;
  raw?: unknown;
}

/** Minimal client surface — keeps the adapter SDK-agnostic. */
export interface FreepikClient {
  textToImage(args: {
    prompt: string;
    options: FreepikImageOptions;
  }): Promise<FreepikGenerationResult>;
  textToVideo(args: {
    prompt: string;
    options: FreepikVideoOptions;
  }): Promise<FreepikGenerationResult>;
  upscale(args: {
    sourceAssetUrl: string;
    options: FreepikUpscaleOptions;
  }): Promise<FreepikGenerationResult>;
}

export interface FreepikAdapterConfig extends BaseAdapterDeps {
  client: FreepikClient;
  /** Default entropy target for graphic prompts (0.12 per spec). */
  defaultEntropyTarget?: number;
}

export class FreepikMCOPAdapter extends BaseAdapter<
  FreepikRequest,
  FreepikGenerationResult
> {
  private readonly client: FreepikClient;
  private readonly defaultEntropyTarget: number;

  constructor(config: FreepikAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? 0.12;
  }

  protected platformName(): string {
    return 'freepik';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'freepik',
      version: '2024-10',
      models: ['mystic', 'classic-fast', 'flux-dev', 'kling-v2', 'minimax-hailuo'],
      supportsAudit: true,
      features: ['text-to-image', 'text-to-video', 'upscale', 'mcp-server'],
      maxResolution: '4k',
      notes:
        'Default entropyTarget=0.12 tuned for graphic-domain prompts; ' +
        'override per-request via AdapterRequest.entropyTarget.',
    };
  }

  /**
   * Convenience facade matching the v2.1 spec example: produces a Freepik
   * image while preserving brand continuity through the stigmergy layer.
   */
  async generateOptimizedImage(
    prompt: string,
    options: FreepikImageOptions = {},
    extras: Pick<
      FreepikRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    return this.generate({
      prompt,
      domain: 'graphic',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: { ...(extras.metadata ?? {}), assetKind: 'image' },
      payload: { kind: 'image', image: options },
    });
  }

  async generateOptimizedVideo(
    prompt: string,
    options: FreepikVideoOptions = {},
    extras: Pick<
      FreepikRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    return this.generate({
      prompt,
      domain: 'cinematic',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: { ...(extras.metadata ?? {}), assetKind: 'video' },
      payload: { kind: 'video', video: options },
    });
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: FreepikRequest,
  ): Promise<FreepikGenerationResult> {
    const kind = request.payload?.kind ?? 'image';
    switch (kind) {
      case 'image':
        return this.client.textToImage({
          prompt: dispatch.refinedPrompt,
          options: request.payload?.image ?? {},
        });
      case 'video':
        return this.client.textToVideo({
          prompt: dispatch.refinedPrompt,
          options: request.payload?.video ?? {},
        });
      case 'upscale': {
        const source = request.payload?.sourceAssetUrl;
        if (!source) {
          throw new Error(
            'freepik: upscale requires payload.sourceAssetUrl',
          );
        }
        return this.client.upscale({
          sourceAssetUrl: source,
          options: request.payload?.upscale ?? {},
        });
      }
      /* istanbul ignore next -- TS exhaustiveness guard */
      default: {
        const exhaustive: never = kind;
        throw new Error(`freepik: unsupported asset kind ${exhaustive}`);
      }
    }
  }
}
