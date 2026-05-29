// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Inter-rater reliability for the pre-registered efficacy program.
 *
 * "Multi-rater" is not decoration: a single rater's judgement is unfalsifiable
 * — it could be idiosyncratic, biased, or quietly correlated with the very
 * machinery under test. Requiring several independent raters and *measuring
 * their agreement* converts "the output looked better to me" into a quantity
 * with a known reliability floor.
 *
 * Krippendorff's alpha is the right tool: it handles any number of raters,
 * tolerates missing ratings (a rater may skip an item), and works for nominal
 * or interval scales. α = 1 is perfect agreement, α = 0 is agreement no better
 * than chance, α < 0 is systematic disagreement. Krippendorff's customary floor
 * for drawing tentative conclusions is α ≥ 0.667; the efficacy program treats
 * the floor as a *gate*: below it, the efficacy verdict is `inconclusive`
 * regardless of effect size, because the raters have not earned the right to
 * adjudicate.
 */

export type ReliabilityMetric = 'nominal' | 'interval';

/**
 * Ratings indexed as `ratings[unit][rater]`. A `null`/`undefined`/`NaN` cell is
 * a missing rating and is excluded pairwise (not imputed).
 */
export type RatingMatrix = ReadonlyArray<ReadonlyArray<number | null | undefined>>;

export interface ReliabilityReport {
  /** Krippendorff's alpha across all units and raters. */
  alpha: number;
  metric: ReliabilityMetric;
  /** Units that contributed (had ≥ 2 present ratings). */
  usableUnits: number;
  /** Total pairable values across usable units. */
  pairableValues: number;
  observedDisagreement: number;
  expectedDisagreement: number;
}

function distance(a: number, b: number, metric: ReliabilityMetric): number {
  if (metric === 'interval') {
    const d = a - b;
    return d * d;
  }
  return a === b ? 0 : 1;
}

/**
 * Computes Krippendorff's alpha from a unit × rater rating matrix.
 *
 * Implementation follows the coincidence-matrix form: each unit with `m ≥ 2`
 * present ratings contributes its ordered pairs weighted by `1/(m − 1)`, giving
 * the coincidence counts `o`. With value marginals `n_c` and total `n`:
 *
 *   D_o = (1/n)        · Σ_c Σ_k o_ck · δ²(c,k)
 *   D_e = (1/(n(n−1))) · Σ_c Σ_k n_c · n_k · δ²(c,k)
 *   α   = 1 − D_o / D_e
 */
export function krippendorffAlpha(
  ratings: RatingMatrix,
  metric: ReliabilityMetric = 'interval',
): ReliabilityReport {
  // Coincidence matrix keyed by value pair. Each unit with m ≥ 2 present
  // ratings contributes its m(m−1) ordered off-diagonal pairs, each weighted
  // by 1/(m−1) so a unit's total mass is independent of how many raters scored
  // it. Marginals n_c are exact row sums of this matrix.
  const coincidence = new Map<number, Map<number, number>>();
  const marginal = new Map<number, number>();
  let usableUnits = 0;

  const bump = (c: number, k: number, w: number) => {
    let row = coincidence.get(c);
    if (!row) {
      row = new Map<number, number>();
      coincidence.set(c, row);
    }
    row.set(k, (row.get(k) ?? 0) + w);
  };

  for (const unit of ratings) {
    const present: number[] = [];
    for (const cell of unit) {
      if (typeof cell === 'number' && Number.isFinite(cell)) present.push(cell);
    }
    const m = present.length;
    if (m < 2) continue; // a single rating cannot disagree with anything
    usableUnits += 1;
    const w = 1 / (m - 1);
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < m; j += 1) {
        if (i === j) continue;
        bump(present[i], present[j], w);
      }
    }
  }
  for (const [c, row] of coincidence) {
    let rowSum = 0;
    for (const v of row.values()) rowSum += v;
    marginal.set(c, rowSum);
  }

  let n = 0;
  for (const v of marginal.values()) n += v;

  if (usableUnits === 0 || n < 2) {
    return {
      alpha: 1,
      metric,
      usableUnits,
      pairableValues: Math.round(n),
      observedDisagreement: 0,
      expectedDisagreement: 0,
    };
  }

  const values = [...marginal.keys()];

  let observedNum = 0;
  for (const c of values) {
    const row = coincidence.get(c);
    if (!row) continue;
    for (const k of values) {
      const o = row.get(k) ?? 0;
      if (o === 0) continue;
      observedNum += o * distance(c, k, metric);
    }
  }
  const observedDisagreement = observedNum / n;

  let expectedNum = 0;
  for (const c of values) {
    const nc = marginal.get(c) ?? 0;
    for (const k of values) {
      const nk = marginal.get(k) ?? 0;
      expectedNum += nc * nk * distance(c, k, metric);
    }
  }
  const expectedDisagreement = expectedNum / (n * (n - 1));

  const alpha = expectedDisagreement === 0 ? 1 : 1 - observedDisagreement / expectedDisagreement;

  return {
    alpha,
    metric,
    usableUnits,
    pairableValues: Math.round(n),
    observedDisagreement,
    expectedDisagreement,
  };
}

/**
 * Simple pairwise percent agreement (exact matches over comparable pairs).
 * Reported alongside alpha as an intuition aid; never used as the gate, because
 * raw agreement ignores chance.
 */
export function percentAgreement(ratings: RatingMatrix): number {
  let agree = 0;
  let total = 0;
  for (const unit of ratings) {
    const present: number[] = [];
    for (const cell of unit) {
      if (typeof cell === 'number' && Number.isFinite(cell)) present.push(cell);
    }
    for (let i = 0; i < present.length; i += 1) {
      for (let j = i + 1; j < present.length; j += 1) {
        total += 1;
        if (present[i] === present[j]) agree += 1;
      }
    }
  }
  return total === 0 ? 1 : agree / total;
}
