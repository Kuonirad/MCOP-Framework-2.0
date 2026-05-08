/**
 * @jest-environment node
 *
 * Catalog regression test for `GrokMCOPAdapter`.
 *
 * Locks the model catalog (`GROK_MODEL_MAPPINGS`), the production-profile
 * defaults (`MAPPING_GROK_PRODUCTION_PROFILE`), and `getCapabilities()`
 * against drift.  Exists because the adapter previously shipped with a
 * `defaultModel = 'grok-4-mini'` that returned `400 Model not found`
 * from the live xAI endpoint after the early-2026 catalog refresh.
 *
 * If xAI deprecates one of the listed model IDs, this spec fails loudly
 * and the catalog must be refreshed in lock-step with the live API.
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import {
  GROK_MODEL_MAPPINGS,
  GrokMCOPAdapter,
  MAPPING_GROK_PRODUCTION_PROFILE,
} from '../adapters';

const RETIRED_MODEL_IDS = [
  'grok-4',
  'grok-4-fast',
  'grok-4-mini',
  'grok-3',
  'grok-3-fast',
  'grok-3-mini',
  'grok-3-mini-fast',
  'grok-2',
  'grok-beta',
] as const;

function buildAdapter() {
  return new GrokMCOPAdapter({
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

describe('GrokMCOPAdapter catalog', () => {
  const catalogIds = Object.keys(GROK_MODEL_MAPPINGS);

  it('catalog is non-empty', () => {
    expect(catalogIds.length).toBeGreaterThan(0);
  });

  it('every mapping key matches its `model` field', () => {
    for (const [key, mapping] of Object.entries(GROK_MODEL_MAPPINGS)) {
      expect(mapping.model).toBe(key);
    }
  });

  it('every mapping declares a sane default temperature', () => {
    for (const mapping of Object.values(GROK_MODEL_MAPPINGS)) {
      expect(Number.isFinite(mapping.defaultTemperature)).toBe(true);
      expect(mapping.defaultTemperature).toBeGreaterThanOrEqual(0);
      expect(mapping.defaultTemperature).toBeLessThanOrEqual(2);
    }
  });

  it('every mapping declares a positive context window', () => {
    for (const mapping of Object.values(GROK_MODEL_MAPPINGS)) {
      expect(Number.isInteger(mapping.contextWindow)).toBe(true);
      expect(mapping.contextWindow).toBeGreaterThan(0);
    }
  });

  it('production profile defaultModel is in the catalog', () => {
    expect(catalogIds).toContain(MAPPING_GROK_PRODUCTION_PROFILE.defaultModel);
  });

  it('production profile fallbackModel is in the catalog', () => {
    expect(catalogIds).toContain(MAPPING_GROK_PRODUCTION_PROFILE.fallbackModel);
  });

  it('production profile defaultModel and fallbackModel are distinct', () => {
    expect(MAPPING_GROK_PRODUCTION_PROFILE.defaultModel).not.toBe(
      MAPPING_GROK_PRODUCTION_PROFILE.fallbackModel,
    );
  });

  it('does not advertise any retired model IDs', () => {
    for (const retired of RETIRED_MODEL_IDS) {
      expect(catalogIds).not.toContain(retired);
    }
  });

  it('getCapabilities() advertises exactly the catalog model IDs', async () => {
    const caps = await buildAdapter().getCapabilities();
    expect(caps.platform).toBe('xai-grok');
    // Order does not matter, contents do.
    expect([...caps.models].sort()).toEqual([...catalogIds].sort());
    for (const retired of RETIRED_MODEL_IDS) {
      expect(caps.models).not.toContain(retired);
    }
  });
});
