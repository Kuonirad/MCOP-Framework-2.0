/**
 * @fileoverview Unit tests for the Visual Stability Index (VSI) bus.
 * @description The bus multiplexes layout-shift samples from a single
 * `PerformanceObserver` to many subscribers.  jsdom does not implement
 * the Layout Instability API, so these tests drive the bus through the
 * test-only emitter (`__emitShiftForTests`) and mock DOM nodes for
 * the attribution helpers.
 */

import {
  __emitShiftForTests,
  __resetVSIForTests,
  describeNode,
  getRecentVSIShifts,
  pickLargestSource,
  subscribeVSI,
  type VSIShiftSample,
} from '@/app/_components/vsiBus';
import { act } from '@testing-library/react';

function shift(partial: Partial<VSIShiftSample> & Pick<VSIShiftSample, 'value'>): VSIShiftSample {
  return {
    value: partial.value,
    startTime: partial.startTime ?? performance.now(),
    ts: partial.ts ?? Date.now(),
    source: partial.source ?? null,
  };
}

function makeElement(tag: string, props: { id?: string; classList?: string[] } = {}): Element {
  const el = document.createElement(tag);
  if (props.id) el.id = props.id;
  if (props.classList) {
    props.classList.forEach((c) => el.classList.add(c));
  }
  return el;
}

function makeRect(w: number, h: number): DOMRectReadOnly {
  return {
    width: w,
    height: h,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: w,
    bottom: h,
    toJSON: () => ({}),
  };
}

function makeEntryList(entries: PerformanceEntry[]): PerformanceObserverEntryList {
  return {
    getEntries: () => entries,
    getEntriesByName: () => [],
    getEntriesByType: () => [],
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

  it('isolates a throwing subscriber during replay', () => {
    __emitShiftForTests(shift({ value: 0.01 }));
    const bad = jest.fn(() => {
      throw new Error('replay boom');
    });
    const good = jest.fn();
    subscribeVSI(bad);
    subscribeVSI(good);
    expect(bad).toHaveBeenCalledTimes(1);
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

describe('describeNode', () => {
  it('returns null for null node', () => {
    expect(describeNode(null)).toBeNull();
  });

  it('returns null-ish for non-element node', () => {
    const text = document.createTextNode('hello');
    expect(describeNode(text)).toEqual({ tagName: null, selector: null, heightPx: 0 });
  });

  it('describes an element with id', () => {
    const el = makeElement('div', { id: 'hero' });
    const result = describeNode(el);
    expect(result).toEqual({ tagName: 'div', selector: '#hero', heightPx: 0 });
  });

  it('describes an element with classList', () => {
    const el = makeElement('img', { classList: ['hero', 'a'] });
    const result = describeNode(el);
    expect(result?.tagName).toBe('img');
    expect(result?.selector).toMatch(/^img\./);
    expect(result?.heightPx).toBe(0);
  });

  it('picks the first class when none are > 2 chars', () => {
    const el = makeElement('span', { classList: ['a', 'b'] });
    const result = describeNode(el);
    expect(result?.selector).toBe('span.a');
  });

  it('describes an element without id or class', () => {
    const el = makeElement('section');
    const result = describeNode(el);
    expect(result).toEqual({ tagName: 'section', selector: 'section', heightPx: 0 });
  });

  it('uses rect height when provided', () => {
    const el = makeElement('div', { id: 'banner' });
    const rect = makeRect(100, 42);
    const result = describeNode(el, rect);
    expect(result).toEqual({ tagName: 'div', selector: '#banner', heightPx: 42 });
  });
});

describe('pickLargestSource', () => {
  it('returns null for undefined sources', () => {
    expect(pickLargestSource(undefined)).toBeNull();
  });

  it('returns null for empty sources', () => {
    expect(pickLargestSource([])).toBeNull();
  });

  it('picks the source with greatest area', () => {
    const small = { node: makeElement('img', { id: 'small' }), currentRect: makeRect(10, 10), previousRect: makeRect(10, 10) };
    const large = { node: makeElement('div', { id: 'large' }), currentRect: makeRect(100, 100), previousRect: makeRect(100, 100) };
    const result = pickLargestSource([small, large]);
    expect(result?.selector).toBe('#large');
  });

  it('picks the first source when areas are equal', () => {
    const a = { node: makeElement('p', { id: 'a' }), currentRect: makeRect(50, 50), previousRect: makeRect(50, 50) };
    const b = { node: makeElement('p', { id: 'b' }), currentRect: makeRect(50, 50), previousRect: makeRect(50, 50) };
    const result = pickLargestSource([a, b]);
    expect(result?.selector).toBe('#a');
  });

  it('ignores negative dimensions by treating them as 0', () => {
    const negative = { node: makeElement('span', { id: 'neg' }), currentRect: makeRect(-10, -10), previousRect: makeRect(-10, -10) };
    const positive = { node: makeElement('div', { id: 'pos' }), currentRect: makeRect(1, 1), previousRect: makeRect(1, 1) };
    const result = pickLargestSource([negative, positive]);
    expect(result?.selector).toBe('#pos');
  });

  it('describes the picked node with its rect', () => {
    const el = makeElement('img', { classList: ['hero'] });
    const src = { node: el, currentRect: makeRect(200, 400), previousRect: makeRect(200, 400) };
    const result = pickLargestSource([src]);
    expect(result?.tagName).toBe('img');
    expect(result?.selector).toBe('img.hero');
    expect(result?.heightPx).toBe(400);
  });
});

describe('vsiBus attach / PerformanceObserver', () => {
  let ObserverCtor: typeof PerformanceObserver;
  let instances: Array<{
    callback: PerformanceObserverCallback;
    disconnect: jest.Mock;
    observe: jest.Mock;
  }>;

  beforeEach(() => {
    __resetVSIForTests();
    ObserverCtor = globalThis.PerformanceObserver;
    instances = [];

    globalThis.PerformanceObserver = jest.fn((cb: PerformanceObserverCallback) => {
      const inst = {
        callback: cb,
        disconnect: jest.fn(),
        observe: jest.fn(),
      };
      instances.push(inst);
      return inst as unknown as PerformanceObserver;
    }) as unknown as typeof PerformanceObserver;
  });

  afterEach(() => {
    globalThis.PerformanceObserver = ObserverCtor;
  });

  it('attaches a PerformanceObserver on first subscribe', () => {
    subscribeVSI(() => undefined);
    expect(instances.length).toBe(1);
    expect(instances[0].observe).toHaveBeenCalledWith({ type: 'layout-shift', buffered: true });
  });

  it('does not attach a second observer on subsequent subscribes', () => {
    subscribeVSI(() => undefined);
    subscribeVSI(() => undefined);
    expect(instances.length).toBe(1);
  });

  it('filters out entries with hadRecentInput', () => {
    const listener = jest.fn();
    subscribeVSI(listener);

    const entry = {
      value: 0.1,
      startTime: 100,
      hadRecentInput: true,
      sources: undefined,
    };

    act(() => {
      instances[0].callback(
        makeEntryList([entry as unknown as PerformanceEntry]),
        instances[0] as unknown as PerformanceObserver,
      );
    });

    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ value: 0.1 }));
  });

  it('broadcasts entries without hadRecentInput', () => {
    const listener = jest.fn();
    subscribeVSI(listener);

    const entry = {
      value: 0.05,
      startTime: 200,
      hadRecentInput: false,
      sources: [
        {
          node: makeElement('div', { id: 'shifty' }),
          currentRect: makeRect(100, 50),
          previousRect: makeRect(100, 50),
        },
      ],
    };

    act(() => {
      instances[0].callback(
        makeEntryList([entry as unknown as PerformanceEntry]),
        instances[0] as unknown as PerformanceObserver,
      );
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 0.05,
        source: expect.objectContaining({ selector: '#shifty', heightPx: 50 }),
      }),
    );
  });

  it('gracefully degrades when PerformanceObserver throws', () => {
    globalThis.PerformanceObserver = jest.fn(() => {
      throw new Error('unsupported');
    }) as unknown as typeof PerformanceObserver;

    expect(() => subscribeVSI(() => undefined)).not.toThrow();
  });

  it('does not attach when PerformanceObserver is undefined', () => {
    // @ts-expect-error — simulate browser without PerformanceObserver
    globalThis.PerformanceObserver = undefined;
    subscribeVSI(() => undefined);
    expect(instances.length).toBe(0);
  });
});