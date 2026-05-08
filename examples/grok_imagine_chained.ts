/**
 * Grok Imagine end-to-end chaining example.
 *
 * Pipeline:
 *
 *   1. Build the MCOP triad (NOVA-NEO Encoder + Stigmergy v5 + Holographic Etch).
 *   2. Stage A — `GrokMCOPAdapter` (chat-completions) takes a short user
 *      seed ("a cat in a tree") and refines it into a rich, vendor-ready
 *      image prompt using grok-4-mini.  The refined prompt + Merkle
 *      provenance + resonance score are recorded.
 *   3. Stage B — `GrokImageMCOPAdapter` takes that refined prompt and
 *      dispatches it to xAI's `/v1/images/generations` endpoint
 *      (model: grok-imagine-image-quality).  A second provenance
 *      bundle is recorded so the entire chain is Merkle-auditable.
 *   4. Print both completions, both provenance bundles, and the image
 *      URL(s) returned by xAI.
 *
 * Run:
 *
 *   XAI_API_KEY=sk-... npx ts-node examples/grok_imagine_chained.ts \
 *     "a cat reading a book in a tree at sunset"
 *
 * Without `XAI_API_KEY` the script wires offline stub clients for both
 * stages so the example doubles as executable documentation.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  defaultGrokClient,
  defaultGrokImageClient,
  GrokClient,
  GrokImageClient,
  GrokImageMCOPAdapter,
  GrokMCOPAdapter,
} from '../src/adapters';

const PROMPT_REFINEMENT_SYSTEM = [
  'You are an image-prompt refinement assistant for the MCOP framework.',
  'Given a short user seed, produce ONE concise but vivid image-generation',
  'prompt (1–3 sentences, no preamble, no quotes, no markdown). Include',
  'subject, composition, lighting, mood, and rendering style. Do NOT add',
  'commentary or explain your choices — output the prompt only.',
].join(' ');

function buildTextClient(): GrokClient {
  if (process.env.XAI_API_KEY?.trim()) return defaultGrokClient();
  console.warn('[grok-imagine-example] XAI_API_KEY not set — text stage uses offline stub.');
  return {
    async createCompletion({ messages, options }) {
      const seed = messages[messages.length - 1]?.content ?? '';
      return {
        model: options.model ?? 'grok-4-mini',
        content:
          `${seed} — cinematic golden-hour lighting, shallow depth of field, ` +
          `painterly composition, hyperreal detail, 35mm film aesthetic.`,
        finishReason: 'stop',
        usage: {
          promptTokens: seed.length,
          completionTokens: 32,
          totalTokens: seed.length + 32,
        },
      };
    },
  };
}

function buildImageClient(): GrokImageClient {
  if (process.env.XAI_API_KEY?.trim()) return defaultGrokImageClient();
  console.warn('[grok-imagine-example] XAI_API_KEY not set — image stage uses offline stub.');
  return {
    async generateImage({ prompt, options }) {
      return {
        model: options.model ?? 'grok-imagine-image-quality',
        responseFormat: options.responseFormat ?? 'url',
        images: [
          {
            url: 'https://stub.invalid/grok-imagine/offline.jpg',
            revisedPrompt: prompt,
          },
        ],
        raw: { stub: true, prompt, options },
      };
    },
  };
}

async function main() {
  const seed =
    process.argv.slice(2).join(' ').trim() ||
    'a cat reading a book in a tree at sunset';

  // Shared MCOP triad — both stages route through the SAME stigmergy and
  // etch instances so the second-stage trace can resonate against the
  // first-stage trace, producing a single connected Merkle history.
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

  // --------------------------------------------------------------- Stage A
  // Refine the seed into a rich image prompt with grok-4-mini.
  const text = new GrokMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: buildTextClient(),
  });

  const refinement = await text.generateOptimizedCompletion(
    seed,
    {
      model: 'grok-4-mini',
      temperature: 0.45,
      maxTokens: 256,
      systemPrompt: PROMPT_REFINEMENT_SYSTEM,
      stigmergyHistory: { limit: 5, label: 'image-prompt-refinement' },
    },
    { metadata: { stage: 'A-refine', userSeed: seed } },
  );

  const refinedImagePrompt = refinement.result.content.trim();

  console.log('--- Stage A: Grok text refinement ---');
  console.log(`seed:           ${seed}`);
  console.log(`refined prompt: ${refinedImagePrompt}`);
  console.log(`merkleRoot:     ${refinement.merkleRoot}`);
  console.log(`resonance:      ${refinement.provenance.resonanceScore.toFixed(4)}`);

  // --------------------------------------------------------------- Stage B
  // Hand the refined prompt to Grok Imagine.
  const image = new GrokImageMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: buildImageClient(),
  });

  const generation = await image.generateOptimizedImage(
    refinedImagePrompt,
    {
      model: 'grok-imagine-image-quality',
      n: 1,
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

  console.log('\n--- Stage B: Grok Imagine generation ---');
  for (const [i, img] of generation.result.images.entries()) {
    const out = img.url ?? (img.b64_json ? `<base64 ${img.b64_json.length} chars>` : '<empty>');
    console.log(`image[${i}]:     ${out}`);
    if (img.revisedPrompt && img.revisedPrompt !== refinedImagePrompt) {
      console.log(`   revised:    ${img.revisedPrompt}`);
    }
  }
  console.log(`merkleRoot:     ${generation.merkleRoot}`);
  console.log(`resonance:      ${generation.provenance.resonanceScore.toFixed(4)}`);

  // -------------------------------------------------------------- Audit
  console.log('\n--- Chained provenance bundle ---');
  console.log(JSON.stringify({
    stageA: refinement.provenance,
    stageB: generation.provenance,
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
