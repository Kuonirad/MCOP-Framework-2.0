// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  assessFreeEnergySignal,
  ensembleFreeEnergy,
  ensembleTemperature,
  evaluateExpansion,
  governExpansion,
  type GovernedThought,
} from '../core/freeEnergyGovernor';
import { computeInternalEnergy } from '../core/thermoTruthKernel';
import { NovaNeoEncoder } from '../core/novaNeoEncoder';

/** Deterministic "semantic" thoughts: focused cluster + scattered outliers. */
const FOCUSED = [
  'the cat sat on the mat',
  'a cat is on the mat',
  'cats sit on soft mats',
  'the mat holds a sleeping cat',
];
const SCATTERED = [
  'quantum entropy spirals outward',
  'lunar regolith rover telemetry',
  'byzantine consensus quorum proof',
  'helmholtz free energy descent',
];

function embed(texts: string[], energy = 1): GovernedThought[] {
  const enc = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'embedding' });
  return texts.map((t, i) => ({ id: `t${i}`, energy, stateVector: enc.encode(t) }));
}

function hashed(texts: string[], energy = 1): GovernedThought[] {
  const enc = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'hash' });
  return texts.map((t, i) => ({ id: `h${i}`, energy, stateVector: enc.encode(t) }));
}

describe('freeEnergyGovernor — thermodynamic quantities', () => {
  test('F = U − T·S reproduces the kernel pieces (curiosity raises temperature)', () => {
    const thoughts = embed([...FOCUSED]);
    const u = computeInternalEnergy(thoughts.map((t) => ({ energy: t.energy, stateVector: t.stateVector })));
    expect(ensembleFreeEnergy(thoughts)).toBeLessThanOrEqual(u); // F = U − T·S ≤ U (T,S ≥ 0)
    const cold = ensembleTemperature(thoughts, { curiosityTemperature: 0 });
    const hot = ensembleTemperature(thoughts, { curiosityTemperature: 5 });
    expect(hot).toBeCloseTo(cold + 5, 9);
    // Hotter ensemble ⇒ lower free energy (entropy weighted more).
    expect(ensembleFreeEnergy(thoughts, { curiosityTemperature: 5 })).toBeLessThan(
      ensembleFreeEnergy(thoughts, { curiosityTemperature: 0 }),
    );
  });

  test('is deterministic — identical inputs give identical free energy', () => {
    const a = ensembleFreeEnergy(embed([...FOCUSED]), { curiosityTemperature: 2 });
    const b = ensembleFreeEnergy(embed([...FOCUSED]), { curiosityTemperature: 2 });
    expect(a).toBe(b);
  });
});

describe('freeEnergyGovernor — the hash-backend degeneracy guard', () => {
  test('embedding backend yields an informative (discriminating) signal', () => {
    const seed = embed(FOCUSED.slice(0, 2));
    const candidates = embed(SCATTERED);
    const signal = assessFreeEnergySignal(seed, candidates);
    expect(signal.informative).toBe(true);
    expect(signal.temperatureDynamicRange).toBeGreaterThan(signal.degeneracyFloor);
  });

  test('hash backend collapses the signal — temperature does not discriminate', () => {
    const seed = hashed(FOCUSED.slice(0, 2));
    const candidates = hashed(SCATTERED);
    const signal = assessFreeEnergySignal(seed, candidates);
    expect(signal.informative).toBe(false);
    expect(signal.temperatureDynamicRange).toBeLessThan(signal.degeneracyFloor);
    expect(signal.reason).toMatch(/hash-backend collapse|reduces to the budget U/i);
  });

  test('governExpansion refuses to govern on a degenerate (hash) signal', () => {
    const seed = hashed(FOCUSED.slice(0, 2));
    const candidates = hashed(SCATTERED);
    const result = governExpansion(seed, candidates);
    expect(result.mode).toBe('administrative-fallback');
    expect(result.haltReason).toBe('degenerate-signal');
    expect(result.accepted).toHaveLength(0);
  });
});

describe('freeEnergyGovernor — expansion rule and halting', () => {
  test('a candidate is admitted only when it lowers ensemble F', () => {
    const seed = embed(FOCUSED.slice(0, 2));
    const candidate = embed([SCATTERED[0]])[0];
    const evalCheap = evaluateExpansion(seed, candidate, { curiosityTemperature: 8 });
    const evalCostly = evaluateExpansion(seed, { ...candidate, energy: 1000 });
    // The same node is worth adding when hot/cheap, not when its budget is huge.
    expect(evalCheap.expand).toBe(true);
    expect(evalCheap.deltaF).toBeLessThanOrEqual(0);
    expect(evalCostly.expand).toBe(false);
    expect(evalCostly.deltaF).toBeGreaterThan(0);
  });

  test('higher curiosity temperature admits more thoughts (exploration knob)', () => {
    const seed = embed(FOCUSED.slice(0, 2));
    const candidates = embed(SCATTERED, 3); // non-trivial per-node budget
    const cold = governExpansion(seed, candidates, { curiosityTemperature: 0 });
    const hot = governExpansion(seed, candidates, { curiosityTemperature: 12 });
    expect(hot.accepted.length).toBeGreaterThanOrEqual(cold.accepted.length);
  });

  test('expansion halts at equilibrium (plateau or no improving candidate)', () => {
    const seed = embed(FOCUSED.slice(0, 2));
    const candidates = embed([...SCATTERED, ...FOCUSED.slice(2)], 2);
    const result = governExpansion(seed, candidates, { curiosityTemperature: 6 });
    expect(result.mode).toBe('free-energy');
    expect(['plateau', 'no-improving-candidate', 'exhausted']).toContain(result.haltReason);
    // The trajectory is a free-energy descent: each admitted node had ΔF ≤ tol.
    for (const step of result.trajectory) expect(step.deltaF).toBeLessThanOrEqual(0 + 1e-9);
  });

  test('with a huge per-node budget nothing is worth adding', () => {
    const seed = embed(FOCUSED.slice(0, 2));
    const candidates = embed(SCATTERED, 10_000);
    const result = governExpansion(seed, candidates, { curiosityTemperature: 1 });
    expect(result.accepted).toHaveLength(0);
    expect(result.haltReason).toBe('no-improving-candidate');
  });
});
