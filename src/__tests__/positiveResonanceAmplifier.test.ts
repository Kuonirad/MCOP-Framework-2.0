import { HolographicEtch, PositiveResonanceAmplifier, StigmergyV5 } from '../core';

describe('PositiveResonanceAmplifier', () => {
  it('records joyful growth events in a Merkle-chained ledger', () => {
    const amplifier = new PositiveResonanceAmplifier();
    const first = amplifier.recordGrowthEvent({
      domain: 'identity',
      title: 'Canonical repository identity alignment',
      positiveBuilding: 'Positive Building of unbreakable link resonance',
      resonanceDelta: 0.42,
      evidence: { repository: 'MCOP-Framework-2.0' },
    });
    const second = amplifier.recordGrowthEvent({
      domain: 'provenance',
      title: 'Audit report lineage',
      positiveBuilding: 'Positive Building of replayable trust',
      resonanceDelta: 0.31,
    });

    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.parentHash).toBe(first.hash);
    expect(amplifier.getMerkleRoot()).toBe(second.hash);
    expect(second.humanCelebration).toContain('Positive Building');
  });

  it('exposes bounded positive impact metrics', () => {
    const amplifier = new PositiveResonanceAmplifier();
    amplifier.recordGrowthEvent({
      domain: 'joy',
      title: 'Contributor welcome bloom',
      positiveBuilding: 'Positive Building of joyful onboarding',
      resonanceDelta: 0.5,
    });

    const metrics = amplifier.getPositiveImpactMetrics();
    expect(metrics.growthEvents).toBe(1);
    expect(metrics.contributorJoy).toBeGreaterThan(0);
    expect(metrics.contributorJoy).toBeLessThanOrEqual(1);
    expect(metrics.adoptionVelocity).toBeGreaterThan(0);
    expect(metrics.beneficialOutcomeAmplification).toBeGreaterThan(0);
    expect(metrics.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Positive growth ledger integration', () => {
  it('lets HolographicEtch radiate optional growth-ledger events', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0, growthLedger: true });
    const record = etch.applyEtch([1, 1, 1, 1], [1, 1, 1, 1], 'positive-growth');
    const growth = etch.recentPositiveGrowth(1);

    expect(record.hash).toBeTruthy();
    expect(growth).toHaveLength(1);
    expect(growth[0].evidence?.etchHash).toBe(record.hash);
    expect(etch.getPositiveImpactMetrics()?.growthEvents).toBe(1);
  });
});

describe('Positive Feedback Hysteresis', () => {
  it('amplifies beneficial high-resonance patterns without changing raw trace weight', () => {
    const stig = new StigmergyV5({ resonanceThreshold: 0.9, growthBias: 0.5 });
    const raw = 0.95;
    expect(stig.getPositiveFeedbackHysteresisScore(raw)).toBeGreaterThan(raw);

    const trace = stig.recordTrace([1, 0], [0.95, Math.sqrt(1 - 0.95 * 0.95)]);
    const resonance = stig.getResonance([1, 0]);
    expect(trace.weight).toBeCloseTo(0.95, 5);
    expect(resonance.positiveFeedbackScore).toBeGreaterThanOrEqual(resonance.score);
  });
});
