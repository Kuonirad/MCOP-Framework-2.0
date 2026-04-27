/**
 * @jest-environment node
 *
 * Live xAI end-to-end test.
 *
 * Disabled by default. Set both `XAI_API_KEY` AND `XAI_LIVE_E2E=1` to
 * exercise the real `https://api.x.ai/v1/chat/completions` endpoint
 * through the GrokMCOPAdapter. The output is the canonical artefact
 * referenced by `docs/integrations/grok.md` for the "Captured Merkle
 * root" section.
 *
 * CI never runs this spec because `XAI_LIVE_E2E` is unset there; it is
 * intended to be invoked manually:
 *
 *   XAI_LIVE_E2E=1 pnpm test -- grok.live.e2e
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import { defaultGrokClient, GrokMCOPAdapter } from '../adapters';

const liveEnabled =
  Boolean(process.env.XAI_API_KEY) && process.env.XAI_LIVE_E2E === '1';

const liveDescribe = liveEnabled ? describe : describe.skip;

liveDescribe('GrokMCOPAdapter (live xAI)', () => {
  jest.setTimeout(120_000);

  it('produces a real Merkle root from a real xAI completion', async () => {
    const adapter = new GrokMCOPAdapter({
      encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
      stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
      etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
      client: defaultGrokClient({ timeoutMs: 90_000 }),
    });

    const response = await adapter.generateOptimizedCompletion(
      'Outline a research agenda for verifiable, stigmergic multi-agent coordination.',
      { model: 'grok-3-mini', temperature: 0.4, maxTokens: 256 },
    );

    expect(response.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(response.result.content.length).toBeGreaterThan(0);

    // Stamp the artefact for docs/integrations/grok.md.
    console.log(
      '\n=== GROK LIVE ARTEFACT ===\n' +
        JSON.stringify(
          {
            merkleRoot: response.merkleRoot,
            provenance: response.provenance,
            usage: response.result.usage,
            model: response.result.model,
            finishReason: response.result.finishReason,
            contentPreview: response.result.content.slice(0, 320),
          },
          null,
          2,
        ) +
        '\n=== END ARTEFACT ===\n',
    );
  });
});
