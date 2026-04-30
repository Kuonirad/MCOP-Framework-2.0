/**
 * Freepik MCOP Adapter — BACKWARD-COMPATIBILITY WRAPPER.
 *
 * Freepik rebranded to Magnific on 27 April 2026.  This module re-exports
 * the Magnific adapter under the old names so existing consumers do not
 * break, but every call emits a one-time console warning urging migration.
 *
 * Migration checklist for consumers:
 *  1. Rename imports: FreepikMCOPAdapter → MagnificMCOPAdapter
 *  2. Rename client interface: FreepikClient → MagnificClient
 *  3. Update endpoint paths to /v1/ai/*
 *  4. Remove deprecated turbo / premium_quality booleans from video upscaling
 *  5. Add server-side input validation (this wrapper guards by default)
 *  6. Add "Powered by Magnific" attribution in consumer-facing UIs
 *  7. Implement download-reporting webhooks for cached assets
 *
 * Full spec: see docs/adapters/MAGNIFIC_MIGRATION.md (generate via
 * `pnpm run docs:magnific` if missing).
 */

import {
  MagnificAssetKind,
  MagnificClient,
  MagnificGenerationResult,
  MagnificImageOptions,
  MagnificMCOPAdapter,
  MagnificAdapterConfig,
  MagnificRequest,
  MagnificUpscaleFactor,
  MagnificUpscaleOptions,
  MagnificVideoOptions,
  MagnificVideoModel,
  MagnificVideoUpscaleOptions,
  MagnificImageModel,
  MAGNIFIC_ATTRIBUTION,
  checkMagnificAttribution,
  estimateUpscaleCost as magnificEstimateUpscaleCost,
} from './magnificAdapter';

let warned = false;
function deprecationWarning(): void {
  if (warned || typeof console === 'undefined') return;
  warned = true;
  console.warn(
    '[MCOP] FreepikMCOPAdapter is deprecated. Freepik rebranded to Magnific ' +
      'on 2026-04-27. Please migrate to MagnificMCOPAdapter. ' +
      'See docs/adapters/MAGNIFIC_MIGRATION.md',
  );
}

/* ------------------------------------------------------------------ */
/*  Re-export everything under legacy names                            */

export type FreepikImageOptions = MagnificImageOptions;
export type FreepikVideoOptions = MagnificVideoOptions;
export type FreepikUpscaleOptions = MagnificUpscaleOptions;
export type FreepikAssetKind = MagnificAssetKind;
export type FreepikRequest = MagnificRequest;
export type FreepikGenerationResult = MagnificGenerationResult;
export type FreepikClient = MagnificClient;
export type FreepikAdapterConfig = MagnificAdapterConfig;

/** @deprecated Use MagnificUpscaleFactor directly. */
export type FreepikUpscaleFactor = MagnificUpscaleFactor;

export type {
  MagnificVideoModel,
  MagnificVideoUpscaleOptions,
  MagnificImageModel,
};
export {
  MAGNIFIC_ATTRIBUTION,
  checkMagnificAttribution,
};

/* ------------------------------------------------------------------ */
/*  Legacy adapter class — thin wrapper                               */

export class FreepikMCOPAdapter extends MagnificMCOPAdapter {
  constructor(config: FreepikAdapterConfig) {
    deprecationWarning();
    super(config);
  }

  protected platformName(): string {
    return 'freepik';
  }

  async getCapabilities() {
    const caps = await super.getCapabilities();
    return {
      ...caps,
      platform: 'freepik' as const,
      version: '2026-04-27-legacy',
      notes:
        (caps.notes ?? '') +
        ' | LEGACY WRAPPER: this adapter delegates to MagnificMCOPAdapter ' +
        'and will be removed in MCOP v3.0. Migrate now.',
    };
  }

  /**
   * Legacy upscale facade — only supports 2× and 4×.
   * Modern Magnific supports 2×, 4×, 8×, 16×.
   */
  async upscaleAsset(
    sourceAssetUrl: string,
    options: Pick<MagnificUpscaleOptions, 'scale' | 'preserveDetail'> = {},
    extras: Pick<
      MagnificRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ) {
    const scale = options.scale ?? 2;
    if (scale !== 2 && scale !== 4) {
      throw new Error(
        `freepik: legacy adapter only supports 2×/4× upscaling. ` +
          `Use MagnificMCOPAdapter.upscaleImage() for 8×/16×.`,
      );
    }
    return this.upscaleImage(sourceAssetUrl, options, extras);
  }
}

/* ------------------------------------------------------------------ */
/*  Legacy cost helper (kept for API surface parity)                  */

export function estimateFreepikUpscaleCost(
  width: number,
  height: number,
  scale: 2 | 4,
): number {
  deprecationWarning();
  return magnificEstimateUpscaleCost(width, height, scale);
}
