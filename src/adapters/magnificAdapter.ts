/**
 * Magnific MCOP Adapter — orchestrates Magnific's (formerly Freepik)
 * REST/MCP image, video, upscale and video-upscale endpoints through the
 * MCOP cognitive layer.
 *
 * Post-April 2026 rebrand changes reflected:
 *  - API routes under /v1/ai/ namespace
 *  - Volumetric pixel-area pricing for image upscaling (2×, 4×, 8×, 16×)
 *  - Video upscaling moved to dedicated POST /v1/ai/video-upscaler/turbo
 *    (legacy turbo/premium_quality booleans removed)
 *  - Model-agnostic orchestration layer: Mystic 2.5, Google Veo 3.1,
 *    ByteDance Seeddance 2.0
 *  - Raw-file transmission required (no canvas.toDataURL / client-side
 *    compression) to prevent 8–20 % quality loss
 *  - "Powered by Magnific" attribution compliance helper
 *  - Server-side input validation / circuit-breakers strongly recommended
 *    to avoid catastrophic per-call billing on 4K→16× jobs
 *
 * The adapter does NOT bundle the Magnific SDK; instead it accepts a thin
 * client interface so callers can wire either the official
 * `@magnific/mcp` package, an in-house HTTP wrapper, or a fixture for
 * tests.
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

/** Image generation models exposed through Magnific's unified gateway. */
export type MagnificImageModel =
  | 'mystic'
  | 'mystic-2.5-fluid'
  | 'classic-fast'
  | 'flux-dev'
  | string;

/** Video generation models (model-agnostic orchestration layer). */
export type MagnificVideoModel =
  | 'veo-3.1'
  | 'seeddance-2.0'
  | 'kling-v3'
  | string;

/** Image upscale factor — volumetric pricing scales with output pixels. */
export type MagnificUpscaleFactor = 2 | 4 | 8 | 16;

export interface MagnificImageOptions {
  model?: MagnificImageModel;
  resolution?: '1k' | '2k' | '4k' | string;
  aspectRatio?: string;
  seed?: number;
  /** Negative prompt matrix (supported by Veo 3.1 and Mystic). */
  negativePrompt?: string;
}

export interface MagnificVideoOptions {
  model?: MagnificVideoModel;
  durationSeconds?: number;
  fps?: number;
  /** Native audio generation flag (Veo 3.1 native, ~$0.40/s). */
  nativeAudio?: boolean;
  /** Up to 12 simultaneous reference files (Seeddance 2.0). */
  referenceFiles?: string[];
}

export interface MagnificUpscaleOptions {
  scale?: MagnificUpscaleFactor;
  preserveDetail?: boolean;
  /** Source dimensions — used for cost estimation and circuit-breakers. */
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface MagnificVideoUpscaleOptions {
  /** Dedicated video-upscale endpoint (legacy turbo bool removed). */
  turbo?: false; // intentionally omitted — legacy compat marker
}

export type MagnificAssetKind =
  | 'image'
  | 'video'
  | 'upscale'
  | 'video-upscale';

/* ------------------------------------------------------------------ */
/*  Request / Result shapes                                             */

export interface MagnificRequest extends AdapterRequest {
  payload?: {
    kind?: MagnificAssetKind;
    image?: MagnificImageOptions;
    video?: MagnificVideoOptions;
    upscale?: MagnificUpscaleOptions;
    videoUpscale?: MagnificVideoUpscaleOptions;
    /** For upscale / video-upscale jobs: a URL or asset id. */
    sourceAssetUrl?: string;
    /** Optional raw Base64 string when sourceAssetUrl is unavailable. */
    sourceAssetBase64?: string;
  };
}

export interface MagnificGenerationResult {
  kind: MagnificAssetKind;
  assetUrl: string;
  jobId?: string;
  /** Estimated cost in EUR (when the adapter/client can provide it). */
  estimatedCostEur?: number;
  raw?: unknown;
}

/* ------------------------------------------------------------------ */
/*  Client contract — keep adapter SDK-agnostic                        */

export interface MagnificClient {
  textToImage(args: {
    prompt: string;
    options: MagnificImageOptions;
  }): Promise<MagnificGenerationResult>;

  textToVideo(args: {
    prompt: string;
    options: MagnificVideoOptions;
  }): Promise<MagnificGenerationResult>;

  upscale(args: {
    sourceAssetUrl?: string;
    sourceAssetBase64?: string;
    options: MagnificUpscaleOptions;
  }): Promise<MagnificGenerationResult>;

  videoUpscale(args: {
    sourceAssetUrl?: string;
    sourceAssetBase64?: string;
    options?: MagnificVideoUpscaleOptions;
  }): Promise<MagnificGenerationResult>;
}

/* ------------------------------------------------------------------ */
/*  Config                                                              */

export interface MagnificAdapterConfig extends BaseAdapterDeps {
  client: MagnificClient;
  /** Default entropy target for graphic prompts (0.12 per spec). */
  defaultEntropyTarget?: number;
  /** Maximum upscale output area (width × height) allowed per call.
   *  Default: 33_177_600  (≈ 7680 × 4320, 8K UHD) — adjust to taste. */
  maxUpscaleOutputArea?: number;
  /** Hard cost ceiling per single call (EUR). Default: 5.00. */
  maxCallCostEur?: number;
}

/* ------------------------------------------------------------------ */
/*  Volumetric cost lookup (EUR) — from April 2026 docs               */

const VOLUMETRIC_TABLE: Array<{
  inputW: number;
  inputH: number;
  factor: MagnificUpscaleFactor;
  cost: number;
}> = [
  { inputW: 640, inputH: 480, factor: 2, cost: 0.10 },
  { inputW: 640, inputH: 480, factor: 4, cost: 0.20 },
  { inputW: 640, inputH: 480, factor: 8, cost: 0.50 },
  { inputW: 1280, inputH: 720, factor: 2, cost: 0.10 },
  { inputW: 1280, inputH: 720, factor: 4, cost: 0.40 },
  { inputW: 1920, inputH: 1080, factor: 2, cost: 0.20 },
];

/** Linear-interpolate cost from known reference points. */
export function estimateUpscaleCost(
  w: number,
  h: number,
  factor: MagnificUpscaleFactor,
): number {
  const outPixels = w * factor * h * factor;

  // Exact match first
  const exact = VOLUMETRIC_TABLE.find(
    (r) => r.inputW === w && r.inputH === h && r.factor === factor,
  );
  if (exact) return exact.cost;

  // Nearest-neighbour interpolation over (input pixels × factor²)
  const inputPixels = w * h;
  const target = inputPixels * factor * factor;

  const refs = VOLUMETRIC_TABLE.filter((r) => r.factor === factor);
  if (refs.length === 0) {
    // No reference for this factor — rough heuristic: €0.10 per 1.2 Mpx output
    return Math.round((outPixels / 1_200_000) * 0.10 * 100) / 100;
  }

  // Sort by distance to target pixel volume
  refs.sort(
    (a, b) =>
      Math.abs(a.inputW * a.inputH * factor * factor - target) -
      Math.abs(b.inputW * b.inputH * factor * factor - target),
  );
  const nearest = refs[0];
  const nearestPixels = nearest.inputW * nearest.inputH * factor * factor;
  const ratio = target / nearestPixels;
  return Math.round(nearest.cost * ratio * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                             */

export class MagnificMCOPAdapter extends BaseAdapter<
  MagnificRequest,
  MagnificGenerationResult
> {
  private readonly client: MagnificClient;
  private readonly defaultEntropyTarget: number;
  private readonly maxUpscaleOutputArea: number;
  private readonly maxCallCostEur: number;

  constructor(config: MagnificAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? 0.12;
    this.maxUpscaleOutputArea = config.maxUpscaleOutputArea ?? 33_177_600; // 8K UHD area
    this.maxCallCostEur = config.maxCallCostEur ?? 5.0;
  }

  protected platformName(): string {
    return 'magnific';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'magnific',
      version: '2026-04-27',
      models: [
        'mystic',
        'mystic-2.5-fluid',
        'classic-fast',
        'flux-dev',
        'veo-3.1',
        'seeddance-2.0',
        'kling-v3',
      ],
      supportsAudit: true,
      features: [
        'text-to-image',
        'text-to-video',
        'image-upscale',
        'video-upscale',
        'mcp-server',
        'volumetric-pricing',
        'model-orchestration',
      ],
      maxResolution: '4k-video-native',
      notes:
        'Post-rebrand Magnific (ex-Freepik). ' +
        'Volumetric pixel-area billing for upscaling. ' +
        'Raw-file or direct-HTTPS transmission required — ' +
        'no canvas.toDataURL(). ' +
        'Video upscaling uses POST /v1/ai/video-upscaler/turbo. ' +
        'Default entropyTarget=0.12 tuned for graphic-domain prompts.',
    };
  }

  /** Convenience facade — image generation. */
  async generateOptimizedImage(
    prompt: string,
    options: MagnificImageOptions = {},
    extras: Pick<
      MagnificRequest,
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

  /** Convenience facade — video generation with model routing. */
  async generateOptimizedVideo(
    prompt: string,
    options: MagnificVideoOptions = {},
    extras: Pick<
      MagnificRequest,
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

  /** Convenience facade — image upscaling with cost guardrails. */
  async upscaleImage(
    sourceAssetUrl: string,
    options: MagnificUpscaleOptions = {},
    extras: Pick<
      MagnificRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    this.validateUpscale(options);
    return this.generate({
      prompt: `upscale:${sourceAssetUrl}`,
      domain: 'graphic',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: { ...(extras.metadata ?? {}), assetKind: 'upscale' },
      payload: { kind: 'upscale', sourceAssetUrl, upscale: options },
    });
  }

  /** Convenience facade — video upscaling (dedicated endpoint). */
  async upscaleVideo(
    sourceAssetUrl: string,
    extras: Pick<
      MagnificRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    return this.generate({
      prompt: `video-upscale:${sourceAssetUrl}`,
      domain: 'cinematic',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: { ...(extras.metadata ?? {}), assetKind: 'video-upscale' },
      payload: { kind: 'video-upscale', sourceAssetUrl },
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Cost estimation helpers                                          */

  /** Estimate the EUR cost of an image upscale before dispatching. */
  estimateUpscaleCost(
    width: number,
    height: number,
    factor: MagnificUpscaleFactor,
  ): number {
    return estimateUpscaleCost(width, height, factor);
  }

  /** Estimate video generation cost at ~$0.30–$0.40/s (model dependent). */
  estimateVideoCost(durationSeconds: number, model: MagnificVideoModel): number {
    const perSecond = model === 'veo-3.1' ? 0.40 : 0.30;
    return Math.round(durationSeconds * perSecond * 100) / 100;
  }

  /* ---------------------------------------------------------------- */
  /*  Circuit-breaker validation                                       */

  /** Throws if an upscale would exceed guardrails. Call before dispatch. */
  validateUpscale(options: MagnificUpscaleOptions): void {
    const { scale = 2, sourceWidth, sourceHeight } = options;

    if (sourceWidth && sourceHeight) {
      const outArea = sourceWidth * scale * sourceHeight * scale;
      if (outArea > this.maxUpscaleOutputArea) {
        throw new Error(
          `magnific: upscale output area ${outArea.toLocaleString()} px ` +
            `exceeds adapter guardrail ${this.maxUpscaleOutputArea.toLocaleString()} px ` +
            `(${sourceWidth}×${sourceHeight} @ ${scale}×). ` +
            `Reduce input dimensions or scale factor to avoid catastrophic billing.`,
        );
      }
      const cost = estimateUpscaleCost(sourceWidth, sourceHeight, scale);
      if (cost > this.maxCallCostEur) {
        throw new Error(
          `magnific: estimated upscale cost €${cost} exceeds ` +
            `adapter hard-stop €${this.maxCallCostEur}. ` +
            `Rejecting call to prevent budget overrun.`,
        );
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Platform dispatch                                                */

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: MagnificRequest,
  ): Promise<MagnificGenerationResult> {
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
        const b64 = request.payload?.sourceAssetBase64;
        if (!source && !b64) {
          throw new Error(
            'magnific: upscale requires payload.sourceAssetUrl or sourceAssetBase64',
          );
        }
        return this.client.upscale({
          sourceAssetUrl: source,
          sourceAssetBase64: b64,
          options: request.payload?.upscale ?? {},
        });
      }

      case 'video-upscale': {
        const source = request.payload?.sourceAssetUrl;
        const b64 = request.payload?.sourceAssetBase64;
        if (!source && !b64) {
          throw new Error(
            'magnific: video-upscale requires payload.sourceAssetUrl or sourceAssetBase64',
          );
        }
        return this.client.videoUpscale({
          sourceAssetUrl: source,
          sourceAssetBase64: b64,
          options: request.payload?.videoUpscale ?? {},
        });
      }

      /* istanbul ignore next — TS exhaustiveness guard */
      default: {
        const exhaustive: never = kind;
        throw new Error(`magnific: unsupported asset kind ${exhaustive}`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Attribution helper — API ToS requires "Powered by Magnific"      */

export const MAGNIFIC_ATTRIBUTION = {
  text: 'Powered by Magnific',
  logoUrl:
    'https://cdn.magnific.com/assets/brand/magnific-powered-by-logo.svg',
  termsUrl: 'https://magnific.com/api-terms',
} as const;

/** Validate that a consumer-facing UI carries required attribution. */
export function checkMagnificAttribution(uiText: string): boolean {
  return uiText.includes(MAGNIFIC_ATTRIBUTION.text);
}
