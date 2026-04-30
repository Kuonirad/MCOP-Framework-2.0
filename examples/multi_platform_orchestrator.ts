/**
 * Multi-platform orchestrator example.
 *
 * Demonstrates how to route a single creative brief through multiple
 * MCOP adapters while sharing the same triad. All adapters write to the
 * same Stigmergy buffer and Etch ledger so cross-platform continuity
 * (e.g. "Magnific asset → Higgsfield shot continuity") shows up in
 * downstream provenance metrics.
 *
 * Post-April 2026: Freepik adapter replaced by MagnificMCOPAdapter.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  AdapterResponse,
  MagnificClient,
  MagnificMCOPAdapter,
  GenericProductionAdapter,
  UtopaiClient,
  UtopaiMCOPAdapter,
} from '../src/adapters';

// Fixture clients — replace with real SDKs in production.
// CRITICAL: Magnific requires raw Base64 or direct HTTPS URLs.
// Do NOT use canvas.toDataURL() or client-side compression.
const magnificClient: MagnificClient = {
  async textToImage({ prompt }) {
    return {
      kind: 'image',
      assetUrl: `magnific://${prompt.slice(0, 16)}`,
      jobId: `mag-${Date.now()}`,
    };
  },
  async textToVideo({ prompt }) {
    return {
      kind: 'video',
      assetUrl: `magnific://video/${prompt.slice(0, 16)}`,
      jobId: `mag-vid-${Date.now()}`,
    };
  },
  async upscale({ sourceAssetUrl }) {
    return { kind: 'upscale', assetUrl: `${sourceAssetUrl}@4x` };
  },
  async videoUpscale({ sourceAssetUrl }) {
    return { kind: 'video-upscale', assetUrl: `${sourceAssetUrl}@video-upscale` };
  },
};

const utopaiClient: UtopaiClient = {
  async composeSegment({ prompt, options }) {
    return {
      segmentId: `utopai-${Date.now()}`,
      script: `${options.sceneId ?? 'scene'} :: ${prompt}`,
      needsHumanReview: false,
    };
  },
};

interface AudioJob {
  jobId: string;
  trackUrl: string;
}

async function main() {
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

  const magnific = new MagnificMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: magnificClient,
    maxUpscaleOutputArea: 33_177_600,
    maxCallCostEur: 5.0,
  });
  const utopai = new UtopaiMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: utopaiClient,
  });
  const audio = new GenericProductionAdapter<AudioJob>({
    encoder,
    stigmergy,
    etch,
    platform: 'soundscape',
    capabilities: { models: ['ambient-v1'], features: ['score-generation'] },
    async dispatch({ refinedPrompt }) {
      return {
        jobId: `audio-${Date.now()}`,
        trackUrl: `soundscape://${refinedPrompt.slice(0, 16)}`,
      };
    },
  });

  const brief = 'A neon-lit Tokyo alley at midnight, melancholy synth score';

  const heroImage = await magnific.generateOptimizedImage(brief, {
    model: 'mystic-2.5-fluid',
    resolution: '4k',
  });
  const narrative: AdapterResponse = await utopai.generate({
    prompt: brief,
    domain: 'narrative',
    payload: { options: { sceneId: 'scene-01', pacing: 'slow' } },
  });
  const score: AdapterResponse<AudioJob> = await audio.generate({
    prompt: brief,
    domain: 'audio',
  });

  const continuity =
    (narrative.provenance.resonanceScore + score.provenance.resonanceScore) / 2;

  console.log('hero merkle =', heroImage.merkleRoot);
  console.log('narrative merkle =', narrative.merkleRoot);
  console.log('score merkle =', score.merkleRoot);
  console.log(
    `cross-platform continuity = ${(continuity * 100).toFixed(1)}%`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
