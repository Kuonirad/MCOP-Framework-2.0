/**
 * VectorMath — zero-duplication numeric primitives used across the MCOP triad.
 *
 * All functions are branch-light, allocation-free where possible, and safe for
 * hot paths (encoder, stigmergy scoring, etch accumulation). Results are
 * deterministic: identical inputs always produce identical outputs.
 */

export type Vec = ArrayLike<number>;

/** Euclidean magnitude (L2 norm) of a vector. */
export function magnitude(v: Vec): number {
  const len = v.length;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const x = v[i];
    sumSq += x * x;
  }
  return Math.sqrt(sumSq);
}

export function assertSameLength(a: Vec, b: Vec, operation = 'vector operation'): void {
  if (a.length !== b.length) {
    throw new Error(
      `${operation} requires equal vector dimensions; received ${a.length} and ${b.length}`,
    );
  }
}

/**
 * Dot product with deterministic zero-padding for ragged inputs. This keeps
 * heterogeneous embeddings composable without silently changing magnitude.
 */
export function dot(a: Vec, b: Vec): number {
  const minLen = a.length < b.length ? a.length : b.length;
  let acc = 0;
  for (let i = 0; i < minLen; i++) {
    acc += a[i] * b[i];
  }
  return acc;
}

export function padVector(v: Vec, length: number): number[] {
  if (!Number.isInteger(length) || length < 0) {
    throw new Error('padVector length must be a non-negative integer');
  }
  const out = new Array<number>(length).fill(0);
  const take = Math.min(v.length, length);
  for (let i = 0; i < take; i++) out[i] = v[i];
  return out;
}

/**
 * Cosine similarity with explicit pre-computed magnitudes. Returns 0 whenever
 * either vector is zero-magnitude, consistent with the triad's safe-default
 * policy of never producing NaN on degenerate input.
 */
export function cosineWithMagnitudes(
  a: Vec,
  b: Vec,
  magA: number,
  magB: number,
): number {
  if (!magA || !magB) return 0;
  return dot(a, b) / (magA * magB);
}

/** Standard cosine similarity; computes magnitudes internally. */
export function cosine(a: Vec, b: Vec): number {
  return cosineWithMagnitudes(a, b, magnitude(a), magnitude(b));
}

/**
 * Normalize in-place to unit length. If the vector is zero-magnitude the
 * values are left untouched (normalization is undefined on the zero vector).
 * Returns the computed magnitude so callers can cache it.
 */
export function normalizeInPlace(v: number[] | Float64Array): number {
  const mag = magnitude(v);
  if (!mag) return 0;
  const len = v.length;
  for (let i = 0; i < len; i++) {
    v[i] /= mag;
  }
  return mag;
}

/**
 * Single-pass variance using the E[X^2] - (E[X])^2 identity. Floating-point
 * rounding can produce tiny negative values near zero; those are clamped to 0.
 */
export function variance(v: Vec): number {
  const len = v.length;
  if (!len) return 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const val = Math.abs(v[i]);
    sum += val;
    sumSq += val * val;
  }
  const mean = sum / len;
  const result = sumSq / len - mean * mean;
  return result < 0 ? 0 : result;
}
