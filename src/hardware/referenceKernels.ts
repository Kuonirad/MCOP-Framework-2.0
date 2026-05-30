// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Reference CPU kernels for the unified hot path.
 *
 * These are byte-for-byte ports of the NumPy reference implementations in
 * `mcop_cuda_server/kernels.py`. They are the deterministic CPU path the
 * {@link HotPathRouter} runs when no CUDA accelerator is wired, and — because
 * they match the Python reference exactly (RFC 8785 canonical encoding for the
 * provenance) — they are also the cross-runtime parity baseline a GPU
 * implementation must reproduce.
 *
 * Keep these in lock-step with `kernels.py`. The forthcoming conformance spec
 * (advance #4) will pin both sides against shared golden fixtures.
 */

const GELU_C = Math.sqrt(2 / Math.PI);

export interface EncodePayload {
  tensor: number[];
  bias?: number;
}
export interface EncodeResult {
  output: number[];
  dtype: 'float32';
  size: number;
}

/** NOVA-NEO encode: GELU-ish activation + bias. Matches `_encode`. */
export function encodeKernel(payload: EncodePayload): EncodeResult {
  const bias = payload.bias ?? 0;
  const output = (payload.tensor ?? []).map(
    (v) => v * 0.5 * (1 + Math.tanh(GELU_C * (v + 0.044715 * v ** 3))) + bias,
  );
  return { output, dtype: 'float32', size: output.length };
}

export interface RecallPayload {
  query: number[];
  /** Library rows. Each row is compared to `query`. */
  library: number[][];
}
export interface RecallResult {
  scores: number[];
}

/** Cosine recall: cosine similarity of `query` against each library row. Matches `_cosine_recall`. */
export function cosineRecallKernel(payload: RecallPayload): RecallResult {
  const query = payload.query ?? [];
  const items = payload.library ?? [];
  if (query.length === 0) return { scores: items.map(() => 0) };
  const qmag = Math.sqrt(query.reduce((s, v) => s + v * v, 0)) || 1;
  const scores = items.map((row) => {
    const mag = Math.sqrt(row.reduce((s, v) => s + v * v, 0)) || 1;
    const common = Math.min(row.length, query.length);
    let dot = 0;
    for (let k = 0; k < common; k += 1) dot += row[k] * query[k];
    return dot / (qmag * mag);
  });
  return { scores };
}

export interface EtchPayload {
  context: number[];
  synthesis: number[];
}
export interface EtchResult {
  output: number[];
  rows: number;
  cols: number;
}

/** Holographic update: outer product context ⊗ synthesis, row-major. Matches `_holographic_update`. */
export function holographicUpdateKernel(payload: EtchPayload): EtchResult {
  const context = payload.context ?? [];
  const synthesis = payload.synthesis ?? [];
  const rows = context.length;
  const cols = synthesis.length;
  const output = new Array<number>(rows * cols).fill(0);
  for (let r = 0; r < rows; r += 1) {
    const cr = context[r];
    if (cr === 0) continue;
    for (let c = 0; c < cols; c += 1) output[r * cols + c] = cr * synthesis[c];
  }
  return { output, rows, cols };
}

export interface EvolveCandidate {
  score?: number;
  vector?: number[];
}
export interface EvolvePayload {
  candidates: Array<EvolveCandidate | number>;
}
export interface EvolveResult {
  scores: number[];
}

/** Evolve score: base score nudged by vector magnitude. Matches `_evolve_score`. */
export function evolveScoreKernel(payload: EvolvePayload): EvolveResult {
  const scores = (payload.candidates ?? []).map((c) => {
    if (typeof c === 'number') return c;
    let base = c.score ?? 0;
    if (c.vector && c.vector.length > 0) {
      base += Math.sqrt(c.vector.reduce((s, v) => s + v * v, 0)) * 1e-6;
    }
    return base;
  });
  return { scores };
}

export interface HomeostasisPayload {
  state: number[];
  decay?: number;
  floor?: number;
  ceil?: number;
}
export interface HomeostasisResult {
  output: number[];
  decay: number;
  floor: number;
  ceil: number;
}

/** Homeostasis: decay toward zero, clamped to [floor, ceil]. Matches `_homeostasis`. */
export function homeostasisKernel(payload: HomeostasisPayload): HomeostasisResult {
  const decay = payload.decay ?? 0.98;
  const floor = payload.floor ?? -1;
  const ceil = payload.ceil ?? 1;
  const output = (payload.state ?? []).map((v) => Math.max(floor, Math.min(ceil, v * decay)));
  return { output, decay, floor, ceil };
}
