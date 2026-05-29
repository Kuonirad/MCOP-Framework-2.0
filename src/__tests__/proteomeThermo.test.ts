// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Proteome ↔ ThermoTruth infusion regression suite.
 *
 * Proves the physical-constraint layer is *non-destructive*: enabling
 * `enableThermo` must never change node dynamics, the equilibrium score, or
 * the Merkle root for a given seed — it only attaches additive thermodynamic
 * metadata. Also exercises the `ΔF` signal and negentropy bounds.
 */

import { ProteomeOrchestrator } from '../proteome';

function makeProteome(enableThermo: boolean, overrides = {}) {
  return new ProteomeOrchestrator(
    {
      nodeCount: 60,
      stateDim: 8,
      avgDegree: 6,
      seed: 0xc0ffee,
      homeostasis: 0.5,
      mutationTemperature: 0.5,
      ...overrides,
    },
    { now: () => new Date(0), enableThermo },
  );
}

describe('Proteome ↔ ThermoTruth — non-destructive infusion', () => {
  it('is off by default (no thermo metadata, no opt-in)', async () => {
    const p = new ProteomeOrchestrator({ nodeCount: 30, seed: 1 }, { enableThermo: false });
    expect(p.thermoEnabled).toBe(false);
    const result = await p.step();
    expect(result.thermo).toBeUndefined();
    expect(result.provenance.thermo).toBeUndefined();
  });

  it('preserves Merkle parity: enabling thermo does not change the sealed root', async () => {
    const off = makeProteome(false);
    const on = makeProteome(true);
    const offSeq = (await off.runSteps(12)).map((s) => s.merkleRoot);
    const onSeq = (await on.runSteps(12)).map((s) => s.merkleRoot);
    expect(onSeq).toEqual(offSeq);
  });

  it('preserves dynamics: equilibriumScore + energyVariance are identical with thermo on/off', async () => {
    const off = makeProteome(false);
    const on = makeProteome(true);
    const offSeq = await off.runSteps(12);
    const onSeq = await on.runSteps(12);
    expect(onSeq.map((s) => s.equilibriumScore)).toEqual(offSeq.map((s) => s.equilibriumScore));
    expect(onSeq.map((s) => s.energyVariance)).toEqual(offSeq.map((s) => s.energyVariance));
    expect(onSeq.map((s) => s.totalEnergy)).toEqual(offSeq.map((s) => s.totalEnergy));
  });

  it('attaches thermo metadata on result + provenance when enabled', async () => {
    const p = makeProteome(true);
    const result = await p.step();
    expect(result.thermo).toBeDefined();
    expect(result.provenance.thermo).toBeDefined();
    expect(result.provenance.thermo).toEqual(result.thermo);
    const t = result.thermo!;
    expect(Number.isFinite(t.freeEnergy)).toBe(true);
    expect(Number.isFinite(t.internalEnergy)).toBe(true);
    expect(t.temperature).toBeGreaterThanOrEqual(0);
    expect(t.entropy).toBeGreaterThanOrEqual(0);
    expect(t.negentropy).toBeGreaterThanOrEqual(0);
    expect(t.partitionFunction).toBeGreaterThan(0);
  });

  it('emits ΔF from the second step onward', async () => {
    const p = makeProteome(true);
    const [first, second] = await p.runSteps(2);
    expect(first.thermo!.deltaFreeEnergy).toBeUndefined();
    expect(typeof second.thermo!.deltaFreeEnergy).toBe('number');
    expect(second.thermo!.deltaFreeEnergy).toBeCloseTo(
      second.thermo!.freeEnergy - first.thermo!.freeEnergy,
      9,
    );
  });

  it('is deterministic: identical thermo metadata across two seeded runs', async () => {
    const a = makeProteome(true);
    const b = makeProteome(true);
    const aSeq = (await a.runSteps(8)).map((s) => s.thermo!.freeEnergy);
    const bSeq = (await b.runSteps(8)).map((s) => s.thermo!.freeEnergy);
    expect(aSeq).toEqual(bSeq);
  });

  it('resets the ΔF baseline so post-reset step 1 has no delta', async () => {
    const p = makeProteome(true);
    await p.runSteps(3);
    p.reset();
    const afterReset = await p.step();
    expect(afterReset.thermo!.deltaFreeEnergy).toBeUndefined();
  });
});
