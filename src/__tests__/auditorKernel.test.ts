// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  AUDITOR_KERNEL_VERSION,
  auditCycle,
  conservativeHumanPathEstimate,
  isProductive,
  resonanceMultiplier,
  type CycleFacts,
  type WorkItem,
} from '@/audit/auditorKernel';

const FIXED_NOW = () => new Date('2026-06-04T00:00:00.000Z');

const SAMPLE_WORK: WorkItem[] = [
  { label: 'Bidirectional fusion wiring', estimatedHumanHours: 8, landed: true },
  { label: 'Conductor auto-route', estimatedHumanHours: 4, landed: true },
  { label: 'Integration guide documentation', estimatedHumanHours: 2.7, landed: true },
];

const SAMPLE_FACTS: CycleFacts = {
  sessionId: 'auditor-kernel-test',
  tenant: 'test-tenant',
  merged: true,
  guardianVerdict: 'PASS',
  commitHash: 'c8f058031bf98bd0a218938adf6e9321dd297b47',
  thermoFreeEnergyDelta: 0.42,
};

describe('resonanceMultiplier', () => {
  it('is ×1.0 at or below the neutral resonance', () => {
    expect(resonanceMultiplier(0.5)).toBe(1);
    expect(resonanceMultiplier(0.2)).toBe(1);
    expect(resonanceMultiplier(0)).toBe(1);
  });

  it('rises monotonically with resonance', () => {
    expect(resonanceMultiplier(0.8)).toBeGreaterThan(resonanceMultiplier(0.6));
    expect(resonanceMultiplier(0.96)).toBeGreaterThan(resonanceMultiplier(0.8));
  });

  it('lands near ×1.18 around a 0.96 resonance with the default gain', () => {
    expect(resonanceMultiplier(0.96)).toBeCloseTo(1.184, 3);
  });

  it('clamps out-of-range resonance', () => {
    expect(resonanceMultiplier(2)).toBe(resonanceMultiplier(1));
    expect(resonanceMultiplier(-1)).toBe(1);
  });
});

describe('conservativeHumanPathEstimate', () => {
  it('sums landed work only', () => {
    expect(conservativeHumanPathEstimate(SAMPLE_WORK)).toBe(14.7);
  });

  it('excludes unlanded work and floors negatives', () => {
    expect(
      conservativeHumanPathEstimate([
        { label: 'shipped', estimatedHumanHours: 3, landed: true },
        { label: 'abandoned', estimatedHumanHours: 5, landed: false },
        { label: 'bogus', estimatedHumanHours: -2, landed: true },
      ]),
    ).toBe(3);
  });
});

describe('isProductive', () => {
  it('requires merge, guardian PASS, landed work, and resonance ≥ floor', () => {
    expect(isProductive({ merged: true, guardianVerdict: 'PASS' }, 0.95, true)).toBe(true);
  });

  it('rejects unmerged, failed-guardian, no-work, or low-resonance cycles', () => {
    expect(isProductive({ merged: false, guardianVerdict: 'PASS' }, 0.95, true)).toBe(false);
    expect(isProductive({ merged: true, guardianVerdict: 'FAIL' }, 0.95, true)).toBe(false);
    expect(isProductive({ merged: true, guardianVerdict: 'PASS' }, 0.95, false)).toBe(false);
    expect(isProductive({ merged: true, guardianVerdict: 'PASS' }, 0.5, true)).toBe(false);
  });
});

describe('auditCycle', () => {
  it('returns a fully provenanced report for a productive cycle', () => {
    const report = auditCycle(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW });
    expect(report).not.toBeNull();
    const r = report!;

    expect(r.auditorKernelVersion).toBe(AUDITOR_KERNEL_VERSION);
    expect(r.productive).toBe(true);
    expect(r.merged).toBe(true);
    expect(r.guardianVerdict).toBe('PASS');

    // Human-path is the declared estimate sum; adjusted is hours × multiplier.
    expect(r.productiveHours).toBe(14.7);
    expect(r.adjustedValue).toBeCloseTo(r.productiveHours * r.resonanceMultiplier, 2);
    expect(r.adjustedValue).toBeGreaterThan(r.productiveHours);

    // Resonance is kernel-derived and a valid probability.
    expect(r.resonance).toBeGreaterThan(0);
    expect(r.resonance).toBeLessThanOrEqual(1);

    // Thermo is recorded as evidence, not folded into adjustedValue.
    expect(r.thermoFreeEnergyDelta).toBe(0.42);

    // Real hashes, not invented strings.
    expect(r.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(r.growthMerkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(r.commitHash).toBe(SAMPLE_FACTS.commitHash);

    // Every landed item carries an accepted etch + growth event.
    const landed = r.workItems.filter((w) => w.landed);
    expect(landed.length).toBe(3);
    for (const item of landed) {
      expect(item.etchAccepted).toBe(true);
      expect(item.etchHash).toMatch(/^[0-9a-f]{64}$/);
      expect(item.growthEventHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('returns null when the cycle did not merge', () => {
    expect(auditCycle(SAMPLE_WORK, { ...SAMPLE_FACTS, merged: false }, { now: FIXED_NOW })).toBeNull();
  });

  it('returns null when the guardian failed', () => {
    expect(
      auditCycle(SAMPLE_WORK, { ...SAMPLE_FACTS, guardianVerdict: 'FAIL' }, { now: FIXED_NOW }),
    ).toBeNull();
  });

  it('returns null when there is no landed work', () => {
    const unlanded = SAMPLE_WORK.map((w) => ({ ...w, landed: false }));
    expect(auditCycle(unlanded, SAMPLE_FACTS, { now: FIXED_NOW })).toBeNull();
  });

  it('returns null when the resonance floor is unreachable', () => {
    expect(auditCycle(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW, resonanceFloor: 1.01 })).toBeNull();
  });

  it('omits the thermo delta cleanly when not supplied', () => {
    const { thermoFreeEnergyDelta: _omit, ...factsNoThermo } = SAMPLE_FACTS;
    const report = auditCycle(SAMPLE_WORK, factsNoThermo, { now: FIXED_NOW });
    expect(report?.thermoFreeEnergyDelta).toBeNull();
  });

  it('is deterministic across runs (hashes and values are replayable)', () => {
    const a = auditCycle(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW })!;
    const b = auditCycle(SAMPLE_WORK, SAMPLE_FACTS, { now: FIXED_NOW })!;

    expect(b.merkleRoot).toBe(a.merkleRoot);
    expect(b.growthMerkleRoot).toBe(a.growthMerkleRoot);
    expect(b.resonance).toBe(a.resonance);
    expect(b.adjustedValue).toBe(a.adjustedValue);
    expect(b.workItems.map((w) => w.etchHash)).toEqual(a.workItems.map((w) => w.etchHash));
    expect(b.workItems.map((w) => w.growthEventHash)).toEqual(
      a.workItems.map((w) => w.growthEventHash),
    );
  });

  it('does not let the timestamp influence the provenance hash', () => {
    const a = auditCycle(SAMPLE_WORK, SAMPLE_FACTS, { now: () => new Date('2026-01-01T00:00:00.000Z') })!;
    const b = auditCycle(SAMPLE_WORK, SAMPLE_FACTS, { now: () => new Date('2030-12-31T23:59:59.000Z') })!;
    expect(a.merkleRoot).toBe(b.merkleRoot);
    expect(a.timestamp).not.toBe(b.timestamp);
  });
});
