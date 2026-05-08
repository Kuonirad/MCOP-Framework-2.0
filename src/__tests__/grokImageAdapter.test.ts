/**
 * @jest-environment node
 *
 * Unit tests for GrokImageMCOPAdapter — exercises the MCOP triad
 * pipeline (encode → resonance → dialectical synth → etch) with an
 * in-memory `GrokImageClient` fixture. No network calls.
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import {
  GrokImageClient,
  GrokImageMCOPAdapter,
  GrokImageResult,
} from '../adapters';

function buildAdapter(client: GrokImageClient) {
  return new GrokImageMCOPAdapter({
    encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
    stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
    etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
    client,
  });
}

function fixtureClient(): {
  client: GrokImageClient;
  calls: Array<{ prompt: string; options: Record<string, unknown> }>;
} {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
  const client: GrokImageClient = {
    async generateImage({ prompt, options }) {
      calls.push({ prompt, options: { ...options } });
      const result: GrokImageResult = {
        model: options.model ?? 'grok-imagine-image',
        responseFormat: options.responseFormat ?? 'url',
        images: Array.from({ length: options.n ?? 1 }, (_, i) => ({
          url: `https://stub.invalid/img-${i}.jpg`,
          revisedPrompt: prompt,
        })),
        raw: { stub: true },
      };
      return result;
    },
  };
  return { client, calls };
}

describe('GrokImageMCOPAdapter', () => {
  it('reports xai-grok-images capabilities', async () => {
    const { client } = fixtureClient();
    const adapter = buildAdapter(client);
    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('xai-grok-images');
    expect(caps.models).toContain('grok-imagine-image-quality');
    expect(caps.supportsAudit).toBe(true);
  });

  it('routes the prompt through the MCOP triad and returns a Merkle root', async () => {
    const { client, calls } = fixtureClient();
    const adapter = buildAdapter(client);

    const response = await adapter.generateOptimizedImage(
      'a cat reading a book in a tree at sunset',
      { model: 'grok-imagine-image-quality', n: 2, aspectRatio: '16:9', resolution: '2k' },
    );

    expect(calls).toHaveLength(1);
    // Adapter must dispatch the dialectically-refined prompt, not the raw seed.
    expect(calls[0].prompt).toBe(response.provenance.refinedPrompt);
    expect(calls[0].options.model).toBe('grok-imagine-image-quality');
    expect(calls[0].options.n).toBe(2);
    expect(calls[0].options.aspectRatio).toBe('16:9');

    expect(response.result.images).toHaveLength(2);
    expect(response.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(response.provenance.etchHash).toBe(response.merkleRoot);
    expect(response.provenance.refinedPrompt.length).toBeGreaterThan(0);
  });

  it('clamps n to the [1, 10] range', async () => {
    const { client, calls } = fixtureClient();
    const adapter = buildAdapter(client);

    await adapter.generateOptimizedImage('prompt', { n: 99 });
    await adapter.generateOptimizedImage('prompt', { n: 0 });
    await adapter.generateOptimizedImage('prompt', { n: -3 });

    expect(calls.map((c) => c.options.n)).toEqual([10, 1, 1]);
  });

  it('honours human veto via the dialectical synthesizer', async () => {
    const { client } = fixtureClient();
    const adapter = buildAdapter(client);
    await expect(
      adapter.generateOptimizedImage('prompt', {}, { humanFeedback: { veto: true } }),
    ).rejects.toThrow();
  });
});
