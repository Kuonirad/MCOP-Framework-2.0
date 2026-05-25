// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  appendMeasurementLoopToReport,
  buildPositiveLoopSnapshot,
  renderPositiveLedger,
  renderShieldsEndpoints,
} from '@/audit/positiveMeasurementLoop';

const audit = {
  positiveImpactScore: 91,
  metrics: {
    contributorJoy: 0.82,
    adoptionVelocity: 0.74,
    beneficialOutcomeAmplification: 0.69,
    growthEvents: 4,
    merkleRoot: 'a'.repeat(64),
  },
  citations: [
    {
      kernel: 'PositiveResonanceAmplifier',
      signal: 'growth-ledger-root',
      hash: 'a'.repeat(64),
      backs: 'positive impact metrics',
    },
  ],
};

describe('positive measurement loop', () => {
  it('builds a commit-cited snapshot for the four positive-impact metrics', () => {
    const snapshot = buildPositiveLoopSnapshot({
      capturedAt: '2026-05-25T00:00:00.000Z',
      commitHash: '1234567890abcdef1234567890abcdef12345678',
      score: 91,
      audit,
    });

    expect(snapshot.commitHash).toBe('1234567890abcdef1234567890abcdef12345678');
    expect(snapshot.metrics.map((metric) => metric.id)).toEqual([
      'positive-impact-score',
      'contributor-joy',
      'adoption-velocity',
      'beneficial-outcome-amplification',
    ]);
    expect(snapshot.metrics[0].signal).toBe('91%');
    expect(snapshot.metrics[1].signal).toBe('0.820');
    expect(snapshot.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('appends report deltas and a holographic-etch ledger entry with snapshot evidence', () => {
    const first = buildPositiveLoopSnapshot({
      capturedAt: '2026-05-25T00:00:00.000Z',
      commitHash: '1234567890abcdef1234567890abcdef12345678',
      score: 91,
      audit,
    });
    const second = buildPositiveLoopSnapshot({
      capturedAt: '2026-05-25T01:00:00.000Z',
      commitHash: 'abcdef1234567890abcdef1234567890abcdef12',
      score: 94,
      audit: {
        ...audit,
        positiveImpactScore: 94,
        metrics: { ...audit.metrics, contributorJoy: 0.87 },
      },
    });

    const report = appendMeasurementLoopToReport('# Positive Impact Report\n', second, first);
    const ledger = renderPositiveLedger('', first);
    const appendedLedger = renderPositiveLedger(ledger, second);

    expect(report).toContain('## Measurement Loop Deltas');
    expect(report).toContain('Commit: `abcdef1234567890abcdef1234567890abcdef12`');
    expect(report).toContain('| Positive impact score | 94% | +3% |');
    expect(appendedLedger).toContain('# Positive Resonance Ledger');
    expect(appendedLedger).toContain('holographic-etch positive-resonance ledger');
    expect(appendedLedger).toContain('commit-hash: `abcdef1234567890abcdef1234567890abcdef12`');
    expect(appendedLedger.match(/mcop-positive-snapshot/g)).toHaveLength(2);
  });

  it('renders shields.io endpoint payloads for each positive metric', () => {
    const snapshot = buildPositiveLoopSnapshot({
      capturedAt: '2026-05-25T00:00:00.000Z',
      commitHash: '1234567890abcdef1234567890abcdef12345678',
      score: 91,
      audit,
    });

    const badges = renderShieldsEndpoints(snapshot);

    expect(Object.keys(badges).sort()).toEqual([
      'positive-adoption-velocity.json',
      'positive-beneficial-outcome-amplification.json',
      'positive-contributor-joy.json',
      'positive-impact-score.json',
    ]);
    for (const badge of Object.values(badges)) {
      expect(badge.schemaVersion).toBe(1);
      expect(typeof badge.label).toBe('string');
      expect(typeof badge.message).toBe('string');
      expect(typeof badge.color).toBe('string');
      expect(badge.cacheSeconds).toBe(300);
    }
  });
});
