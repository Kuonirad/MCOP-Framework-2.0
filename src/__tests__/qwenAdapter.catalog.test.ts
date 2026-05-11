/**
 * @jest-environment node
 *
 * Catalog regression test for `QwenMCOPAdapter`.
 *
 * Locks the model catalog (`QWEN_MODEL_MAPPINGS`), the production-profile
 * defaults (`MAPPING_QWEN_PRODUCTION_PROFILE`), and `getCapabilities()`
 * against drift. Exists so that if Alibaba DashScope deprecates one of
 * the listed model IDs, this spec fails loudly and the catalog must be
 * refreshed in lock-step with the live API.
 *
 * Mirrors the equivalent spec for the Grok adapter
 * (`grokAdapter.catalog.test.ts`) to guarantee 1:1 parity coverage.
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import {
  QWEN_MODEL_MAPPINGS,
  QwenMCOPAdapter,
  MAPPING_QWEN_PRODUCTION_PROFILE,
} from '../adapters';

// Historical / community-only Qwen model IDs that have been removed
// from the DashScope OpenAI-compatible chat-completions surface and
// should NOT reappear in the production catalog.
const RETIRED_MODEL_IDS = [
  'qwen-72b-chat',
  'qwen1.5-72b-chat',
  'qwen2-72b-instruct',
] as const;

function buildAdapter() {
  return new QwenMCOPAdapter({
    encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
    stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
    etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
    client: {
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

describe('QwenMCOPAdapter catalog', () => {
  const catalogIds = Object.keys(QWEN_MODEL_MAPPINGS);

  it('catalog is non-empty', () => {
    expect(catalogIds.length).toBeGreaterThan(0);
  });

  it('every mapping key matches its `model` field', () => {
    for (const [key, mapping] of Object.entries(QWEN_MODEL_MAPPINGS)) {
      expect(mapping.model).toBe(key);
    }
  });

  it('every mapping declares a sane default temperature', () => {
    for (const mapping of Object.values(QWEN_MODEL_MAPPINGS)) {
      expect(Number.isFinite(mapping.defaultTemperature)).toBe(true);
      expect(mapping.defaultTemperature).toBeGreaterThanOrEqual(0);
      expect(mapping.defaultTemperature).toBeLessThanOrEqual(2);
    }
  });

  it('every mapping declares a positive context window', () => {
    for (const mapping of Object.values(QWEN_MODEL_MAPPINGS)) {
      expect(Number.isInteger(mapping.contextWindow)).toBe(true);
      expect(mapping.contextWindow).toBeGreaterThan(0);
    }
  });

  it('production profile defaultModel is in the catalog', () => {
    expect(catalogIds).toContain(MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel);
  });

  it('production profile fallbackModel is in the catalog', () => {
    expect(catalogIds).toContain(MAPPING_QWEN_PRODUCTION_PROFILE.fallbackModel);
  });

  it('production profile defaultModel and fallbackModel are distinct', () => {
    expect(MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel).not.toBe(
      MAPPING_QWEN_PRODUCTION_PROFILE.fallbackModel,
    );
  });

  it('does not advertise any retired model IDs', () => {
    for (const retired of RETIRED_MODEL_IDS) {
      expect(catalogIds).not.toContain(retired);
    }
  });

  it('getCapabilities() advertises exactly the catalog model IDs', async () => {
    const caps = await buildAdapter().getCapabilities();
    expect(caps.platform).toBe('alibaba-qwen');
    expect([...caps.models].sort()).toEqual([...catalogIds].sort());
    for (const retired of RETIRED_MODEL_IDS) {
      expect(caps.models).not.toContain(retired);
    }
  });

  describe('Qwen3 catalog expansion (preview / vision / omni / long-context tiers)', () => {
    const expansionTiers: ReadonlyArray<{
      readonly model: string;
      readonly tier: string;
      readonly minContextWindow: number;
    }> = [
      { model: 'qwen3-max-preview', tier: 'preview', minContextWindow: 262_144 },
      { model: 'qwen3-vl-plus', tier: 'vision', minContextWindow: 260_000 },
      { model: 'qwen3-omni-flash', tier: 'omni', minContextWindow: 256_000 },
      { model: 'qwen-long', tier: 'long-context', minContextWindow: 10_000_000 },
    ];

    it.each(expansionTiers)(
      'includes $model at tier $tier with at least $minContextWindow tokens of context',
      ({ model, tier, minContextWindow }) => {
        const mapping = QWEN_MODEL_MAPPINGS[model];
        expect(mapping).toBeDefined();
        expect(mapping.tier).toBe(tier);
        expect(mapping.contextWindow).toBeGreaterThanOrEqual(minContextWindow);
        expect(mapping.useCases.length).toBeGreaterThan(0);
      },
    );

    it('every tier id used in the catalog is in the expected union', () => {
      const allowedTiers = new Set([
        'flagship',
        'fast',
        'balanced',
        'coder',
        'legacy',
        'preview',
        'vision',
        'omni',
        'long-context',
      ]);
      for (const mapping of Object.values(QWEN_MODEL_MAPPINGS)) {
        expect(allowedTiers).toContain(mapping.tier);
      }
    });
  });
});
