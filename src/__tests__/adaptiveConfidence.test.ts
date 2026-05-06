import { HolographicEtch } from '../core/holographicEtch';

describe('Adaptive Confidence Engine', () => {
  it('returns a breakdown with every factor clamped to [0, 1]', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0 });
    const result = etch.scoreConfidence([1, 0, 0, 0], [1, 0, 0, 0]);
    expect(result.alignment).toBeGreaterThanOrEqual(0);
    expect(result.alignment).toBeLessThanOrEqual(1);
    expect(result.magnitudeHealth).toBeGreaterThanOrEqual(0);
    expect(result.magnitudeHealth).toBeLessThanOrEqual(1);
    expect(result.staticFloorMargin).toBeGreaterThanOrEqual(0);
    expect(result.staticFloorMargin).toBeLessThanOrEqual(1);
    expect(result.recencyStability).toBeGreaterThanOrEqual(0);
    expect(result.recencyStability).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('marks aligned high-confidence inputs as accepted', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0.1 });
    const result = etch.scoreConfidence([1, 1, 1, 1], [1, 1, 1, 1]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBeGreaterThan(0.3);
  });

  it('rejects orthogonal submissions when the static floor blocks them', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0.8 });
    const result = etch.scoreConfidence([1, 0, 0, 0], [0, 0, 0, 1]);
    expect(result.accepted).toBe(false);
  });
});

describe('Etch Memory Guardian', () => {
  it('bounds committed etches and exposes memory stats', () => {
    const etch = new HolographicEtch({
      confidenceFloor: 0,
      auditLog: true,
      maxEtches: 4,
    });
    for (let i = 0; i < 10; i++) {
      etch.applyEtch([1, 0.5, 0.25, 0.125], [1, 0.5, 0.25, 0.125], `n${i}`);
    }
    const stats = etch.getMemoryStats();
    expect(stats.size).toBeLessThanOrEqual(4);
    expect(stats.capacity).toBe(4);
    expect(stats.lifetimePushes).toBe(10);
    expect(stats.utilizationPct).toBeGreaterThan(0);
  });

  it('incorporates recent committed deltas into recency stability', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0, maxEtches: 16 });
    for (let i = 0; i < 5; i++) {
      etch.applyEtch([1, 0, 0, 0], [1, 0, 0, 0], `warmup-${i}`);
    }
    const result = etch.scoreConfidence([1, 1, 1, 1], [1, 1, 1, 1]);
    expect(result.recencyStability).toBeGreaterThan(0);
    expect(result.recencyStability).toBeLessThanOrEqual(1);
  });

  it('scoreConfidence handles the cold-start case with no prior etches', () => {
    const etch = new HolographicEtch();
    const breakdown = etch.scoreConfidence([0, 0, 0, 0], [0, 0, 0, 0]);
    expect(breakdown.alignment).toBe(0);
    expect(breakdown.magnitudeHealth).toBe(0);
    expect(breakdown.recencyStability).toBe(1);
  });

  it('retains skipped submissions on a dedicated audit ring', () => {
    const etch = new HolographicEtch({
      confidenceFloor: 0.9,
      auditLog: true,
      maxEtches: 8,
    });
    etch.applyEtch([0.01, 0.01, 0.01, 0.01], [0.01, 0.01, 0.01, 0.01], 'too-low');
    expect(etch.recent()).toHaveLength(0);
    const audit = etch.recentAudit(10);
    expect(audit).toHaveLength(1);
    expect(audit[0].hash).toBe('');
    expect(audit[0].note).toBe('skipped-low-confidence');
  });
});

describe('EudaimonicEtch', () => {
  it('adds flourishing metadata to accepted etches without changing hash semantics', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0, flourishingAmplifier: 0.5 });
    const record = etch.applyEtch([1, 1, 1, 1], [1, 1, 1, 1], 'flourish');
    expect(record.hash).toBeTruthy();
    expect(record.flourishingScore).toBeGreaterThan(0.9);
    expect(record.propagationHint).toBe('radiate');
  });

  it('scores eudaimonic summaries deterministically in the safe range', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0 });
    const summary = etch.scoreEudaimonicEtch([1, 0], [1, 0]);
    expect(summary.flourishingScore).toBeGreaterThan(0);
    expect(summary.flourishingScore).toBeLessThanOrEqual(1);
    expect(summary.positiveResonance).toBeCloseTo(1);
  });
});
