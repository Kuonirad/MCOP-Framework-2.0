import { CircularBuffer } from '../core/circularBuffer';

describe('CircularBuffer', () => {
  it('rejects non-positive / non-integer capacity', () => {
    expect(() => new CircularBuffer<number>(0)).toThrow();
    expect(() => new CircularBuffer<number>(-1)).toThrow();
    expect(() => new CircularBuffer<number>(1.5)).toThrow();
  });

  it('tracks size, capacity, and lifetime pushes', () => {
    const buf = new CircularBuffer<number>(3);
    expect(buf.size).toBe(0);
    expect(buf.capacity).toBe(3);
    buf.push(1);
    buf.push(2);
    expect(buf.size).toBe(2);
    expect(buf.lifetimePushes).toBe(2);
  });

  it('evicts the oldest item and returns it from push when full', () => {
    const buf = new CircularBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.push(4)).toBe(1);
    expect(buf.push(5)).toBe(2);
    expect(buf.toArray()).toEqual([3, 4, 5]);
  });

  it('recent(limit) turns negative requests into an empty, safe query', () => {
    const buf = new CircularBuffer<number>(4);
    [10, 20, 30].forEach((v) => buf.push(v));
    expect(buf.recent(-1)).toEqual([]);
  });

  it('recent(limit) returns newest first up to size', () => {
    const buf = new CircularBuffer<number>(4);
    [10, 20, 30, 40, 50].forEach((v) => buf.push(v));
    expect(buf.recent(3)).toEqual([50, 40, 30]);
    expect(buf.recent(100)).toEqual([50, 40, 30, 20]);
  });

  it('last() returns the most recent item, undefined when empty', () => {
    const buf = new CircularBuffer<string>(2);
    expect(buf.last()).toBeUndefined();
    buf.push('a');
    buf.push('b');
    buf.push('c');
    expect(buf.last()).toBe('c');
  });

  it('clear() drops all items and resets state', () => {
    const buf = new CircularBuffer<number>(2);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.last()).toBeUndefined();
    expect(buf.toArray()).toEqual([]);
  });

  it('performs push in amortized O(1): 10k pushes finish quickly', () => {
    const buf = new CircularBuffer<number>(1000);
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) buf.push(i);
    const elapsed = performance.now() - t0;
    // Generous bound — demonstrates absence of O(n) shift-on-eviction.
    expect(elapsed).toBeLessThan(500);
    expect(buf.size).toBe(1000);
    expect(buf.lifetimePushes).toBe(10_000);
  });
});
