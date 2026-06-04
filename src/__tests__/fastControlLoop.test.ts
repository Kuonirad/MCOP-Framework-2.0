// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  FastControlLoop,
  FirstOrderPlant,
  PIDController,
  controlTargetsFromGenome,
  type ControlCommand,
  type ControlPlant,
} from '../control';

/** A plant that replays a fixed measurement sequence, ignoring actuation. */
class ScriptedPlant implements ControlPlant {
  private i = 0;
  constructor(private readonly seq: number[]) {}
  measure(): number {
    const v = this.seq[Math.min(this.i, this.seq.length - 1)];
    this.i += 1;
    return v;
  }
  actuate(_command: ControlCommand): void {
    /* no-op: trajectory is scripted */
  }
}

const FIXED_CLOCK = () => new Date('2026-05-29T00:00:00.000Z');

describe('FastControlLoop — control theory on a first-order plant', () => {
  it('PI control drives steady-state error to zero (converged)', async () => {
    const plant = new FirstOrderPlant(0.7, 1, 0);
    const pid = new PIDController({
      gains: { kp: 0.6, ki: 0.15, kd: 0 },
      setpoint: 1,
      outputMin: 0,
      outputMax: 5,
    });
    const loop = new FastControlLoop(plant, pid, { now: FIXED_CLOCK, settleTolerance: 0.02 });
    const report = await loop.run(300);

    expect(report.verdict).toBe('converged');
    expect(report.settleTick).not.toBeNull();
    expect(report.steadyStateError).toBeLessThan(0.02);
    expect(plant.state).toBeCloseTo(1, 1);
  });

  it('P-only control leaves the analytically-predicted residual error', async () => {
    // First-order lag DC gain K=1, Kp=2 ⇒ steady-state y* = K·Kp/(1+K·Kp) = 2/3,
    // so steady-state error ≈ 1/3 — integral action is exactly what removes it.
    const plant = new FirstOrderPlant(0.7, 1, 0);
    const pid = new PIDController({
      gains: { kp: 2, ki: 0, kd: 0 },
      setpoint: 1,
      outputMin: 0,
      outputMax: 100,
    });
    const loop = new FastControlLoop(plant, pid, { now: FIXED_CLOCK });
    const report = await loop.run(100);

    expect(report.verdict).toBe('unsettled');
    expect(report.settleTick).toBeNull();
    expect(report.steadyStateError).toBeGreaterThan(0.30);
    expect(report.steadyStateError).toBeLessThan(0.36);
  });

  it('is deterministic: identical inputs seal an identical Merkle root', async () => {
    const build = () =>
      new FastControlLoop(
        new FirstOrderPlant(0.7, 1, 0),
        new PIDController({ gains: { kp: 0.6, ki: 0.15, kd: 0 }, setpoint: 1, outputMin: 0, outputMax: 5 }),
        { now: FIXED_CLOCK },
      );
    const a = await build().run(50);
    const b = await build().run(50);
    expect(a.merkleRoot).toHaveLength(64);
    expect(a.merkleRoot).toBe(b.merkleRoot);
  });
});

describe('FastControlLoop — verdict classification', () => {
  function loopFor(seq: number[], opts?: { kp?: number; outputMax?: number }) {
    const pid = new PIDController({
      gains: { kp: opts?.kp ?? 1, ki: 0, kd: 0 },
      setpoint: 1,
      outputMin: 0,
      outputMax: opts?.outputMax ?? 100,
    });
    return new FastControlLoop(new ScriptedPlant(seq), pid, { now: FIXED_CLOCK, settleTolerance: 0.02 });
  }

  it('classifies a settled trajectory as converged', async () => {
    const report = await loopFor([1, 1, 1, 1, 1, 1, 1, 1]).run(8);
    expect(report.verdict).toBe('converged');
    expect(report.settleTick).toBe(0);
  });

  it('classifies a runaway trajectory as diverging', async () => {
    const report = await loopFor([0.5, 0.2, -0.2, -0.7, -1.2, -1.7]).run(6);
    expect(report.verdict).toBe('diverging');
  });

  it('classifies a sign-flipping trajectory as oscillating', async () => {
    const report = await loopFor([0.5, 1.5, 0.5, 1.5, 0.5, 1.5, 0.5, 1.5, 0.5]).run(9);
    expect(report.verdict).toBe('oscillating');
  });

  it('classifies a pinned actuator as saturated', async () => {
    // Constant far-from-setpoint measurement with a tiny output ceiling: the
    // controller pins every tick and never settles.
    const report = await loopFor([0, 0, 0, 0, 0, 0], { kp: 2, outputMax: 0.1 }).run(6);
    expect(report.verdict).toBe('saturated');
    expect(report.saturationRate).toBe(1);
  });
});

describe('controlTargetsFromGenome', () => {
  it('maps homeostasis to a setpoint in [0.4, 0.8] and temperature to gentler gain', () => {
    const calm = controlTargetsFromGenome({ homeostasis: 0, mutationTemperature: 0 });
    const tight = controlTargetsFromGenome({ homeostasis: 1, mutationTemperature: 0 });
    const hot = controlTargetsFromGenome({ homeostasis: 1, mutationTemperature: 1 });

    expect(calm.setpoint).toBeCloseTo(0.4, 6);
    expect(tight.setpoint).toBeCloseTo(0.8, 6);
    // Higher mutationTemperature ⇒ smaller proportional gain.
    expect(hot.gains.kp).toBeLessThan(tight.gains.kp);
    expect(tight.outputMin).toBe(0);
    expect(tight.outputMax).toBe(1);
  });
});
