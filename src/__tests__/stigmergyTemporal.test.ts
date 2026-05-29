// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { StigmergyV5 } from '../core';

const VEC = [1, 0, 0, 0];

describe('StigmergyV5 temporal dynamics — disabled by default (v5 parity)', () => {
  it('exposes no temporal surface and tags no pheromone strength', () => {
    const stig = new StigmergyV5({ resonanceThreshold: 0 });
    const trace = stig.recordTrace(VEC, VEC, { k: 1 });

    expect(stig.isTemporalEnabled()).toBe(false);
    expect(stig.getPheromoneStrength(trace.id)).toBeUndefined();
    expect(stig.reinforceTrace(trace.id)).toBeUndefined();
    expect(stig.getTemporalStats()).toBeUndefined();
    expect(stig.pruneFadedTraces()).toEqual([]);

    const recent = stig.getResonantRecent(5, { context: VEC });
    expect(recent[0]).not.toHaveProperty('pheromoneStrength');

    const res = stig.getResonance(VEC);
    expect(res.pheromoneStrength).toBeUndefined();
  });
});

describe('StigmergyV5 temporal dynamics — enabled', () => {
  function makeClock(start = 0) {
    const box = { t: start };
    return { now: () => box.t, advance: (ms: number) => (box.t += ms), box };
  }

  function makeStig(now: () => number) {
    return new StigmergyV5({
      resonanceThreshold: 0,
      adaptiveThreshold: false,
      curiosityBonus: 0,
      now,
      temporalDynamics: { enabled: true, halfLifeMs: 1000, reinforcementGain: 0.25, floor: 0 },
    });
  }

  it('deposits at the trace weight and evaporates over time', () => {
    const clock = makeClock(0);
    const stig = makeStig(clock.now);
    const trace = stig.recordTrace(VEC, VEC); // cosine(VEC,VEC)=1 ⇒ weight 1

    expect(stig.getPheromoneStrength(trace.id)).toBeCloseTo(1, 6);
    clock.advance(1000);
    expect(stig.getPheromoneStrength(trace.id)).toBeCloseTo(0.5, 6);
    clock.advance(1000);
    expect(stig.getPheromoneStrength(trace.id)).toBeCloseTo(0.25, 6);
  });

  it('ranks a fresh trail above an equally-similar stale one', () => {
    const clock = makeClock(0);
    const stig = makeStig(clock.now);
    const stale = stig.recordTrace(VEC, VEC); // deposited at t=0
    clock.advance(1000); // one half-life passes
    const fresh = stig.recordTrace(VEC, VEC); // deposited at t=1000

    const ranked = stig.getResonantRecent(5, { context: VEC });
    expect(ranked[0].id).toBe(fresh.id);
    const freshStrength = ranked.find((r) => r.id === fresh.id)?.pheromoneStrength ?? 0;
    const staleStrength = ranked.find((r) => r.id === stale.id)?.pheromoneStrength ?? 0;
    expect(freshStrength).toBeCloseTo(1, 6);
    expect(staleStrength).toBeCloseTo(0.5, 6);
    expect(freshStrength).toBeGreaterThan(staleStrength);
  });

  it('reinforces a trail when resonance re-traverses it', () => {
    const clock = makeClock(0);
    const stig = makeStig(clock.now);
    const trace = stig.recordTrace(VEC, VEC);
    clock.advance(1000); // decays to 0.5

    const res = stig.getResonance(VEC); // match → reinforce: 0.5 + 0.25 = 0.75
    expect(res.trace?.id).toBe(trace.id);
    expect(res.pheromoneStrength).toBeCloseTo(0.75, 6);
    expect(stig.getPheromoneStrength(trace.id)).toBeCloseTo(0.75, 6);
  });

  it('supports explicit reinforcement and pruning of faded trails', () => {
    const clock = makeClock(0);
    const stig = makeStig(clock.now);
    const a = stig.recordTrace(VEC, VEC);
    expect(stig.reinforceTrace(a.id)).toBeCloseTo(1, 6); // 1 capped at cap=1

    clock.advance(30_000); // ~30 half-lives → ≈0
    const pruned = stig.pruneFadedTraces(1e-3);
    expect(pruned).toContain(a.id);
    expect(stig.getTemporalStats()?.tracked).toBe(0);
  });

  it('strength evolution is deterministic under a replayed clock', () => {
    const run = () => {
      const clock = makeClock(0);
      const stig = makeStig(clock.now);
      const t = stig.recordTrace(VEC, VEC);
      clock.advance(500);
      stig.getResonance(VEC); // reinforce at t=500
      clock.advance(500);
      return stig.getPheromoneStrength(t.id);
    };
    expect(run()).toBeCloseTo(run() ?? -1, 9);
  });
});
