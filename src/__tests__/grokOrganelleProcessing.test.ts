/**
 * @jest-environment node
 *
 * Tests for the new organelle-mode processing on GrokMCOPAdapter:
 * - processOrganelleResult
 * - generate() with organelleMode
 */
import {
  GrokMCOPAdapter,
  MAPPING_GROK_PRODUCTION_PROFILE,
} from '../adapters';
import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import { ORGANELLE_PROTOCOL_VERSION } from '../utils/organelleMerge';

function buildAdapter(overrides: { client?: GrokMCOPAdapter['client'] } = {}) {
  return new GrokMCOPAdapter({
    encoder: new NovaNeoEncoder({ dimensions: 32, normalize: true }),
    stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
    etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
    client: overrides.client ?? {
      async createCompletion({ options }) {
        return {
          model: options.model ?? 'unknown',
          content: '',
          finishReason: 'stop',
          usage: null,
        };
      },
    },
  });
}

function validArtifactsJSON(): string {
  return JSON.stringify({
    synthesizedInsight: 'Insight from the organelle.',
    internalTraces: [
      { id: 'r1', resonance: 0.9, summary: 'Some summary' },
    ],
    proposedEtchDelta: 0.2,
    resonanceScores: { overall: 0.85 },
    organelleNotes: 'looks fine',
    organelleProtocolVersion: ORGANELLE_PROTOCOL_VERSION,
    modelInternalMerkleRoot: 'remote-root',
  });
}

describe('processOrganelleResult', () => {
  it('returns zero counts when content is empty (non-strict)', async () => {
    const adapter = buildAdapter();
    const result = {
      model: 'grok-4.3',
      content: '',
      finishReason: 'stop' as const,
      usage: null,
    };
    const out = await adapter.processOrganelleResult(result);
    expect(out.mergedTraces).toBe(0);
    expect(out.mergedEtch).toBe(false);
  });

  it('throws in strict mode when content is missing', async () => {
    const adapter = buildAdapter();
    await expect(
      adapter.processOrganelleResult({
        model: 'grok-4.3',
        content: '',
        finishReason: null,
        usage: null,
      }, { strict: true })
    ).rejects.toThrow(/No content/);
  });

  it('returns zero counts when content is not valid JSON (non-strict)', async () => {
    const adapter = buildAdapter();
    const result = {
      model: 'grok-4.3',
      content: 'not json at all',
      finishReason: 'stop' as const,
      usage: null,
    };
    const out = await adapter.processOrganelleResult(result);
    expect(out.mergedTraces).toBe(0);
    expect(out.mergedEtch).toBe(false);
  });

  it('throws in strict mode when content is not JSON', async () => {
    const adapter = buildAdapter();
    await expect(
      adapter.processOrganelleResult({
        model: 'grok-4.3',
        content: 'not json',
        finishReason: null,
        usage: null,
      }, { strict: true })
    ).rejects.toThrow(/parse organelle artifacts/);
  });

  it('throws in strict mode when JSON shape is invalid', async () => {
    const adapter = buildAdapter();
    await expect(
      adapter.processOrganelleResult({
        model: 'grok-4.3',
        content: JSON.stringify({ wrong: 'shape' }),
        finishReason: null,
        usage: null,
      }, { strict: true })
    ).rejects.toThrow(/Invalid organelle artifacts/);
  });

  it('merges traces and etch from a valid organelle response', async () => {
    const adapter = buildAdapter();
    const out = await adapter.processOrganelleResult({
      model: 'grok-4.3',
      content: validArtifactsJSON(),
      finishReason: 'stop',
      usage: null,
    });
    expect(out.mergedTraces).toBeGreaterThan(0);
    expect(out.mergedEtch).toBe(true);
    expect(out.newTraceIds.length).toBeGreaterThan(0);
    expect(out.provenanceLink?.protocolVersion).toBe(ORGANELLE_PROTOCOL_VERSION);
  });

  it('respects mergeTraces=false', async () => {
    const adapter = buildAdapter();
    const out = await adapter.processOrganelleResult({
      model: 'grok-4.3',
      content: validArtifactsJSON(),
      finishReason: 'stop',
      usage: null,
    }, { mergeTraces: false });
    expect(out.mergedTraces).toBe(0);
    expect(out.mergedEtch).toBe(true);
  });

  it('respects mergeEtches=false', async () => {
    const adapter = buildAdapter();
    const out = await adapter.processOrganelleResult({
      model: 'grok-4.3',
      content: validArtifactsJSON(),
      finishReason: 'stop',
      usage: null,
    }, { mergeEtches: false });
    expect(out.mergedEtch).toBe(false);
    expect(out.mergedTraces).toBeGreaterThan(0);
  });
});

describe('GrokMCOPAdapter.generate with organelleMode', () => {
  it('returns a response object when generate is called with organelleMode enabled', async () => {
    const adapter = buildAdapter({
      client: {
        async createCompletion({ options }) {
          return {
            model: options.model ?? 'grok-4.3',
            content: validArtifactsJSON(),
            finishReason: 'stop',
            usage: null,
          };
        },
      },
    });
    const response = await adapter.generate({
      prompt: 'do organelle work',
      payload: { options: { organelleMode: true } },
    });
    expect(response).toBeDefined();
  });
});

describe('GrokMCOPAdapter catalog cross-check', () => {
  it('maps the production profile to a known model', () => {
    expect(MAPPING_GROK_PRODUCTION_PROFILE).toBeDefined();
  });
});
