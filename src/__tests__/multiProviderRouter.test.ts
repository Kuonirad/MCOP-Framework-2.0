/**
 * @jest-environment node
 *
 * Adversarial unit tests for the cross-provider Grok-vs-Qwen entropy
 * router (`chooseProviderAcrossGrokAndQwen`).
 *
 * Each test is designed so that a broken decision tree would produce a
 * visibly different value — every branch of the decision tree gets at
 * least one positive and one negative case.
 */

import {
  chooseProviderAcrossGrokAndQwen,
  GROK_MODEL_MAPPINGS,
  isCatalogedDecision,
  MAPPING_GROK_PRODUCTION_PROFILE,
  MAPPING_QWEN_PRODUCTION_PROFILE,
  MULTI_PROVIDER_MODEL_PICKS,
  QWEN_MODEL_MAPPINGS,
} from '../adapters';

describe('chooseProviderAcrossGrokAndQwen — early-exit branches', () => {
  it('returns local with high-resonance reason when resonance >= highResonanceCeiling', () => {
    const d = chooseProviderAcrossGrokAndQwen({ entropy: 0.9, resonance: 0.99 });
    expect(d).toEqual({ provider: 'local', reason: 'high-resonance-cache-hit' });
  });

  it('returns human-review when prompt is novel AND resonance is below lowResonanceFloor', () => {
    const d = chooseProviderAcrossGrokAndQwen({ entropy: 0.8, resonance: 0.05 });
    expect(d).toEqual({ provider: 'human-review', reason: 'novel-low-confidence' });
  });

  it('returns local when entropy is below noveltyEntropyFloor (familiar prompt)', () => {
    const d = chooseProviderAcrossGrokAndQwen({ entropy: 0.2, resonance: 0.5 });
    expect(d).toEqual({ provider: 'local', reason: 'familiar-prompt-served-locally' });
  });

  it('respects custom thresholds (high-resonance ceiling lifted)', () => {
    const d = chooseProviderAcrossGrokAndQwen(
      { entropy: 0.9, resonance: 0.75 },
      { highResonanceCeiling: 0.95 },
    );
    // Resonance 0.75 is no longer a cache hit; should dispatch.
    expect(d.provider).toBe('qwen');
  });
});

describe('chooseProviderAcrossGrokAndQwen — auto provider + cost preference', () => {
  const novelSignals = { entropy: 0.6, resonance: 0.4 };
  const veryNovelSignals = { entropy: 0.85, resonance: 0.4 };

  it('cost preference picks Qwen flash tier regardless of entropy band', () => {
    const dLow = chooseProviderAcrossGrokAndQwen(novelSignals, { costPreference: 'cost' });
    const dHigh = chooseProviderAcrossGrokAndQwen(veryNovelSignals, { costPreference: 'cost' });
    expect(dLow).toEqual({
      provider: 'qwen',
      model: MULTI_PROVIDER_MODEL_PICKS.qwen.cost,
      reason: 'auto-cost-cheapest-qwen-tier',
    });
    expect(dHigh.provider).toBe('qwen');
    if (dHigh.provider === 'qwen') {
      expect(dHigh.model).toBe(MULTI_PROVIDER_MODEL_PICKS.qwen.cost);
    }
  });

  it('balanced preference defaults to Qwen and promotes past highEntropyBand', () => {
    const dMed = chooseProviderAcrossGrokAndQwen(novelSignals);
    const dHigh = chooseProviderAcrossGrokAndQwen(veryNovelSignals);
    expect(dMed).toEqual({
      provider: 'qwen',
      model: MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel,
      reason: 'auto-balanced-qwen-default-tier',
    });
    expect(dHigh).toEqual({
      provider: 'qwen',
      model: MULTI_PROVIDER_MODEL_PICKS.qwen.balancedHigh,
      reason: 'auto-balanced-high-entropy-qwen-tier-promoted',
    });
  });

  it('quality preference at very-high entropy escalates to Grok reasoning flagship for cross-verification', () => {
    const d = chooseProviderAcrossGrokAndQwen(veryNovelSignals, { costPreference: 'quality' });
    expect(d).toEqual({
      provider: 'grok',
      model: MULTI_PROVIDER_MODEL_PICKS.grok.qualityVeryHigh,
      reason: 'auto-quality-very-high-entropy-grok-reasoning-tier',
    });
  });

  it('quality preference at medium entropy stays on Qwen flagship (Qwen3-Max)', () => {
    const d = chooseProviderAcrossGrokAndQwen(novelSignals, { costPreference: 'quality' });
    expect(d).toEqual({
      provider: 'qwen',
      model: MULTI_PROVIDER_MODEL_PICKS.qwen.quality,
      reason: 'auto-quality-qwen-flagship-tier',
    });
  });

  it('balanced + entropy exactly at highEntropyBand is treated as high (>= comparison)', () => {
    const d = chooseProviderAcrossGrokAndQwen({ entropy: 0.75, resonance: 0.4 });
    expect(d.provider).toBe('qwen');
    if (d.provider === 'qwen') {
      expect(d.model).toBe(MULTI_PROVIDER_MODEL_PICKS.qwen.balancedHigh);
    }
  });

  it('balanced + entropy just below highEntropyBand keeps the default tier', () => {
    const d = chooseProviderAcrossGrokAndQwen({ entropy: 0.74, resonance: 0.4 });
    expect(d.provider).toBe('qwen');
    if (d.provider === 'qwen') {
      expect(d.model).toBe(MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel);
    }
  });
});

describe('chooseProviderAcrossGrokAndQwen — preferredProvider override', () => {
  const signals = { entropy: 0.6, resonance: 0.4 };

  it('preferredProvider=grok routes to Grok with its default-tier model', () => {
    const d = chooseProviderAcrossGrokAndQwen(signals, { preferredProvider: 'grok' });
    expect(d).toEqual({
      provider: 'grok',
      model: MAPPING_GROK_PRODUCTION_PROFILE.defaultModel,
      reason: 'preferred-grok-honoured',
    });
  });

  it('preferredProvider=qwen routes to Qwen even when costPreference would auto-pick Grok', () => {
    const d = chooseProviderAcrossGrokAndQwen(
      { entropy: 0.85, resonance: 0.4 },
      { preferredProvider: 'qwen', costPreference: 'quality' },
    );
    expect(d.provider).toBe('qwen');
    if (d.provider === 'qwen') {
      expect(d.model).toBe(MULTI_PROVIDER_MODEL_PICKS.qwen.qualityVeryHigh);
    }
  });

  it('preferredProvider + preferredModel forwards the model verbatim', () => {
    const d = chooseProviderAcrossGrokAndQwen(signals, {
      preferredProvider: 'qwen',
      preferredModel: 'qwen3-vl-plus',
    });
    expect(d).toEqual({
      provider: 'qwen',
      model: 'qwen3-vl-plus',
      reason: 'preferred-qwen-honoured',
    });
  });

  it('preferredModel is ignored when no preferredProvider is set (auto path picks catalog default)', () => {
    const d = chooseProviderAcrossGrokAndQwen(signals, {
      preferredModel: 'qwen3-vl-plus',
    });
    expect(d.provider).toBe('qwen');
    if (d.provider === 'qwen') {
      expect(d.model).toBe(MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel);
    }
  });
});

describe('chooseProviderAcrossGrokAndQwen — failover on unavailableProviders', () => {
  const signals = { entropy: 0.6, resonance: 0.4 };

  it('failover from preferred Qwen to Grok when Qwen is unavailable', () => {
    const d = chooseProviderAcrossGrokAndQwen(signals, {
      preferredProvider: 'qwen',
      unavailableProviders: ['qwen'],
    });
    expect(d.provider).toBe('grok');
    if (d.provider === 'grok') {
      expect(d.model).toBe(MAPPING_GROK_PRODUCTION_PROFILE.defaultModel);
      expect(d.reason).toBe('preferred-qwen-unavailable-failover-grok');
    }
  });

  it('failover from preferred Grok to Qwen when Grok is unavailable', () => {
    const d = chooseProviderAcrossGrokAndQwen(signals, {
      preferredProvider: 'grok',
      unavailableProviders: ['grok'],
    });
    expect(d.provider).toBe('qwen');
    if (d.provider === 'qwen') {
      expect(d.model).toBe(MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel);
      expect(d.reason).toBe('preferred-grok-unavailable-failover-qwen');
    }
  });

  it('degrades to local when both providers are unavailable', () => {
    const d = chooseProviderAcrossGrokAndQwen(signals, {
      unavailableProviders: ['qwen', 'grok'],
    });
    expect(d).toEqual({ provider: 'local', reason: 'all-providers-unavailable' });
  });

  it('honours preferred when only the OTHER provider is unavailable', () => {
    const d = chooseProviderAcrossGrokAndQwen(signals, {
      preferredProvider: 'qwen',
      unavailableProviders: ['grok'],
    });
    expect(d.provider).toBe('qwen');
    if (d.provider === 'qwen') {
      // Failover context flag means reason notes the safety net.
      expect(d.reason).toBe('preferred-qwen-honoured-with-failover-context');
    }
  });
});

describe('chooseProviderAcrossGrokAndQwen — purity invariants', () => {
  it('is deterministic: same inputs → identical decisions', () => {
    const a = chooseProviderAcrossGrokAndQwen({ entropy: 0.6, resonance: 0.4 });
    const b = chooseProviderAcrossGrokAndQwen({ entropy: 0.6, resonance: 0.4 });
    expect(a).toEqual(b);
  });

  it('does not mutate the supplied config object', () => {
    const config = {
      preferredProvider: 'qwen' as const,
      unavailableProviders: ['grok'] as const,
    };
    const snapshot = JSON.stringify(config);
    chooseProviderAcrossGrokAndQwen({ entropy: 0.6, resonance: 0.4 }, config);
    expect(JSON.stringify(config)).toBe(snapshot);
  });
});

describe('isCatalogedDecision — production-catalog drift guard', () => {
  it('returns true for every default auto pick across cost preferences', () => {
    const signals = { entropy: 0.6, resonance: 0.4 };
    for (const costPreference of ['cost', 'balanced', 'quality'] as const) {
      const d = chooseProviderAcrossGrokAndQwen(signals, { costPreference });
      expect(isCatalogedDecision(d)).toBe(true);
    }
  });

  it('returns true for high-entropy auto pick (cross-provider escalation)', () => {
    const d = chooseProviderAcrossGrokAndQwen(
      { entropy: 0.9, resonance: 0.4 },
      { costPreference: 'quality' },
    );
    expect(isCatalogedDecision(d)).toBe(true);
  });

  it('returns false for an unknown preferredModel pinned via preferredProvider', () => {
    const d = chooseProviderAcrossGrokAndQwen(
      { entropy: 0.6, resonance: 0.4 },
      { preferredProvider: 'qwen', preferredModel: 'qwen-future-experimental-id' },
    );
    expect(isCatalogedDecision(d)).toBe(false);
  });

  it('treats local and human-review decisions as cataloged (no model id to check)', () => {
    expect(
      isCatalogedDecision({ provider: 'local', reason: 'r' }),
    ).toBe(true);
    expect(
      isCatalogedDecision({ provider: 'human-review', reason: 'r' }),
    ).toBe(true);
  });
});

describe('MULTI_PROVIDER_MODEL_PICKS — catalog-bound model picks', () => {
  it('every Qwen pick is in QWEN_MODEL_MAPPINGS', () => {
    // Use array key form because some Qwen model ids contain `.`
    // (e.g. `qwen3.5-flash`) which Jest's toHaveProperty would
    // otherwise treat as a path separator.
    for (const model of Object.values(MULTI_PROVIDER_MODEL_PICKS.qwen)) {
      expect(QWEN_MODEL_MAPPINGS).toHaveProperty([model]);
    }
  });

  it('every Grok pick is in GROK_MODEL_MAPPINGS', () => {
    for (const model of Object.values(MULTI_PROVIDER_MODEL_PICKS.grok)) {
      expect(GROK_MODEL_MAPPINGS).toHaveProperty([model]);
    }
  });
});
