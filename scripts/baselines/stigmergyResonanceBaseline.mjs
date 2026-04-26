#!/usr/bin/env node
// Linear-Scan Stigmergy Resonance Baseline.
//
// Pre-registration baseline measurement for the proposed
// "Resonance-Indexed Merkle Forest" extension. See
// docs/preregistrations/RESONANCE_INDEXED_MERKLE_FOREST.md for the
// metric/baseline/falsification/experiment definitions; this script
// produces the BASELINE numbers consumed there.
//
// Workload (all deterministic, seeded):
//   - Materialise 10 000 64-dim trace vectors (uniform [-1,1] per
//     component, Mulberry32 PRNG).
//   - Cache trace magnitudes once (mirrors `StigmergyV5.recordTrace`'s
//     `trace.magnitude` cache).
//   - Generate 1 000 query vectors with a different seed offset.
//   - Discard the first WARMUP_QUERIES results so V8 JIT settles, then
//     time the remaining QUERY_COUNT calls with `performance.now()`.
//
// The retrieval kernel below is the algorithmic equivalent of
// `StigmergyV5.getResonance` (linear scan, cosine via dot/(||a||·||b||),
// `Math.max` keeping the running argmax). It is intentionally inlined
// here so the baseline script does not depend on the TypeScript build
// pipeline (no `tsx`, no compiled package). The canonical production
// implementation lives in src/core/stigmergyV5.ts; any deviation between
// this kernel and the production class would itself be a bug — the
// pre-registration doc lists "baseline-vs-production drift" as a
// non-falsifying invalidation condition.
//
// Output:
//   - Prints a compact summary to stdout.
//   - Writes the structured baseline JSON to
//     docs/preregistrations/baseline_results.json.
//   - Writes the linear-scan top-1 trace ids per query to
//     docs/preregistrations/baseline_ground_truth.json. The proposed
//     indexed alternative's recall@1 is later defined as "fraction of
//     queries whose top-1 trace id matches this list."
//
// Run:  pnpm baseline:stigmergy

import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const SEED = 0x4D434F50;
const TRACE_COUNT = 10_000;
const QUERY_COUNT = 1_000;
const DIMENSIONS = 64;
const WARMUP_QUERIES = 50;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomVector(rng, dim) {
  const v = new Array(dim);
  for (let i = 0; i < dim; i++) v[i] = rng() * 2 - 1;
  return v;
}

function magnitude(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function quantile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

// Linear-scan resonance kernel — algorithmic mirror of
// `StigmergyV5.getResonance` (with the magnitude cache populated at
// insert time and a tied-score policy of "first-wins"). Returns the
// top-1 trace id and its cosine score.
function resonance(query, queryMag, traces, traceMags, traceIds) {
  let bestScore = -Infinity;
  let bestId = null;
  if (queryMag === 0) return { score: 0, id: null };
  const n = traces.length;
  for (let t = 0; t < n; t++) {
    const tm = traceMags[t];
    if (tm === 0) continue;
    const trace = traces[t];
    let dot = 0;
    for (let i = 0; i < DIMENSIONS; i++) dot += query[i] * trace[i];
    const score = dot / (queryMag * tm);
    if (score > bestScore) {
      bestScore = score;
      bestId = traceIds[t];
    }
  }
  return { score: bestScore === -Infinity ? 0 : bestScore, id: bestId };
}

function main() {
  process.stdout.write(
    `Linear-Scan Stigmergy Baseline | seed=0x${SEED.toString(16)} traces=${TRACE_COUNT} queries=${QUERY_COUNT} dim=${DIMENSIONS}\n`,
  );

  const rng = mulberry32(SEED);
  const traces = new Array(TRACE_COUNT);
  const traceMags = new Array(TRACE_COUNT);
  const traceIds = new Array(TRACE_COUNT);

  const insertStart = performance.now();
  for (let i = 0; i < TRACE_COUNT; i++) {
    const v = randomVector(rng, DIMENSIONS);
    traces[i] = v;
    traceMags[i] = magnitude(v);
    traceIds[i] = `trace-${i}`;
  }
  const insertWallMs = performance.now() - insertStart;

  const queryRng = mulberry32(SEED ^ 0x1);
  const queries = [];
  const queryMags = [];
  for (let i = 0; i < QUERY_COUNT + WARMUP_QUERIES; i++) {
    const q = randomVector(queryRng, DIMENSIONS);
    queries.push(q);
    queryMags.push(magnitude(q));
  }

  for (let i = 0; i < WARMUP_QUERIES; i++) {
    resonance(queries[i], queryMags[i], traces, traceMags, traceIds);
  }

  const latenciesUs = new Array(QUERY_COUNT);
  const top1TraceIds = new Array(QUERY_COUNT);
  let nonNullResults = 0;
  for (let i = 0; i < QUERY_COUNT; i++) {
    const q = queries[WARMUP_QUERIES + i];
    const qm = queryMags[WARMUP_QUERIES + i];
    const t0 = performance.now();
    const result = resonance(q, qm, traces, traceMags, traceIds);
    const t1 = performance.now();
    latenciesUs[i] = (t1 - t0) * 1000;
    top1TraceIds[i] = result.id;
    if (result.id !== null) nonNullResults += 1;
  }

  latenciesUs.sort((a, b) => a - b);
  const totalUs = latenciesUs.reduce((s, v) => s + v, 0);
  const meanUs = totalUs / latenciesUs.length;
  const summary = {
    metadata: {
      seed: `0x${SEED.toString(16)}`,
      trace_count: TRACE_COUNT,
      query_count: QUERY_COUNT,
      warmup_queries: WARMUP_QUERIES,
      dimensions: DIMENSIONS,
      runtime: `node ${process.version}`,
      platform: `${process.platform}-${process.arch}`,
      timestamp_iso: new Date().toISOString(),
    },
    insert_phase: {
      total_wall_ms: Number(insertWallMs.toFixed(2)),
      mean_per_trace_us: Number(((insertWallMs * 1000) / TRACE_COUNT).toFixed(2)),
    },
    query_phase: {
      total_wall_ms: Number((totalUs / 1000).toFixed(2)),
      mean_us: Number(meanUs.toFixed(2)),
      p50_us: Number(quantile(latenciesUs, 0.5).toFixed(2)),
      p95_us: Number(quantile(latenciesUs, 0.95).toFixed(2)),
      p99_us: Number(quantile(latenciesUs, 0.99).toFixed(2)),
      max_us: Number(latenciesUs[latenciesUs.length - 1].toFixed(2)),
      throughput_qps: Number(((QUERY_COUNT * 1000) / (totalUs / 1000)).toFixed(0)),
      non_null_results: nonNullResults,
    },
    recall_ground_truth: {
      definition:
        'recall@1 of any indexed alternative is the fraction of queries whose top-1 trace id matches the linear-scan top-1 captured in baseline_ground_truth.json',
      ground_truth_path: 'baseline_ground_truth.json',
      query_count: top1TraceIds.length,
    },
  };

  console.log('insert_phase:', summary.insert_phase);
  console.log('query_phase:', summary.query_phase);

  const outDir = join(REPO_ROOT, 'docs', 'preregistrations');
  mkdirSync(outDir, { recursive: true });
  const summaryPath = join(outDir, 'baseline_results.json');
  const groundTruthPath = join(outDir, 'baseline_ground_truth.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  writeFileSync(
    groundTruthPath,
    JSON.stringify({ top1_trace_ids: top1TraceIds }, null, 2) + '\n',
    'utf8',
  );
  console.log(`wrote baseline summary -> ${summaryPath}`);
  console.log(`wrote ground-truth top-1 ids -> ${groundTruthPath}`);
}

main();
