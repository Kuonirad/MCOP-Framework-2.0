/**
 * @jest-environment node
 *
 * Live xAI end-to-end test for the chained MCOP → Grok text refinement →
 * Grok Imagine pipeline.
 *
 * Disabled by default. Set BOTH:
 *
 *   XAI_API_KEY=sk-...
 *   XAI_LIVE_E2E=1
 *
 * to exercise the real `https://api.x.ai/v1/chat/completions` AND
 * `https://api.x.ai/v1/images/generations` endpoints. The output is the
 * canonical artefact for `examples/grok_imagine_chained.ts`.
 *
 * Optional knobs:
 *
 *   XAI_LIVE_SEED="a cat reading a book in a tree at sunset"
 *   XAI_LIVE_TEXT_MODEL=grok-4-1-fast-non-reasoning   # default
 *   XAI_LIVE_IMAGE_MODEL=grok-imagine-image-quality
 *   XAI_LIVE_IMAGE_N=1
 *
 * Invoke:
 *
 *   XAI_API_KEY=sk-... XAI_LIVE_E2E=1 pnpm test -- grokImagine.live.e2e
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import {
  defaultGrokClient,
  defaultGrokImageClient,
  GrokImageMCOPAdapter,
  GrokMCOPAdapter,
} from '../adapters';

const liveEnabled =
  Boolean(process.env.XAI_API_KEY) && process.env.XAI_LIVE_E2E === '1';
const liveDescribe = liveEnabled ? describe : describe.skip;

const PROMPT_REFINEMENT_SYSTEM = [
  'You are an image-prompt refinement assistant for the MCOP framework.',
  'Given a short user seed, produce ONE concise but vivid image-generation',
  'prompt (1–3 sentences, no preamble, no quotes, no markdown). Include',
  'subject, composition, lighting, mood, and rendering style. Output the',
  'prompt only — no commentary.',
].join(' ');

liveDescribe('GrokMCOPAdapter + GrokImageMCOPAdapter (live xAI)', () => {
  jest.setTimeout(180_000);

  it('refines a seed via grok text and dispatches to grok imagine', async () => {
    const seed =
      process.env.XAI_LIVE_SEED ??
      'a cat reading a book in a tree at sunset';
    const textModel = process.env.XAI_LIVE_TEXT_MODEL ?? 'grok-4-1-fast-non-reasoning';
    const imageModel =
      process.env.XAI_LIVE_IMAGE_MODEL ?? 'grok-imagine-image-quality';
    const n = Math.max(1, Math.min(10, Number(process.env.XAI_LIVE_IMAGE_N ?? '1')));

    // Shared triad so both stages chain into a single Merkle history.
    const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
    const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3 });
    const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

    // ---------- Stage A: text refinement ----------
    const text = new GrokMCOPAdapter({
      encoder,
      stigmergy,
      etch,
      client: defaultGrokClient({ timeoutMs: 90_000 }),
    });

    const refinement = await text.generateOptimizedCompletion(
      seed,
      {
        model: textModel,
        temperature: 0.45,
        maxTokens: 256,
        systemPrompt: PROMPT_REFINEMENT_SYSTEM,
      },
      { metadata: { stage: 'A-refine', userSeed: seed } },
    );

    const refinedImagePrompt = refinement.result.content.trim();
    expect(refinement.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(refinedImagePrompt.length).toBeGreaterThan(0);

    // ---------- Stage B: image generation ----------
    const image = new GrokImageMCOPAdapter({
      encoder,
      stigmergy,
      etch,
      client: defaultGrokImageClient({ timeoutMs: 150_000 }),
    });

    const generation = await image.generateOptimizedImage(
      refinedImagePrompt,
      {
        model: imageModel,
        n,
        responseFormat: 'url',
        aspectRatio: '16:9',
        resolution: '2k',
      },
      {
        metadata: {
          stage: 'B-generate',
          upstreamMerkleRoot: refinement.merkleRoot,
          upstreamTraceId: refinement.provenance.traceId,
        },
      },
    );

    expect(generation.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(generation.result.images.length).toBe(n);
    expect(generation.result.images[0].url ?? generation.result.images[0].b64_json).toBeTruthy();
    expect(generation.merkleRoot).not.toBe(refinement.merkleRoot);

    // Stamp the chained artefact for the docs.
    console.log(
      '\n=== GROK IMAGINE LIVE ARTEFACT ===\n' +
        JSON.stringify(
          {
            seed,
            stageA: {
              model: refinement.result.model,
              merkleRoot: refinement.merkleRoot,
              refinedPrompt: refinedImagePrompt,
              usage: refinement.result.usage,
              resonance: refinement.provenance.resonanceScore,
            },
            stageB: {
              model: generation.result.model,
              merkleRoot: generation.merkleRoot,
              images: generation.result.images.map((img) => ({
                url: img.url,
                hasBase64: Boolean(img.b64_json),
                revisedPrompt: img.revisedPrompt,
              })),
              resonance: generation.provenance.resonanceScore,
            },
          },
          null,
          2,
        ) +
        '\n=== END ARTEFACT ===\n',
    );
  });
});
