// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { PheromoneLedger, decayedStrength } from '../core/temporalStigmergy';

describe('decayedStrength', () => {
  it('halves the deposit every half-life', () => {
    expect(decayedStrength(1, 0, 1000)).toBeCloseTo(1, 9);
    expect(decayedStrength(1, 1000, 1000)).toBeCloseTo(0.5, 9);
    expect(decayedStrength(1, 2000, 1000)).toBeCloseTo(0.25, 9);
    expect(decayedStrength(1, 3000, 1000)).toBeCloseTo(0.125, 9);
  });

  it('never decays below the floor', () => {
    expect(decayedStrength(1, 1_000_000, 1000, 0.1)).toBeCloseTo(0.1, 9);
  });

  it('treats negative/zero elapsed time as no decay (clock-skew guard)', () => {
    expect(decayedStrength(0.8, -500, 1000)).toBeCloseTo(0.8, 9);
  });
});

describe('PheromoneLedger', () => {
  it('deposits, decays, and reports strength against an injected clock', () => {
    const led = new PheromoneLedger({ halfLifeMs: 1000, floor: 0, strengthCap: 1 });
    led.deposit('a', 1, 0);
    expect(led.strength('a', 0)).toBeCloseTo(1, 9);
    expect(led.strength('a', 1000)).toBeCloseTo(0.5, 9);
    expect(led.strength('a', 2000)).toBeCloseTo(0.25, 9);
    expect(led.size).toBe(1);
  });

  it('reinforcement decays-to-now, adds the gain, and resets the clock', () => {
    const led = new PheromoneLedger({ halfLifeMs: 1000, reinforcementGain: 0.25, strengthCap: 1 });
    led.deposit('a', 1, 0);
    // At t=1000 strength is 0.5; reinforcing makes it 0.5 + 0.25 = 0.75.
    expect(led.reinforce('a', 1000)).toBeCloseTo(0.75, 9);
    // Clock reset: at t=2000 it has decayed one half-life from 0.75 → 0.375.
    expect(led.strength('a', 2000)).toBeCloseTo(0.375, 9);
  });

  it('saturates at the strength cap', () => {
    const led = new PheromoneLedger({ halfLifeMs: 1000, reinforcementGain: 0.5, strengthCap: 1 });
    led.deposit('a', 0.9, 0);
    expect(led.reinforce('a', 0)).toBeCloseTo(1, 9); // 0.9 + 0.5 capped at 1
  });

  it('clamps the initial deposit into [floor, cap]', () => {
    const led = new PheromoneLedger({ floor: 0.1, strengthCap: 0.8 });
    led.deposit('hi', 5, 0);
    expect(led.strength('hi', 0)).toBeCloseTo(0.8, 9);
    led.deposit('lo', -3, 0);
    expect(led.strength('lo', 0)).toBeCloseTo(0.1, 9);
  });

  it('reinforce is a no-op for unknown ids; strength returns the floor', () => {
    const led = new PheromoneLedger({ floor: 0.05 });
    expect(led.reinforce('ghost', 0)).toBe(0);
    expect(led.strength('ghost', 0)).toBe(0.05);
  });

  it('prunes faded trails and forgets explicitly', () => {
    const led = new PheromoneLedger({ halfLifeMs: 1000, floor: 0 });
    led.deposit('a', 1, 0);
    led.deposit('b', 1, 0);
    // After 20 half-lives both are effectively zero.
    const pruned = led.prune(20_000, 1e-3);
    expect(pruned.sort()).toEqual(['a', 'b']);
    expect(led.size).toBe(0);

    led.deposit('c', 1, 0);
    led.forget('c');
    expect(led.has('c')).toBe(false);
  });

  it('reports aggregate stats at an instant', () => {
    const led = new PheromoneLedger({ halfLifeMs: 1000, reinforcementGain: 0.25 });
    led.deposit('a', 1, 0);
    led.deposit('b', 1, 0);
    led.reinforce('a', 1000); // a: 0.5 + 0.25 = 0.75 at t=1000; b decays to 0.5
    const stats = led.stats(1000);
    expect(stats.tracked).toBe(2);
    expect(stats.totalReinforcements).toBe(1);
    expect(stats.maxStrength).toBeCloseTo(0.75, 9);
    expect(stats.maxStrength).toBeGreaterThan(stats.meanStrength);
    expect(stats.meanStrength).toBeGreaterThan(0);
  });
});
