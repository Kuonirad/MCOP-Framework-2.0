/**
 * @jest-environment node
 *
 * Live DashScope (Qwen) end-to-end test.
 *
 * Disabled by default. Set both `QWEN_API_KEY` (or `DASHSCOPE_API_KEY`)
 * AND `QWEN_LIVE_E2E=1` to exercise the real
 * `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`
 * endpoint through the QwenMCOPAdapter. The output is the canonical
 * artefact referenced by `docs/integrations/qwen.md` for the "Captured
 * Merkle root" section.
 *
 * CI never runs this spec because `QWEN_LIVE_E2E` is unset there; it is
 * intended to be invoked manually:
 *
 *   QWEN_LIVE_E2E=1 pnpm test -- qwen.live.e2e
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import { defaultQwenClient, QwenMCOPAdapter } from '../adapters';

const liveEnabled =
  Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) &&
  process.env.QWEN_LIVE_E2E === '1';

const liveDescribe = liveEnabled ? describe : describe.skip;

liveDescribe('QwenMCOPAdapter (live DashScope)', () => {
  jest.setTimeout(120_000);

  it('produces a real Merkle root from a real Qwen completion', async () => {
    const adapter = new QwenMCOPAdapter({
      encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
      stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
      etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
      client: defaultQwenClient({ timeoutMs: 90_000 }),
    });

    const response = await adapter.generateOptimizedCompletion(
      'Outline a research agenda for verifiable, stigmergic multi-agent coordination.',
      { model: 'qwen3.5-flash', temperature: 0.4, maxTokens: 256 },
    );

    expect(response.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(response.result.content.length).toBeGreaterThan(0);

    // Stamp the artefact for docs/integrations/qwen.md.
    console.log(
      '\n=== QWEN LIVE ARTEFACT ===\n' +
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
