/**
 * Freepik production flow example — LEGACY COMPAT.
 *
 * Demonstrates how to wire the FreepikMCOPAdapter (now a backward-compat
 * wrapper over MagnificMCOPAdapter) into a production pipeline.
 * New code should use MagnificMCOPAdapter directly — see
 * examples/magnific_production_flow.ts.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  FreepikClient,
  FreepikMCOPAdapter,
} from '../src/adapters';

// ---------------------------------------------------------------- client
//
// Replace this stub with the real Magnific SDK / MCP client. The adapter
// only depends on the shape declared in `FreepikClient` (now an alias for
// MagnificClient).
const freepikClient: FreepikClient = {
  async textToImage({ prompt, options }) {
    return {
      kind: 'image',
      assetUrl: `https://cdn.freepik.example/img/${encodeURIComponent(prompt)}.png`,
      jobId: `freepik-${Date.now()}`,
      raw: { prompt, options },
    };
  },
  async textToVideo({ prompt, options }) {
    return {
      kind: 'video',
      assetUrl: `https://cdn.freepik.example/vid/${encodeURIComponent(prompt)}.mp4`,
      jobId: `freepik-${Date.now()}`,
      raw: { prompt, options },
    };
  },
  async upscale({ sourceAssetUrl, options }) {
    return {
      kind: 'upscale',
      assetUrl: `${sourceAssetUrl}?upscale=${options.scale ?? 2}`,
      raw: { options },
    };
  },
  async videoUpscale({ sourceAssetUrl }) {
    return {
      kind: 'video-upscale',
      assetUrl: `${sourceAssetUrl}?video-upscale=1`,
      raw: {},
    };
  },
};

async function main() {
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.4 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

  const adapter = new FreepikMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: freepikClient,
  });

  // First image — establishes the brand anchor.
  const hero = await adapter.generateOptimizedImage(
    'aurora-lit cathedral at dawn, painterly mood',
    { model: 'mystic', resolution: '4k' },
    { metadata: { campaign: 'launch-q1' } },
  );
  console.log('hero:', hero.result.assetUrl, 'merkle=', hero.merkleRoot);

  // Second image — re-uses the first tensor as styleContext so the
  // dialectical synthesizer prepends a continuity tag when resonance fires.
  const followUp = await adapter.generateOptimizedImage(
    'same cathedral, midday light, banner format',
    { model: 'mystic', aspectRatio: '21:9' },
    {
      styleContext: encoder.encode('aurora-lit cathedral at dawn, painterly mood'),
      metadata: { campaign: 'launch-q1', sequence: 2 },
    },
  );
  console.log(
    'follow-up:',
    followUp.result.assetUrl,
    'resonance=',
    followUp.provenance.resonanceScore.toFixed(3),
    'merkle=',
    followUp.merkleRoot,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
