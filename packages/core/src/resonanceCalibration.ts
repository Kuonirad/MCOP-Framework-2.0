// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Resonance calibration — closed-form noise floor for stigmergic memory.
 *
 * The hash backend (`NovaNeoEncoder` with `backend: 'hash' | 'novaNeoWeb'`)
 * is tamper-evident, content-addressed *exact-match* memory: two different
 * texts produce statistically independent tensors, so any non-trivial cosine
 * similarity between them is pure noise. That noise has a derivable
 * distribution, which means the resonance threshold does not need to be a
 * magic constant — it can be computed from first principles.
 *
 * Null model
 * ----------
 * A hash tensor is 32 SHA-256 bytes mapped affinely onto [-1, 1] and tiled to
 * the configured dimensionality. Tiling adds no information: the cosine of
 * two tiled tensors equals the cosine of the underlying 32-vectors, so the
 * *effective* dimensionality M is `min(dimensions, 32)`. For two independent
 * texts the components are i.i.d., zero-mean, and the cosine score is
 * asymptotically Normal(0, 1/M).
 *
 * `StigmergyV5.getResonance` takes the best score over up to n buffered
 * traces, so the spurious-match ("false resonance") probability is
 *
 *     P(false resonance) = 1 − Φ(τ·√M)^n
 *
 * Inverting for a target budget α gives the analytic threshold
 *
 *     τ(M, α, n) = Φ⁻¹((1 − α)^(1/n)) / √M
 *
 * Calibration of the legacy constant
 * ----------------------------------
 * The historical default τ = 0.65 was uncalibrated. Under this null model
 * with M = 32 and a full default buffer (n = 2048) it admits a 21.5%
 * false-resonance rate per query (Gaussian estimate; Monte Carlo with real
 * SHA-256 tensors measures ≈ 5.6% — the uniform-component cosine has
 * sub-Gaussian tails, so the closed form is a conservative upper bound).
 * The calibrated default, τ(32, 0.01, 2048) ≈ 0.7816, bounds the rate at
 * α = 1% analytically and measured ≈ 0% empirically.
 *
 * The embedding backend produces correlated (semantic) tensors, so this null
 * model only bounds its *unrelated-text* noise floor; pass the true tensor
 * dimensionality via `effectiveTensorDimensions('embedding', d)`.
 *
 * See `docs/RESONANCE_CALIBRATION.md` for the full derivation and the
 * reproduction script for the Monte Carlo figures.
 */

/** SHA-256 emits 32 bytes; tiling beyond 32 dimensions adds no information. */
export const SHA256_TENSOR_DIMENSIONS = 32;

/** Default family-wise false-resonance budget per query (α). */
export const DEFAULT_FALSE_RESONANCE_ALPHA = 0.01;

/**
 * The pre-calibration default threshold, kept only as a named reference for
 * migration notes and regression tests. Do not use for new configuration —
 * prefer `analyticThreshold`.
 */
export const LEGACY_RESONANCE_THRESHOLD = 0.65;

export type EncoderBackendKind = 'hash' | 'embedding' | 'novaNeoWeb';

export interface NoiseFloorOptions {
  /** False-resonance budget α per query in (0, 1). Default 0.01. */
  alpha?: number;
  /**
   * Number of candidate traces the best score is taken over (buffer
   * occupancy/capacity). More candidates ⇒ more chances for spurious
   * resonance ⇒ higher floor. Default 1.
   */
  candidates?: number;
}

/**
 * Effective i.i.d. dimensionality of an encoder's output under the
 * unrelated-text null model. Hash-family backends tile 32 SHA-256 bytes, so
 * their effective dimensionality saturates at 32 regardless of the configured
 * tensor size.
 */
export function effectiveTensorDimensions(
  backend: EncoderBackendKind,
  dimensions: number,
): number {
  const safe = Number.isFinite(dimensions) && dimensions >= 1 ? Math.floor(dimensions) : 1;
  if (backend === 'embedding') return safe;
  return Math.min(safe, SHA256_TENSOR_DIMENSIONS);
}

/**
 * Closed-form resonance threshold τ(M, α, n) = Φ⁻¹((1−α)^(1/n)) / √M.
 *
 * Returns the smallest cosine score that bounds the probability of *any*
 * spurious match among `candidates` unrelated traces at `alpha`, clamped to
 * [0, 1] (an M small enough to push τ past 1 means no threshold can meet the
 * budget — exact-match memory at that size cannot reject noise).
 */
export function analyticThreshold(
  effectiveDimensions: number,
  options: NoiseFloorOptions = {},
): number {
  const M = Number.isFinite(effectiveDimensions) && effectiveDimensions >= 1
    ? Math.floor(effectiveDimensions)
    : 1;
  const alpha = clampOpenUnit(options.alpha ?? DEFAULT_FALSE_RESONANCE_ALPHA);
  const n = Number.isFinite(options.candidates) && (options.candidates as number) >= 1
    ? Math.floor(options.candidates as number)
    : 1;
  // Per-candidate quantile via Šidák: p = (1−α)^(1/n), computed in log space
  // so n in the thousands keeps full precision.
  const p = Math.exp(Math.log1p(-alpha) / n);
  const z = inverseNormalCdf(p);
  const tau = z / Math.sqrt(M);
  if (tau <= 0) return 0;
  if (tau >= 1) return 1;
  return tau;
}

/**
 * Gaussian-null-model false-resonance probability for a given threshold:
 * P(best-of-n cosine ≥ τ) = 1 − Φ(τ·√M)^n. Conservative (upper bound) for
 * hash tensors, whose cosine tails are sub-Gaussian.
 */
export function falseResonanceRate(
  threshold: number,
  effectiveDimensions: number,
  candidates = 1,
): number {
  const M = Number.isFinite(effectiveDimensions) && effectiveDimensions >= 1
    ? Math.floor(effectiveDimensions)
    : 1;
  const n = Number.isFinite(candidates) && candidates >= 1 ? Math.floor(candidates) : 1;
  const phi = normalCdf(threshold * Math.sqrt(M));
  // log-space power keeps precision when Φ is within ulps of 1.
  return -Math.expm1(n * Math.log(phi));
}

/**
 * Standard normal CDF Φ(z) via the Abramowitz & Stegun 7.1.26 rational
 * approximation of erf (|error| ≤ 1.5e-7). Deterministic and dependency-free,
 * matching the portability constraints of the rest of the core.
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/**
 * Standard normal quantile Φ⁻¹(p) via Acklam's rational approximation
 * (relative error < 1.15e-9 across the full open unit interval, including the
 * deep tails this module queries). Deterministic and dependency-free.
 */
export function inverseNormalCdf(p: number): number {
  if (!(p > 0 && p < 1)) {
    throw new Error(`inverseNormalCdf: p must be in (0, 1), got ${p}`);
  }
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function clampOpenUnit(alpha: number): number {
  if (!Number.isFinite(alpha)) return DEFAULT_FALSE_RESONANCE_ALPHA;
  if (alpha <= 0) return Number.MIN_VALUE;
  if (alpha >= 1) return 1 - Number.EPSILON;
  return alpha;
}
