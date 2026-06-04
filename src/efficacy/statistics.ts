// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Distribution-free effect-size statistics for the pre-registered
 * efficacy program.
 *
 * The efficacy program asks a question the {@link NovaEvolveTuner} cannot ask
 * of itself: does a tuned genome produce *better reasoning* on held-out work,
 * not merely better-attested reasoning? Answering that requires inference, not
 * a fit-to-target heuristic. The estimators here are deliberately:
 *
 *   - **Non-parametric.** Rater scores on a rubric scale are ordinal at best;
 *     we never assume normality. Cliff's delta and the Hodges–Lehmann shift are
 *     rank/pairwise estimators that survive ordinal data and outliers.
 *   - **Deterministic.** The bootstrap uses a seeded mulberry32 PRNG so a sealed
 *     pre-registration (which fixes the seed and resample count) yields a
 *     byte-identical confidence interval on replay — the same falsify-first
 *     determinism the rest of the framework enforces with Merkle roots.
 *
 * None of these functions can read the tuner's `scoreConfig`; they only see two
 * arrays of rater-derived numbers. That structural separation is the point.
 */

/** Deterministic 32-bit PRNG (mulberry32). Same seed ⇒ same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Cliff's delta: P(x > y) − P(x < y) over all pairs, in [−1, 1].
 *
 * A fully distribution-free measure of how often a draw from `treatment`
 * dominates a draw from `control`. δ = 0 means stochastic equality; δ = 1 means
 * every treatment value exceeds every control value. Magnitude bands follow
 * Romano et al. (2006).
 */
export function cliffsDelta(
  treatment: readonly number[],
  control: readonly number[],
): { delta: number; magnitude: 'negligible' | 'small' | 'medium' | 'large' } {
  const x = treatment.filter(isFiniteNumber);
  const y = control.filter(isFiniteNumber);
  if (x.length === 0 || y.length === 0) return { delta: 0, magnitude: 'negligible' };

  let greater = 0;
  let lesser = 0;
  for (const xi of x) {
    for (const yj of y) {
      if (xi > yj) greater += 1;
      else if (xi < yj) lesser += 1;
    }
  }
  const delta = (greater - lesser) / (x.length * y.length);
  const abs = Math.abs(delta);
  const magnitude =
    abs < 0.147 ? 'negligible' : abs < 0.33 ? 'small' : abs < 0.474 ? 'medium' : 'large';
  return { delta, magnitude };
}

/**
 * Hodges–Lehmann estimator of the location shift (treatment − control): the
 * median of all pairwise differences. Robust point estimate of the effect on
 * the original rubric scale.
 */
export function hodgesLehmannShift(
  treatment: readonly number[],
  control: readonly number[],
): number {
  const x = treatment.filter(isFiniteNumber);
  const y = control.filter(isFiniteNumber);
  if (x.length === 0 || y.length === 0) return 0;
  const diffs: number[] = [];
  for (const xi of x) for (const yj of y) diffs.push(xi - yj);
  return median(diffs);
}

/**
 * Mann–Whitney U with tie correction and a two-sided normal approximation for
 * the p-value. Reported as a secondary signal; the bootstrap CI on the effect
 * size is the primary inference, per the pre-registered analysis plan.
 */
export function mannWhitneyU(
  treatment: readonly number[],
  control: readonly number[],
): { u: number; z: number; pValue: number } {
  const x = treatment.filter(isFiniteNumber);
  const y = control.filter(isFiniteNumber);
  const n1 = x.length;
  const n2 = y.length;
  if (n1 === 0 || n2 === 0) return { u: 0, z: 0, pValue: 1 };

  const combined = [
    ...x.map((v) => ({ v, group: 0 })),
    ...y.map((v) => ({ v, group: 1 })),
  ].sort((a, b) => a.v - b.v);

  // Assign average (fractional) ranks to ties.
  const ranks = new Array<number>(combined.length);
  let tieCorrection = 0;
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j += 1;
    const avgRank = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k += 1) ranks[k] = avgRank;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t * t * t - t;
    i = j + 1;
  }

  let rankSum1 = 0;
  for (let k = 0; k < combined.length; k += 1) {
    if (combined[k].group === 0) rankSum1 += ranks[k];
  }

  const u1 = rankSum1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  const n = n1 + n2;
  const meanU = (n1 * n2) / 2;
  const varU = (n1 * n2 / 12) * (n + 1 - tieCorrection / (n * (n - 1)));
  if (varU <= 0) return { u, z: 0, pValue: 1 };
  // Continuity-corrected z.
  const z = (Math.abs(u1 - meanU) - 0.5) / Math.sqrt(varU);
  const pValue = clamp01(2 * (1 - normalCdf(Math.abs(z))));
  return { u, z, pValue };
}

/**
 * Percentile bootstrap confidence interval for a chosen effect estimator.
 *
 * Resamples both arms with replacement `resamples` times using the seeded PRNG,
 * recomputes the estimator each time, and returns the empirical percentile
 * interval at `ciLevel`. Determinism: identical (seed, resamples, inputs) ⇒
 * identical interval.
 */
export function bootstrapCI(
  treatment: readonly number[],
  control: readonly number[],
  estimator: (t: readonly number[], c: readonly number[]) => number,
  options: { resamples?: number; ciLevel?: number; seed?: number } = {},
): { point: number; lower: number; upper: number; ciLevel: number; resamples: number } {
  const resamples = Math.max(1, Math.floor(options.resamples ?? 2000));
  const ciLevel = clamp(options.ciLevel ?? 0.95, 0.5, 0.999);
  const seed = (options.seed ?? 0x5eed) >>> 0;

  const x = treatment.filter(isFiniteNumber);
  const y = control.filter(isFiniteNumber);
  const point = estimator(x, y);
  if (x.length === 0 || y.length === 0) {
    return { point, lower: point, upper: point, ciLevel, resamples };
  }

  const rng = mulberry32(seed);
  const sampleFrom = (arr: readonly number[]): number[] => {
    const out = new Array<number>(arr.length);
    for (let k = 0; k < arr.length; k += 1) {
      out[k] = arr[Math.floor(rng() * arr.length)];
    }
    return out;
  };

  const estimates = new Array<number>(resamples);
  for (let b = 0; b < resamples; b += 1) {
    estimates[b] = estimator(sampleFrom(x), sampleFrom(y));
  }
  estimates.sort((a, b) => a - b);

  const tail = (1 - ciLevel) / 2;
  const lower = percentile(estimates, tail);
  const upper = percentile(estimates, 1 - tail);
  return { point, lower, upper, ciLevel, resamples };
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Abramowitz & Stegun 7.1.26 approximation of the standard normal CDF. */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
