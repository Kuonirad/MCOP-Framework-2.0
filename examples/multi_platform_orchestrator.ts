/**
 * Multi-platform orchestrator example.
 *
 * Demonstrates how to route a single creative brief through multiple
 * MCOP adapters while sharing the same triad. All adapters write to the
 * same Stigmergy buffer and Etch ledger so cross-platform continuity
 * (e.g. "Freepik asset → Higgsfield shot continuity") shows up in
 * downstream provenance metrics.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  AdapterResponse,
  FreepikClient,
  FreepikMCOPAdapter,
  GenericProductionAdapter,
  UtopaiClient,
  UtopaiMCOPAdapter,
} from '../src/adapters';

// Fixture clients — replace with real SDKs in production.
const freepikClient: FreepikClient = {
  async textToImage({ prompt }) {
    return {
      kind: 'image',
      assetUrl: `freepik://${prompt.slice(0, 16)}`,
      jobId: `fp-${Date.now()}`,
    };
  },
  async textToVideo({ prompt }) {
    return {
      kind: 'video',
      assetUrl: `freepik://video/${prompt.slice(0, 16)}`,
    };
  },
  async upscale({ sourceAssetUrl }) {
    return { kind: 'upscale', assetUrl: `${sourceAssetUrl}@4x` };
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

  const freepik = new FreepikMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: freepikClient,
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

  const heroImage = await freepik.generateOptimizedImage(brief);
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
