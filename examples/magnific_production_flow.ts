/**
 * Magnific production flow example (formerly Freepik).
 *
 * Demonstrates how to wire the MagnificMCOPAdapter into a production
 * pipeline post-April 2026 rebrand:
 *  1. Construct the MCOP triad (encoder + stigmergy + etch).
 *  2. Inject a thin MagnificClient — official MCP server SDK or an
 *     in-house HTTPS wrapper targeting /v1/ai/* endpoints.
 *  3. Generate a brand-aligned image, persist the Merkle root for
 *     compliance and feed the tensor back as styleContext for continuity.
 *  4. Show cost estimation and input-validation guardrails.
 *
 * Run with `npx ts-node examples/magnific_production_flow.ts` once you
 * wire in a real Magnific client; otherwise it acts as executable
 * documentation.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  MagnificClient,
  MagnificMCOPAdapter,
  checkMagnificAttribution,
  MAGNIFIC_ATTRIBUTION,
} from '../src/adapters';

// ---------------------------------------------------------------- client
//
// Replace this stub with the real Magnific SDK / MCP client. The adapter
// only depends on the shape declared in `MagnificClient`.
//
// CRITICAL: Do NOT use canvas.toDataURL() or client-side PNG→JPEG
// conversion before transmission. Send raw Base64 or a direct HTTPS URL
// to preserve EXIF metadata and avoid 8–20 % quality loss.
const magnificClient: MagnificClient = {
  async textToImage({ prompt, options }) {
    return {
      kind: 'image',
      assetUrl: `https://cdn.magnific.example/img/${encodeURIComponent(prompt)}.png`,
      jobId: `magnific-${Date.now()}`,
      raw: { prompt, options },
    };
  },
  async textToVideo({ prompt, options }) {
    return {
      kind: 'video',
      assetUrl: `https://cdn.magnific.example/vid/${encodeURIComponent(prompt)}.mp4`,
      jobId: `magnific-${Date.now()}`,
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

  const adapter = new MagnificMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: magnificClient,
    maxUpscaleOutputArea: 33_177_600, // 8K UHD guardrail
    maxCallCostEur: 5.0,
  });

  // --- 1. Cost estimation before dispatch --------------------------------
  const estCost = adapter.estimateUpscaleCost(1920, 1080, 2);
  console.log(`Estimated 2× upscale cost for 1920×1080: €${estCost}`);

  // --- 2. First image — establishes the brand anchor ---------------------
  const hero = await adapter.generateOptimizedImage(
    'aurora-lit cathedral at dawn, painterly mood',
    { model: 'mystic-2.5-fluid', resolution: '4k' },
    { metadata: { campaign: 'launch-q1' } },
  );
  console.log('hero:', hero.result.assetUrl, 'merkle=', hero.merkleRoot);

  // --- 3. Attribution compliance check ----------------------------------
  const uiCopy = 'Enhance your photos with AI upscaling. Powered by Magnific';
  if (!checkMagnificAttribution(uiCopy)) {
    console.warn(
      'WARNING: UI missing required "Powered by Magnific" attribution. ' +
        'This breaches API Terms of Service.',
    );
  }

  // --- 4. Second image — re-uses first tensor as styleContext ------------
  const followUp = await adapter.generateOptimizedImage(
    'same cathedral, midday light, banner format',
    { model: 'mystic-2.5-fluid', aspectRatio: '21:9' },
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

  // --- 5. Video generation with model-agnostic routing -------------------
  const video = await adapter.generateOptimizedVideo(
    'slow push-in through the cathedral nave, dust particles in light',
    { model: 'seeddance-2.0', durationSeconds: 8, fps: 24 },
    { metadata: { campaign: 'launch-q1', sequence: 3 } },
  );
  console.log('video:', video.result.assetUrl, 'merkle=', video.merkleRoot);

  // --- 6. Upscale with circuit-breaker guardrails -----------------------
  try {
    const up = await adapter.upscaleImage(hero.result.assetUrl, {
      scale: 4,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    console.log('upscale:', up.result.assetUrl, 'merkle=', up.merkleRoot);
  } catch (err: any) {
    console.error('Upscale rejected by guardrail:', err.message);
  }

  // --- 7. Video upscale (dedicated endpoint, legacy params removed) -----
  const vidUp = await adapter.upscaleVideo(video.result.assetUrl);
  console.log('video-upscale:', vidUp.result.assetUrl);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
