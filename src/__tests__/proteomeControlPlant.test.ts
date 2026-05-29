// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  FastControlLoop,
  PIDController,
  ProteomeControlPlant,
  controlTargetsFromGenome,
} from '../control';
import { ProteomeOrchestrator } from '../proteome/ProteomeOrchestrator';

const FIXED_CLOCK = () => new Date('2026-05-29T00:00:00.000Z');

function buildLoop() {
  const proteome = new ProteomeOrchestrator(
    { nodeCount: 32, stateDim: 8, seed: 0xc0ffee, homeostasis: 0.1, mutationTemperature: 0.5 },
    { now: FIXED_CLOCK },
  );
  const plant = new ProteomeControlPlant(proteome, { coupleMutationTemperature: true });
  const targets = controlTargetsFromGenome({ homeostasis: 0.6, mutationTemperature: 0.4 });
  const pid = new PIDController({
    gains: targets.gains,
    setpoint: targets.setpoint,
    outputMin: targets.outputMin,
    outputMax: targets.outputMax,
  });
  return { plant, loop: new FastControlLoop(plant, pid, { now: FIXED_CLOCK }) };
}

describe('ProteomeControlPlant + FastControlLoop', () => {
  it('drives the real substrate and seals a valid, well-formed report', async () => {
    const { plant, loop } = buildLoop();
    const report = await loop.run(40);

    expect(report.kind).toBe('mcop-fast-control-report');
    expect(report.ticks).toHaveLength(40);
    expect(report.merkleRoot).toHaveLength(64);
    expect(['converged', 'oscillating', 'diverging', 'saturated', 'unsettled']).toContain(report.verdict);
    // The controller actually moved the homeostasis knob away from its initial 0.1.
    expect(plant.appliedHomeostasis).not.toBeCloseTo(0.1, 3);
    // Every measured equilibrium score is a valid probability.
    for (const t of report.ticks) {
      expect(t.measurement).toBeGreaterThanOrEqual(0);
      expect(t.measurement).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: same seed and targets ⇒ identical Merkle root', async () => {
    const a = await buildLoop().loop.run(25);
    const b = await buildLoop().loop.run(25);
    expect(a.merkleRoot).toBe(b.merkleRoot);
  });

  it('closed-loop tracking beats a fixed open-loop knob at the same setpoint', async () => {
    const targets = controlTargetsFromGenome({ homeostasis: 0.6, mutationTemperature: 0.4 });

    // Closed loop: controller adjusts homeostasis each tick.
    const { loop } = buildLoop();
    const closed = await loop.run(60);

    // Open loop: homeostasis pinned at its initial value, never corrected.
    const openProteome = new ProteomeOrchestrator(
      { nodeCount: 32, stateDim: 8, seed: 0xc0ffee, homeostasis: 0.1, mutationTemperature: 0.5 },
      { now: FIXED_CLOCK },
    );
    let openErrSum = 0;
    for (let k = 0; k < 60; k += 1) {
      const r = await openProteome.step();
      openErrSum += Math.abs(targets.setpoint - r.equilibriumScore);
    }
    const openMeanErr = openErrSum / 60;
    const closedMeanErr =
      closed.ticks.reduce((s, t) => s + Math.abs(t.error), 0) / closed.ticks.length;

    expect(closedMeanErr).toBeLessThan(openMeanErr);
  });
});
