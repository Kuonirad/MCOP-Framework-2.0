/**
 * Utopai MCOP Adapter — long-form narrative film engine.
 *
 * Utopai workflows produce multi-scene scripts that must remain stylistically
 * coherent across hundreds of segments. This adapter records each segment's
 * tensor as a stigmergy trace so subsequent calls inherit a continuity
 * preamble through the dialectical synthesizer; segments below the
 * resonance threshold are flagged for human review rather than silently
 * drifting.
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

export interface UtopaiSegmentOptions {
  sceneId?: string;
  characterRefs?: string[];
  pacing?: 'slow' | 'medium' | 'fast';
  voiceStyle?: string;
}

export interface UtopaiRequest extends AdapterRequest {
  payload?: {
    options?: UtopaiSegmentOptions;
    /** Minimum resonance score required to dispatch without a human gate. */
    continuityFloor?: number;
  };
}

export interface UtopaiSegmentResult {
  segmentId: string;
  script: string;
  storyboardUrl?: string;
  needsHumanReview: boolean;
  raw?: unknown;
}

export interface UtopaiClient {
  composeSegment(args: {
    prompt: string;
    options: UtopaiSegmentOptions;
  }): Promise<UtopaiSegmentResult>;
}

export interface UtopaiAdapterConfig extends BaseAdapterDeps {
  client: UtopaiClient;
  /** Defaults to 0.4: below this resonance, the segment is flagged. */
  defaultContinuityFloor?: number;
}

export class UtopaiMCOPAdapter extends BaseAdapter<
  UtopaiRequest,
  UtopaiSegmentResult
> {
  private readonly client: UtopaiClient;
  private readonly defaultContinuityFloor: number;

  constructor(config: UtopaiAdapterConfig) {
    super(config);
    this.client = config.client;
    this.defaultContinuityFloor = config.defaultContinuityFloor ?? 0.4;
  }

  protected platformName(): string {
    return 'utopai';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'utopai',
      version: '2024-11',
      models: ['narrative-long-form-v1'],
      supportsAudit: true,
      features: [
        'segment-composition',
        'character-continuity',
        'human-review-gating',
      ],
      notes:
        'Designed for long-form narrative arcs. Continuity floor gates ' +
        'segments that drift below stylistic resonance for human review.',
    };
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: UtopaiRequest,
  ): Promise<UtopaiSegmentResult> {
    const floor =
      request.payload?.continuityFloor ?? this.defaultContinuityFloor;

    const result = await this.client.composeSegment({
      prompt: dispatch.refinedPrompt,
      options: request.payload?.options ?? {},
    });

    const needsHumanReview =
      result.needsHumanReview || dispatch.resonance.score < floor;

    return { ...result, needsHumanReview };
  }
}
