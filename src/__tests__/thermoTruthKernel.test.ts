// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview ThermoTruthKernel regression suite — covers the deterministic
 * TS port of the thermo-truth-proto thermodynamic primitives:
 *   - `F = U − T·S` identity + per-quantity correctness vs the proto.
 *   - Entropy / negentropy bounds and limiting cases.
 *   - Determinism (no clocks / no RNG): identical inputs → identical outputs.
 *   - `relaxToEquilibrium` produces a monotonically non-increasing free-energy
 *     trajectory and never mutates its inputs.
 */

import {
  computeBoltzmannWeights,
  computeFreeEnergy,
  computePartitionFunction,
  computeTemperature,
  computeVariance,
  makeAnnealingSchedule,
  relaxToEquilibrium,
  type ThermoMicrostate,
} from '../core/thermoTruthKernel';

function microstates(energies: number[], states?: number[][]): ThermoMicrostate[] {
  return energies.map((energy, i) => ({
    energy,
    stateVector: states ? states[i] : [energy],
  }));
}

describe('ThermoTruthKernel — thermodynamic quantities', () => {
  it('satisfies the F = U − T·S identity (kEff = 1)', () => {
    const ms = microstates([3, 1, 4, 1, 5], [[0], [1], [2], [3], [4]]);
    const m = computeFreeEnergy(ms);
    expect(m.freeEnergy).toBeCloseTo(m.internalEnergy - m.temperature * m.entropy, 9);
  });

  it('internal energy is the sum of microstate energies', () => {
    const m = computeFreeEnergy(microstates([2, 3, 5]));
    expect(m.internalEnergy).toBe(10);
  });

  it('temperature follows the equipartition map T = (2/3)·σ²', () => {
    const ms = microstates([0, 0, 0], [[0], [2], [4]]); // mean 2, var = (4+0+4)/3
    const variance = computeVariance(ms);
    expect(computeTemperature(ms)).toBeCloseTo((2 / 3) * variance, 12);
  });

  it('entropy and negentropy are non-negative and complementary', () => {
    const ms = microstates([1, 2, 3, 4], [[0], [1], [2], [3]]);
    const m = computeFreeEnergy(ms);
    expect(m.entropy).toBeGreaterThanOrEqual(0);
    expect(m.negentropy).toBeGreaterThanOrEqual(0);
    expect(m.negentropy).toBeCloseTo(m.maxEntropy - m.entropy, 12);
  });

  it('all-distinct microstates have maximal entropy (log2 N) and ~zero negentropy', () => {
    const ms = microstates([1, 2, 3, 4], [[0], [1], [2], [3]]);
    const m = computeFreeEnergy(ms);
    expect(m.entropy).toBeCloseTo(Math.log2(4), 6);
    expect(m.negentropy).toBeCloseTo(0, 6);
  });

  it('identical microstates have zero entropy and maximal negentropy (perfect order)', () => {
    const ms = microstates([2, 2, 2, 2], [[1], [1], [1], [1]]);
    const m = computeFreeEnergy(ms);
    expect(m.entropy).toBeCloseTo(0, 9);
    expect(m.variance).toBeCloseTo(0, 9);
    expect(m.temperature).toBeCloseTo(0, 9);
    expect(m.negentropy).toBeCloseTo(Math.log2(4), 9);
  });

  it('partition function matches Σ exp(−β·E) and weights sum to 1', () => {
    const ms = microstates([0, 1, 2]);
    const beta = 1.0;
    const z = computePartitionFunction(ms, beta);
    expect(z).toBeCloseTo(Math.exp(0) + Math.exp(-1) + Math.exp(-2), 12);
    const w = computeBoltzmannWeights(ms, beta);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    // Lowest-energy microstate carries the most weight.
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
  });

  it('handles the empty and singleton ensembles (proto parity)', () => {
    const empty = computeFreeEnergy([]);
    expect(empty.count).toBe(0);
    expect(empty.internalEnergy).toBe(0);
    expect(empty.temperature).toBe(0);
    expect(empty.entropy).toBe(0);
    expect(empty.partitionFunction).toBe(1);

    const single = computeFreeEnergy(microstates([7]));
    expect(single.variance).toBe(0);
    expect(single.temperature).toBe(0);
    expect(single.entropy).toBe(0);
    expect(single.freeEnergy).toBe(7);
  });

  it('is deterministic — identical inputs yield identical metrics', () => {
    const ms = microstates([3, 1, 4, 1, 5, 9], [[0], [1], [2], [3], [4], [5]]);
    expect(computeFreeEnergy(ms)).toEqual(computeFreeEnergy(ms));
  });

  it('accepts Float32Array state vectors', () => {
    const ms: ThermoMicrostate[] = [
      { energy: 1, stateVector: new Float32Array([0, 1]) },
      { energy: 2, stateVector: new Float32Array([1, 0]) },
    ];
    const m = computeFreeEnergy(ms);
    expect(Number.isFinite(m.freeEnergy)).toBe(true);
    expect(m.variance).toBeGreaterThan(0);
  });
});

describe('ThermoTruthKernel — annealing schedule', () => {
  it('produces a monotonically cooling exponential ladder floored at tFinal', () => {
    const sched = makeAnnealingSchedule({ tInitial: 10, tFinal: 0.01, steps: 50 });
    expect(sched).toHaveLength(50);
    expect(sched[0]).toBeCloseTo(10, 9);
    for (let i = 1; i < sched.length; i += 1) {
      expect(sched[i]).toBeLessThanOrEqual(sched[i - 1] + 1e-12);
      expect(sched[i]).toBeGreaterThanOrEqual(0.01 - 1e-12);
    }
  });
});

describe('ThermoTruthKernel — deterministic relaxation', () => {
  const initial = microstates([10, 8, 6, 4, 2, 0], [[0], [1], [2], [3], [4], [5]]);
  const schedule = makeAnnealingSchedule({ tInitial: 5, tFinal: 0.01, steps: 60 });

  it('yields a monotonically non-increasing free-energy trajectory', () => {
    const { trajectory, monotonic } = relaxToEquilibrium(initial, schedule);
    expect(monotonic).toBe(true);
    for (let i = 1; i < trajectory.length; i += 1) {
      expect(trajectory[i].freeEnergy).toBeLessThanOrEqual(trajectory[i - 1].freeEnergy + 1e-9);
    }
  });

  it('actually relaxes — final free energy is below the initial', () => {
    const result = relaxToEquilibrium(initial, schedule);
    expect(result.finalMetrics.freeEnergy).toBeLessThan(result.trajectory[0].freeEnergy);
  });

  it('never mutates its input ensemble', () => {
    const snapshot = JSON.parse(JSON.stringify(initial));
    relaxToEquilibrium(initial, schedule);
    expect(initial).toEqual(snapshot);
  });

  it('is deterministic across runs', () => {
    const a = relaxToEquilibrium(initial, schedule);
    const b = relaxToEquilibrium(initial, schedule);
    expect(a.trajectory.map((s) => s.freeEnergy)).toEqual(b.trajectory.map((s) => s.freeEnergy));
    expect(a.final).toEqual(b.final);
  });
});
