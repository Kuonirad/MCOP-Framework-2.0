// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  bootstrapCI,
  cliffsDelta,
  hodgesLehmannShift,
  mannWhitneyU,
  mean,
  median,
  mulberry32,
} from '../efficacy/statistics';

describe('efficacy statistics', () => {
  describe('mulberry32', () => {
    it('is deterministic for a fixed seed', () => {
      const a = mulberry32(12345);
      const b = mulberry32(12345);
      const seqA = [a(), a(), a(), a()];
      const seqB = [b(), b(), b(), b()];
      expect(seqA).toEqual(seqB);
      expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
    });

    it('diverges for different seeds', () => {
      expect(mulberry32(1)()).not.toEqual(mulberry32(2)());
    });
  });

  describe('mean / median', () => {
    it('computes mean and median, including the even-length midpoint', () => {
      expect(mean([1, 2, 3, 4])).toBe(2.5);
      expect(median([3, 1, 2])).toBe(2);
      expect(median([4, 1, 3, 2])).toBe(2.5);
      expect(median([])).toBe(0);
    });
  });

  describe('cliffsDelta', () => {
    it('is -1 when every treatment value is below control', () => {
      const { delta, magnitude } = cliffsDelta([1, 2, 3], [4, 5, 6]);
      expect(delta).toBe(-1);
      expect(magnitude).toBe('large');
    });

    it('is +1 when treatment dominates control', () => {
      expect(cliffsDelta([4, 5, 6], [1, 2, 3]).delta).toBe(1);
    });

    it('is 0 / negligible for identical distributions', () => {
      const { delta, magnitude } = cliffsDelta([1, 2, 3], [1, 2, 3]);
      expect(delta).toBe(0);
      expect(magnitude).toBe('negligible');
    });

    it('classifies a known intermediate effect', () => {
      // [2,3,4] vs [1,2,3]: 6 pairs greater, 1 lesser, 2 equal → 5/9 ≈ 0.556.
      const { delta, magnitude } = cliffsDelta([2, 3, 4], [1, 2, 3]);
      expect(delta).toBeCloseTo(0.556, 3);
      expect(magnitude).toBe('large');
    });

    it('returns negligible on an empty arm', () => {
      expect(cliffsDelta([], [1, 2]).delta).toBe(0);
    });
  });

  describe('hodgesLehmannShift', () => {
    it('is the median of pairwise differences', () => {
      // diffs of [4,5,6] minus [1,2,3] sorted: [1,2,2,3,3,3,4,4,5] → median 3.
      expect(hodgesLehmannShift([4, 5, 6], [1, 2, 3])).toBe(3);
    });

    it('is 0 with an empty arm', () => {
      expect(hodgesLehmannShift([], [1])).toBe(0);
    });
  });

  describe('mannWhitneyU', () => {
    it('flags complete separation with a small two-sided p-value', () => {
      const { pValue } = mannWhitneyU([10, 11, 12, 13, 14], [1, 2, 3, 4, 5]);
      expect(pValue).toBeLessThan(0.05);
    });

    it('returns a clearly non-significant p for identical samples', () => {
      // Tiny tied samples + continuity correction keep this well above any
      // sane alpha; the point is "no detectable difference", not p exactly 1.
      const { pValue } = mannWhitneyU([1, 2, 3], [1, 2, 3]);
      expect(pValue).toBeGreaterThan(0.5);
    });

    it('handles an empty arm', () => {
      expect(mannWhitneyU([], [1, 2]).pValue).toBe(1);
    });
  });

  describe('bootstrapCI', () => {
    it('is deterministic for a fixed seed and resample count', () => {
      const est = (t: readonly number[], c: readonly number[]) => mean(t) - mean(c);
      const a = bootstrapCI([5, 6, 7, 8], [1, 2, 3, 4], est, { seed: 7, resamples: 500 });
      const b = bootstrapCI([5, 6, 7, 8], [1, 2, 3, 4], est, { seed: 7, resamples: 500 });
      expect(a).toEqual(b);
      expect(a.lower).toBeLessThanOrEqual(a.point);
      expect(a.upper).toBeGreaterThanOrEqual(a.point);
    });

    it('collapses to a point CI when the estimator is constant across resamples', () => {
      // Complete separation → every resample yields Cliff's delta = 1.
      const ci = bootstrapCI(
        [10, 11, 12],
        [1, 2, 3],
        (t, c) => cliffsDelta(t, c).delta,
        { seed: 1, resamples: 200 },
      );
      expect(ci.point).toBe(1);
      expect(ci.lower).toBe(1);
      expect(ci.upper).toBe(1);
    });

    it('produces a CI that excludes zero for a strong positive shift', () => {
      const ci = bootstrapCI(
        [8, 9, 10, 11, 12],
        [1, 2, 3, 4, 5],
        (t, c) => mean(t) - mean(c),
        { seed: 42, resamples: 1000 },
      );
      expect(ci.lower).toBeGreaterThan(0);
    });
  });
});
