/**
 * Elite Testing Suite — VectorMath core library.
 *
 * Covers correctness, edge cases, and a lightweight property-based sweep
 * driven by a seeded Mulberry32 PRNG (no external deps). Every test uses
 * deterministic inputs so failures are reproducible.
 */

import {
  cosine,
  cosineWithMagnitudes,
  dot,
  magnitude,
  normalizeInPlace,
  variance,
} from '../core/vectorMath';

function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomVector(rand: () => number, len: number, range = 1): number[] {
  const out: number[] = new Array(len);
  for (let i = 0; i < len; i++) out[i] = (rand() * 2 - 1) * range;
  return out;
}

describe('VectorMath — magnitude', () => {
  it('returns 0 for the empty and zero vectors', () => {
    expect(magnitude([])).toBe(0);
    expect(magnitude([0, 0, 0])).toBe(0);
  });

  it('matches the analytic L2 norm', () => {
    expect(magnitude([3, 4])).toBeCloseTo(5, 10);
    expect(magnitude([1, 2, 2])).toBeCloseTo(3, 10);
  });

  it('is non-negative for random vectors (property)', () => {
    const rand = seeded(0xabc123);
    for (let i = 0; i < 50; i++) {
      const v = randomVector(rand, 32, 10);
      expect(magnitude(v)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('VectorMath — dot & cosine', () => {
  it('dot tolerates ragged inputs using the shorter length', () => {
    expect(dot([1, 2, 3, 4], [1, 1])).toBe(3);
  });

  it('cosine of identical vectors is 1, orthogonal is 0', () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 10);
    expect(cosine([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 10);
  });

  it('cosine returns 0 when either magnitude is zero', () => {
    expect(cosineWithMagnitudes([1, 2], [1, 2], 0, 1)).toBe(0);
    expect(cosineWithMagnitudes([1, 2], [1, 2], 1, 0)).toBe(0);
  });

  it('cosine is bounded in [-1, 1] for random inputs (property)', () => {
    const rand = seeded(0xdeadbeef);
    for (let i = 0; i < 100; i++) {
      const a = randomVector(rand, 16);
      const b = randomVector(rand, 16);
      const c = cosine(a, b);
      expect(c).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(c).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('VectorMath — normalizeInPlace', () => {
  it('produces a unit-length vector', () => {
    const v = [3, 4];
    normalizeInPlace(v);
    expect(magnitude(v)).toBeCloseTo(1, 10);
  });

  it('leaves zero vectors untouched', () => {
    const v = [0, 0, 0];
    expect(normalizeInPlace(v)).toBe(0);
    expect(v).toEqual([0, 0, 0]);
  });
});

describe('VectorMath — variance', () => {
  it('returns 0 for constant-magnitude inputs', () => {
    expect(variance([1, 1, 1, 1])).toBeCloseTo(0, 10);
  });

  it('never returns negative values even under rounding (property)', () => {
    const rand = seeded(0x1234);
    for (let i = 0; i < 50; i++) {
      const v = randomVector(rand, 64, 1e-9);
      expect(variance(v)).toBeGreaterThanOrEqual(0);
    }
  });
});
