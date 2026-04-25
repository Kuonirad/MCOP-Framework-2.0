/**
 * @fileoverview Unit tests for the Visual Stability Index (VSI) bus.
 * @description The bus multiplexes layout-shift samples from a single
 * `PerformanceObserver` to many subscribers.  jsdom does not implement
 * the Layout Instability API, so these tests drive the bus through the
 * test-only emitter (`__emitShiftForTests`).
 */

import {
  __emitShiftForTests,
  __resetVSIForTests,
  getRecentVSIShifts,
  subscribeVSI,
  type VSIShiftSample,
} from '@/app/_components/vsiBus';

function shift(partial: Partial<VSIShiftSample> & Pick<VSIShiftSample, 'value'>): VSIShiftSample {
  return {
    value: partial.value,
    startTime: partial.startTime ?? performance.now(),
    ts: partial.ts ?? Date.now(),
    source: partial.source ?? null,
  };
}

describe('vsiBus', () => {
  afterEach(() => __resetVSIForTests());

  it('broadcasts shifts to every subscriber', () => {
    const a = jest.fn();
    const b = jest.fn();
    const unsubA = subscribeVSI(a);
    const unsubB = subscribeVSI(b);

    __emitShiftForTests(shift({ value: 0.05 }));

    expect(a).toHaveBeenCalledWith(expect.objectContaining({ value: 0.05 }));
    expect(b).toHaveBeenCalledWith(expect.objectContaining({ value: 0.05 }));
    unsubA();
    unsubB();
  });

  it('replays cached samples to late subscribers', () => {
    __emitShiftForTests(shift({ value: 0.02, startTime: 100 }));
    __emitShiftForTests(shift({ value: 0.04, startTime: 200 }));

    const seen: VSIShiftSample[] = [];
    const unsub = subscribeVSI((s) => seen.push(s));
    expect(seen.map((s) => s.value)).toEqual([0.02, 0.04]);
    unsub();
  });

  it('stops delivering after unsubscribe', () => {
    const listener = jest.fn();
    const unsub = subscribeVSI(listener);
    listener.mockClear(); // discard any replay
    unsub();
    __emitShiftForTests(shift({ value: 0.03 }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates a throwing subscriber from the rest', () => {
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    subscribeVSI(bad);
    subscribeVSI(good);
    expect(() => __emitShiftForTests(shift({ value: 0.01 }))).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('exposes recent shifts in arrival order via getRecentVSIShifts', () => {
    __emitShiftForTests(shift({ value: 0.01, startTime: 1 }));
    __emitShiftForTests(shift({ value: 0.02, startTime: 2 }));
    const recent = getRecentVSIShifts();
    expect(recent.map((s) => s.value)).toEqual([0.01, 0.02]);
  });

  it('caps retained samples to MAX_SAMPLES', () => {
    for (let i = 0; i < 300; i += 1) {
      __emitShiftForTests(shift({ value: 0.001, startTime: i }));
    }
    const recent = getRecentVSIShifts();
    expect(recent.length).toBeLessThanOrEqual(256);
    // Oldest entries should have been evicted; latest survives.
    expect(recent[recent.length - 1].startTime).toBe(299);
  });
});
