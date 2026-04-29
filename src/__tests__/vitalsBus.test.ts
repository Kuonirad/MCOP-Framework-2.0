/**
 * @fileoverview Unit tests for the shared Core Web Vitals bus.
 * @description The bus multiplexes samples to many subscribers from a
 * single `PerformanceObserver` set.  These tests drive it via the
 * test-only emitter so they run cleanly in jsdom (which has no real
 * `PerformanceObserver`).
 */

import {
  __emitForTests,
  __resetForTests,
  getLatestVitals,
  subscribeVitals,
  type VitalSample,
} from '@/app/_components/vitalsBus';

function sample(partial: Partial<VitalSample> & Pick<VitalSample, 'name' | 'value'>): VitalSample {
  return { ts: 1_700_000_000, ...partial };
}

describe('vitalsBus', () => {
  afterEach(() => __resetForTests());

  it('broadcasts samples to every subscriber', () => {
    const a = jest.fn();
    const b = jest.fn();
    const unsubA = subscribeVitals(a);
    const unsubB = subscribeVitals(b);

    __emitForTests(sample({ name: 'LCP', value: 1200 }));

    expect(a).toHaveBeenCalledWith(expect.objectContaining({ name: 'LCP', value: 1200 }));
    expect(b).toHaveBeenCalledWith(expect.objectContaining({ name: 'LCP', value: 1200 }));

    unsubA();
    unsubB();
  });

  it('replays cached samples so late subscribers render immediately', () => {
    __emitForTests(sample({ name: 'LCP', value: 900 }));
    __emitForTests(sample({ name: 'CLS', value: 0.05 }));

    const seen: VitalSample[] = [];
    const unsub = subscribeVitals((s) => seen.push(s));

    const names = seen.map((s) => s.name).sort();
    expect(names).toEqual(['CLS', 'LCP']);
    unsub();
  });

  it('stops delivering after unsubscribe', () => {
    const listener = jest.fn();
    const unsub = subscribeVitals(listener);
    unsub();

    __emitForTests(sample({ name: 'INP', value: 50 }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('is resilient to a throwing subscriber', () => {
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    subscribeVitals(bad);
    subscribeVitals(good);

    expect(() => __emitForTests(sample({ name: 'LCP', value: 1000 }))).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('exposes the latest sample per metric via getLatestVitals', () => {
    __emitForTests(sample({ name: 'LCP', value: 1000 }));
    __emitForTests(sample({ name: 'LCP', value: 1800 }));
    __emitForTests(sample({ name: 'CLS', value: 0.12 }));

    const latest = getLatestVitals();
    expect(latest.LCP?.value).toBe(1800);
    expect(latest.CLS?.value).toBeCloseTo(0.12);
  });

  it('supports multiple subscribe/unsubscribe cycles without leaking listeners', () => {
    for (let i = 0; i < 5; i += 1) {
      const unsub = subscribeVitals(() => undefined);
      unsub();
    }
    // Fresh subscriber should not be hit by ghost emissions.
    const fresh = jest.fn();
    const unsub = subscribeVitals(fresh);
    __emitForTests(sample({ name: 'LCP', value: 1234 }));
    expect(fresh).toHaveBeenCalledTimes(1);
    unsub();
  });

  /* ── Branch coverage extensions ── */

  it('isolates a throwing subscriber during replay', () => {
    __emitForTests(sample({ name: 'LCP', value: 1000 }));
    const bad = jest.fn(() => {
      throw new Error('replay boom');
    });
    const good = jest.fn();
    subscribeVitals(bad);
    subscribeVitals(good);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a subscriber throws during broadcast', () => {
    subscribeVitals(() => {
      throw new Error('broadcast boom');
    });
    expect(() => __emitForTests(sample({ name: 'CLS', value: 0.1 }))).not.toThrow();
  });

  it('does not throw when a subscriber throws during replay', () => {
    __emitForTests(sample({ name: 'FCP', value: 800 }));
    expect(() =>
      subscribeVitals(() => {
        throw new Error('replay throw');
      }),
    ).not.toThrow();
  });
});
