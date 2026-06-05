// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  VELOCITY_AUDITOR_VERSION,
  aiVelocityMultiplier,
  auditVelocity,
  deterministicRunId,
  humanBaselineEstimate,
  isProductiveVelocity,
  observedCostEstimate,
  type VelocitySessionFacts,
  type VelocityWorkItem,
} from '@/audit/velocityAuditor';

const FIXED_NOW = () => new Date('2026-06-05T00:00:00.000Z');

const SAMPLE_WORK: VelocityWorkItem[] = [
  { label: 'Merkle provenance kernel', humanBaselineHours: 120, observedHours: 9, landed: true },
  { label: 'Drift Sentinel wiring', humanBaselineHours: 40, observedHours: 4, landed: true },
  { label: 'Velocity auditor documentation', humanBaselineHours: 16, observedHours: 2, landed: true },
];

const SAMPLE_FACTS: VelocitySessionFacts = {
  sessionId: 'velocity-auditor-test',
  tenant: 'test-tenant',
  merged: true,
  guardianVerdict: 'PASS',
  aiAssisted: true,
  commitHash: 'c8f058031bf98bd0a218938adf6e9321dd297b47',
  thermoFreeEnergyDelta: 0.42,
};

describe('aiVelocityMultiplier', () => {
  it('is the human-to-observed ratio when AI-assisted', () => {
    expect(aiVelocityMultiplier(120, 10)).toBe(12);
    expect(aiVelocityMultiplier(40, 4)).toBe(10);
  });

  it('pins to ×1 when not AI-assisted', () => {
    expect(aiVelocityMultiplier(120, 10, false)).toBe(1);
  });

  it('never fabricates acceleration from degenerate inputs', () => {
    expect(aiVelocityMultiplier(120, 0)).toBe(1);
    expect(aiVelocityMultiplier(0, 10)).toBe(1);
    expect(aiVelocityMultiplier(Number.NaN, 10)).toBe(1);
    expect(aiVelocityMultiplier(120, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('humanBaselineEstimate / observedCostEstimate', () => {
  it('sum landed work only', () => {
    expect(humanBaselineEstimate(SAMPLE_WORK)).toBe(176);
    expect(observedCostEstimate(SAMPLE_WORK)).toBe(15);
  });

  it('exclude unlanded work and floor negatives', () => {
    const work: VelocityWorkItem[] = [
      { label: 'shipped', humanBaselineHours: 30, observedHours: 3, landed: true },
      { label: 'abandoned', humanBaselineHours: 50, observedHours: 5, landed: false },
      { label: 'bogus', humanBaselineHours: -2, observedHours: -1, landed: true },
    ];
    expect(humanBaselineEstimate(work)).toBe(30);
    expect(observedCostEstimate(work)).toBe(3);
  });
});

describe('deterministicRunId', () => {
  it('derives an RFC-9562 version-8-shaped UUID from the Merkle root', () => {
    const id = deterministicRunId('a'.repeat(64));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is a pure function of the Merkle root', () => {
    expect(deterministicRunId('deadbeef'.repeat(8))).toBe(deterministicRunId('deadbeef'.repeat(8)));
  });
});

describe('isProductiveVelocity', () => {
  it('requires merge, guardian PASS, landed work, resonance ≥ floor, and sub-critical drift', () => {
    expect(
      isProductiveVelocity({ merged: true, guardianVerdict: 'PASS' }, 0.9, true, 'nominal'),
    ).toBe(true);
  });

  it('rejects unmerged, failed-guardian, no-work, low-resonance, or critical-drift cycles', () => {
    expect(isProductiveVelocity({ merged: false, guardianVerdict: 'PASS' }, 0.9, true, 'nominal')).toBe(false);
    expect(isProductiveVelocity({ merged: true, guardianVerdict: 'FAIL' }, 0.9, true, 'nominal')).toBe(false);
    expect(isProductiveVelocity({ merged: true, guardianVerdict: 'PASS' }, 0.9, false, 'nominal')).toBe(false);
    expect(isProductiveVelocity({ merged: true, guardianVerdict: 'PASS' }, 0.1, true, 'nominal')).toBe(false);
    expect(isProductiveVelocity({ merged: true, guardianVerdict: 'PASS' }, 0.9, true, 'critical')).toBe(false);
  });
});

describe('auditVelocity', () => {
  it('returns a fully provenanced velocity report for a productive cycle', () => {
    const report = auditVelocity(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW });
    expect(report).not.toBeNull();
    const r = report!;

    expect(r.velocityAuditorVersion).toBe(VELOCITY_AUDITOR_VERSION);
    expect(r.productive).toBe(true);
    expect(r.merged).toBe(true);
    expect(r.guardianVerdict).toBe('PASS');

    // Velocity aggregates are the declared/measured sums over landed work.
    expect(r.humanBaselineHours).toBe(176);
    expect(r.observedHours).toBe(15);
    expect(r.aiMultiplier).toBeCloseTo(176 / 15, 4);
    expect(r.aiMultiplier).toBeGreaterThan(1);
    expect(r.hoursSaved).toBe(161);

    // Eudaimonic delta = kernel-derived positive-impact score × multiplier.
    expect(r.positiveImpactScore).toBeGreaterThan(0);
    expect(r.positiveImpactScore).toBeLessThanOrEqual(1);
    expect(r.eudaimonicDelta).toBeCloseTo(r.positiveImpactScore * r.aiMultiplier, 4);

    // ThermoTruth constraint: the divergence is sub-critical for an aligned cycle.
    expect(r.freeEnergyDivergence).toBeGreaterThanOrEqual(0);
    expect(r.freeEnergyDivergence).toBeLessThanOrEqual(1);
    expect(r.driftSeverity).not.toBe('critical');

    // Thermo is recorded as evidence, not folded into the velocity math.
    expect(r.thermoFreeEnergyDelta).toBe(0.42);

    // Real hashes + a deterministic runId derived from the Merkle root.
    expect(r.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(r.growthMerkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(r.runId).toBe(deterministicRunId(r.merkleRoot));
    expect(r.commitHash).toBe(SAMPLE_FACTS.commitHash);

    // Every landed item carries an accepted etch + growth event + item multiplier.
    const landed = r.workItems.filter((w) => w.landed);
    expect(landed.length).toBe(3);
    for (const item of landed) {
      expect(item.etchAccepted).toBe(true);
      expect(item.etchHash).toMatch(/^[0-9a-f]{64}$/);
      expect(item.growthEventHash).toMatch(/^[0-9a-f]{64}$/);
      expect(item.itemMultiplier).toBeGreaterThan(1);
    }
  });

  it('pins the multiplier to ×1 when the cycle is not AI-assisted', () => {
    const report = auditVelocity(SAMPLE_WORK, { ...SAMPLE_FACTS, aiAssisted: false }, { now: FIXED_NOW });
    expect(report).not.toBeNull();
    expect(report!.aiMultiplier).toBe(1);
    expect(report!.eudaimonicDelta).toBeCloseTo(report!.positiveImpactScore, 4);
  });

  it('returns null when the cycle did not merge', () => {
    expect(auditVelocity(SAMPLE_WORK, { ...SAMPLE_FACTS, merged: false }, { now: FIXED_NOW })).toBeNull();
  });

  it('returns null when the guardian failed', () => {
    expect(
      auditVelocity(SAMPLE_WORK, { ...SAMPLE_FACTS, guardianVerdict: 'FAIL' }, { now: FIXED_NOW }),
    ).toBeNull();
  });

  it('returns null when there is no landed work', () => {
    const unlanded = SAMPLE_WORK.map((w) => ({ ...w, landed: false }));
    expect(auditVelocity(unlanded, SAMPLE_FACTS, { now: FIXED_NOW })).toBeNull();
  });

  it('returns null when the resonance floor is unreachable', () => {
    expect(auditVelocity(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW, resonanceFloor: 1.01 })).toBeNull();
  });

  it('omits the thermo delta cleanly when not supplied', () => {
    const { thermoFreeEnergyDelta: _omit, ...factsNoThermo } = SAMPLE_FACTS;
    const report = auditVelocity(SAMPLE_WORK, factsNoThermo, { now: FIXED_NOW });
    expect(report?.thermoFreeEnergyDelta).toBeNull();
  });

  it('is deterministic across runs (hashes, runId, and values are replayable)', () => {
    const a = auditVelocity(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW })!;
    const b = auditVelocity(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW })!;

    expect(b.merkleRoot).toBe(a.merkleRoot);
    expect(b.runId).toBe(a.runId);
    expect(b.growthMerkleRoot).toBe(a.growthMerkleRoot);
    expect(b.aiMultiplier).toBe(a.aiMultiplier);
    expect(b.eudaimonicDelta).toBe(a.eudaimonicDelta);
    expect(b.freeEnergyDivergence).toBe(a.freeEnergyDivergence);
    expect(b.workItems.map((w) => w.etchHash)).toEqual(a.workItems.map((w) => w.etchHash));
    expect(b.workItems.map((w) => w.growthEventHash)).toEqual(
      a.workItems.map((w) => w.growthEventHash),
    );
  });

  it('does not let the timestamp influence the provenance hash or runId', () => {
    const a = auditVelocity(SAMPLE_WORK, SAMPLE_FACTS, { now: () => new Date('2026-01-01T00:00:00.000Z') })!;
    const b = auditVelocity(SAMPLE_WORK, SAMPLE_FACTS, { now: () => new Date('2030-12-31T23:59:59.000Z') })!;
    expect(a.merkleRoot).toBe(b.merkleRoot);
    expect(a.runId).toBe(b.runId);
    expect(a.timestamp).not.toBe(b.timestamp);
  });
});
