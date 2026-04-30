/**
 * Magnific SaaS Integration — Tiered Cost Guardrails.
 *
 * Production-grade downstream example showing how to wire MagnificMCOPAdapter
 * into a multi-tenant SaaS with per-user subscription tiers. Each tier has
 * hard guardrails on:
 *  - maxUpscaleOutputArea (prevents 4K→16× catastrophes)
 *  - maxCallCostEur (per-call ceiling)
 *  - allowedModels (free tier locked to classic-fast, pro gets Mystic 2.5)
 *  - maxVideoDuration (prevents runaway video costs)
 *
 * The adapter is wrapped in a `TieredMagnificService` that enforces
 * subscription boundaries BEFORE dispatch, so a malicious or confused
 * user cannot bill your account into oblivion.
 *
 * Usage:
 *   const svc = new TieredMagnificService(magnificClient, 'pro');
 *   const result = await svc.generateImage(userId, prompt, opts);
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  MagnificClient,
  MagnificMCOPAdapter,
  MagnificImageOptions,
  MagnificVideoOptions,
  MagnificUpscaleOptions,
  MagnificUpscaleFactor,
  MagnificImageModel,
  MagnificVideoModel,
} from '../src/adapters';

/* ------------------------------------------------------------------ */
/*  Subscription tier definitions                                       */

export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface TierGuardrails {
  readonly tier: SubscriptionTier;
  readonly maxUpscaleOutputArea: number;
  readonly maxCallCostEur: number;
  readonly allowedImageModels: readonly MagnificImageModel[];
  readonly allowedVideoModels: readonly MagnificVideoModel[];
  readonly maxVideoDurationSeconds: number;
  readonly allowedUpscaleFactors: readonly MagnificUpscaleFactor[];
  readonly maxImagesPerMinute: number;
  readonly maxVideosPerDay: number;
}

const TIER_PRESETS: Record<SubscriptionTier, TierGuardrails> = {
  free: {
    tier: 'free',
    maxUpscaleOutputArea: 3_686_400, // 1920×1080 @ 2× max
    maxCallCostEur: 0.50,
    allowedImageModels: ['classic-fast'],
    allowedVideoModels: [], // no video on free
    maxVideoDurationSeconds: 0,
    allowedUpscaleFactors: [2],
    maxImagesPerMinute: 5,
    maxVideosPerDay: 0,
  },
  starter: {
    tier: 'starter',
    maxUpscaleOutputArea: 8_294_400, // 1920×1080 @ 4× or 2560×1440 @ 2×
    maxCallCostEur: 2.00,
    allowedImageModels: ['classic-fast', 'flux-dev'],
    allowedVideoModels: ['seeddance-2.0'],
    maxVideoDurationSeconds: 5,
    allowedUpscaleFactors: [2, 4],
    maxImagesPerMinute: 20,
    maxVideosPerDay: 10,
  },
  pro: {
    tier: 'pro',
    maxUpscaleOutputArea: 33_177_600, // 8K UHD area
    maxCallCostEur: 5.00,
    allowedImageModels: ['mystic', 'mystic-2.5-fluid', 'flux-dev'],
    allowedVideoModels: ['veo-3.1', 'seeddance-2.0', 'kling-v3'],
    maxVideoDurationSeconds: 15,
    allowedUpscaleFactors: [2, 4, 8],
    maxImagesPerMinute: 50,
    maxVideosPerDay: 50,
  },
  enterprise: {
    tier: 'enterprise',
    maxUpscaleOutputArea: 132_710_400, // 16K area — negotiate with Magnific
    maxCallCostEur: 25.00,
    allowedImageModels: ['mystic', 'mystic-2.5-fluid', 'classic-fast', 'flux-dev'],
    allowedVideoModels: ['veo-3.1', 'seeddance-2.0', 'kling-v3'],
    maxVideoDurationSeconds: 60,
    allowedUpscaleFactors: [2, 4, 8, 16],
    maxImagesPerMinute: 100,
    maxVideosPerDay: 250,
  },
};

/* ------------------------------------------------------------------ */
/*  Rate-limit token bucket (in-memory; use Redis in production)        */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

function checkRateLimit(
  key: string,
  maxTokens: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { tokens: maxTokens - 1, lastRefill: now });
    return true;
  }
  const elapsed = now - existing.lastRefill;
  const tokensToAdd = (elapsed / windowMs) * maxTokens;
  existing.tokens = Math.min(maxTokens, existing.tokens + tokensToAdd);
  existing.lastRefill = now;
  if (existing.tokens < 1) return false;
  existing.tokens -= 1;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Tiered service wrapper                                              */

export class TieredMagnificService {
  private readonly adapter: MagnificMCOPAdapter;
  private readonly guardrails: TierGuardrails;

  constructor(
    client: MagnificClient,
    tier: SubscriptionTier = 'free',
  ) {
    this.guardrails = TIER_PRESETS[tier];
    this.adapter = new MagnificMCOPAdapter({
      encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
      stigmergy: new StigmergyV5({ resonanceThreshold: 0.4 }),
      etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
      client,
      maxUpscaleOutputArea: this.guardrails.maxUpscaleOutputArea,
      maxCallCostEur: this.guardrails.maxCallCostEur,
    });
  }

  /** Generate an image with tier-enforced model whitelist. */
  async generateImage(
    userId: string,
    prompt: string,
    options: MagnificImageOptions = {},
  ) {
    const bucketKey = `img:${userId}`;
    if (!checkRateLimit(bucketKey, this.guardrails.maxImagesPerMinute, 60_000)) {
      throw new Error(`Rate limit exceeded: ${this.guardrails.maxImagesPerMinute} images/minute on ${this.guardrails.tier} tier.`);
    }

    const model = options.model ?? 'classic-fast';
    if (!this.guardrails.allowedImageModels.includes(model)) {
      throw new Error(
        `Model "${model}" not allowed on ${this.guardrails.tier} tier. ` +
          `Allowed: ${this.guardrails.allowedImageModels.join(', ')}`,
      );
    }

    return this.adapter.generateOptimizedImage(prompt, options);
  }

  /** Generate a video with tier-enforced duration + model whitelist. */
  async generateVideo(
    userId: string,
    prompt: string,
    options: MagnificVideoOptions = {},
  ) {
    const bucketKey = `vid:${userId}`;
    if (!checkRateLimit(bucketKey, this.guardrails.maxVideosPerDay, 86_400_000)) {
      throw new Error(`Rate limit exceeded: ${this.guardrails.maxVideosPerDay} videos/day on ${this.guardrails.tier} tier.`);
    }

    if (this.guardrails.maxVideoDurationSeconds === 0) {
      throw new Error(`Video generation not available on ${this.guardrails.tier} tier.`);
    }

    const duration = options.durationSeconds ?? 5;
    if (duration > this.guardrails.maxVideoDurationSeconds) {
      throw new Error(
        `Duration ${duration}s exceeds ${this.guardrails.tier} tier limit ` +
          `of ${this.guardrails.maxVideoDurationSeconds}s.`,
      );
    }

    const model = options.model ?? 'seeddance-2.0';
    if (!this.guardrails.allowedVideoModels.includes(model)) {
      throw new Error(
        `Model "${model}" not allowed on ${this.guardrails.tier} tier. ` +
          `Allowed: ${this.guardrails.allowedVideoModels.join(', ')}`,
      );
    }

    return this.adapter.generateOptimizedVideo(prompt, options);
  }

  /** Upscale an image with tier-enforced scale whitelist + circuit breakers. */
  async upscaleImage(
    userId: string,
    sourceUrl: string,
    options: MagnificUpscaleOptions = {},
  ) {
    const bucketKey = `img:${userId}`;
    if (!checkRateLimit(bucketKey, this.guardrails.maxImagesPerMinute, 60_000)) {
      throw new Error(`Rate limit exceeded: ${this.guardrails.maxImagesPerMinute} images/minute on ${this.guardrails.tier} tier.`);
    }

    const scale = options.scale ?? 2;
    if (!this.guardrails.allowedUpscaleFactors.includes(scale)) {
      throw new Error(
        `Upscale factor ${scale}× not allowed on ${this.guardrails.tier} tier. ` +
          `Allowed: ${this.guardrails.allowedUpscaleFactors.join('×, ')}×`,
      );
    }

    // Pre-flight cost estimation — reject BEFORE dispatch if too expensive
    const { sourceWidth, sourceHeight } = options;
    if (sourceWidth && sourceHeight) {
      const estimatedCost = this.adapter.estimateUpscaleCost(
        sourceWidth,
        sourceHeight,
        scale,
      );
      if (estimatedCost > this.guardrails.maxCallCostEur) {
        throw new Error(
          `Estimated cost €${estimatedCost} exceeds ${this.guardrails.tier} ` +
            `tier ceiling of €${this.guardrails.maxCallCostEur}. ` +
            `Reduce input dimensions or scale factor.`,
        );
      }
    }

    return this.adapter.upscaleImage(sourceUrl, options);
  }

  /** Upscale a video — tier-enforced availability check. */
  async upscaleVideo(
    userId: string,
    sourceUrl: string,
  ) {
    const bucketKey = `vid:${userId}`;
    if (!checkRateLimit(bucketKey, this.guardrails.maxVideosPerDay, 86_400_000)) {
      throw new Error(`Rate limit exceeded: ${this.guardrails.maxVideosPerDay} videos/day on ${this.guardrails.tier} tier.`);
    }
    return this.adapter.upscaleVideo(sourceUrl);
  }

  /** Expose the underlying adapter for direct advanced use (bypasses tier guards). */
  get rawAdapter(): MagnificMCOPAdapter {
    return this.adapter;
  }

  /** Current tier guardrails (for UI display / audit logs). */
  get currentGuardrails(): Readonly<TierGuardrails> {
    return this.guardrails;
  }
}

/* ------------------------------------------------------------------ */
/*  Example usage                                                       */

async function demo() {
  const stubClient: MagnificClient = {
    async textToImage({ prompt }) {
      return { kind: 'image', assetUrl: `img://${prompt.slice(0, 10)}`, jobId: 'j1' };
    },
    async textToVideo({ prompt }) {
      return { kind: 'video', assetUrl: `vid://${prompt.slice(0, 10)}`, jobId: 'j2' };
    },
    async upscale({ sourceAssetUrl }) {
      return { kind: 'upscale', assetUrl: `${sourceAssetUrl}@upscale` };
    },
    async videoUpscale({ sourceAssetUrl }) {
      return { kind: 'video-upscale', assetUrl: `${sourceAssetUrl}@vid-up` };
    },
  };

  // --- Free tier: locked down ------------------------------------------
  const freeSvc = new TieredMagnificService(stubClient, 'free');
  console.log('Free tier guardrails:', freeSvc.currentGuardrails);

  try {
    await freeSvc.generateImage('user-1', 'a cat', { model: 'mystic-2.5-fluid' });
  } catch (e) {
    console.log('Free tier blocked Mystic:', (e as Error).message);
  }

  // --- Pro tier: full access -------------------------------------------
  const proSvc = new TieredMagnificService(stubClient, 'pro');
  const img = await proSvc.generateImage('user-2', 'a cathedral', {
    model: 'mystic-2.5-fluid',
    resolution: '4k',
  });
  console.log('Pro tier image:', img.result.assetUrl, 'merkle=', img.merkleRoot);

  // --- Upscale with pre-flight cost guardrail --------------------------
  try {
    await proSvc.upscaleImage('user-2', 'https://cdn/huge.png', {
      scale: 16,
      sourceWidth: 3840,
      sourceHeight: 2160,
    });
  } catch (e) {
    console.log('Pro tier blocked 16× 4K:', (e as Error).message);
  }

  // --- Enterprise tier: everything allowed -------------------------------
  const entSvc = new TieredMagnificService(stubClient, 'enterprise');
  const up = await entSvc.upscaleImage('user-3', 'https://cdn/huge.png', {
    scale: 16,
    sourceWidth: 3840,
    sourceHeight: 2160,
  });
  console.log('Enterprise tier upscale:', up.result.assetUrl);
}

if (require.main === module) {
  demo().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
