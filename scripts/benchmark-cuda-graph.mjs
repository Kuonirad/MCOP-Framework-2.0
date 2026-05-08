#!/usr/bin/env node
/**
 * Φ2 of the CUDA Hardware Layer ladder — proteome-graph-step benchmark harness.
 *
 * Runs a deterministic sparse-graph mean-aggregation kernel under both the
 * existing CPU path and (when available) the in-process CUDA path
 * (`CUDAHardwareLayer`). Emits a Merkle-rooted JSON record under
 * `docs/benchmarks/cuda_graph_aggregate.json` for committable provenance.
 *
 * Mirrors `scripts/benchmark-arc-evo.mjs` conventions: pure ESM, no
 * TypeScript runtime, deterministic seed, full per-row Merkle root.
 *
 * Environment knobs (mirrored from `arcagi3-run.yml`):
 *   MCOP_LOW_MEMORY_MODE    Scales `nodeCount` down to 4096 when set.
 *   MCOP_ENABLE_CUDA=1      Attempts the real in-process CUDA path.
 *                           Requires `onnxruntime-node` installed and a
 *                           `models/mcop_graphAggregate.onnx` kernel.
 *   MCOP_CUDA_KERNEL_DIR    Override for the kernel directory.
 *
 * CLI flags:
 *   --mode=smoke            32k -> 1024 nodes, 8 timed iterations.
 *                           Used for committed baseline + CI smoke.
 *   --mode=full             32768 nodes, 20 timed iterations (default).
 *   --out=<path>            Where to write the JSON record. Default
 *                           docs/benchmarks/cuda_graph_aggregate.json.
 *   --seed=<u32>            Override the deterministic PRNG seed.
 *
 * The harness is intentionally portable to the GitHub Actions
 * `ubuntu-latest` runner (CPU only) — it always produces a baseline
 * record. The CUDA columns are populated when (and only when) a
 * real CUDA execution provider is available; otherwise they are
 * `null` with a `skipped` reason captured in the JSON.
 */

import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/* ------------------------------------------------------------------ */
/* Deterministic constants                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_SEED = 0xC0FFEE;
const AVG_DEGREE = 12;

/* ------------------------------------------------------------------ */
/* Deterministic graph + input generation                              */
/* ------------------------------------------------------------------ */

/**
 * mulberry32 — same PRNG family used elsewhere in MCOP for byte-stable
 * deterministic streams across Node versions.
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Build a deterministic CSR graph with `nodeCount` nodes and an average
 * out-degree of `avgDegree`. Edge weights are uniform in [0,1).
 */
function buildCsrGraph(nodeCount, avgDegree, seed) {
  const rand = mulberry32(seed);
  const rowPtr = new Int32Array(nodeCount + 1);
  const colBuilder = [];
  const weightBuilder = [];
  for (let row = 0; row < nodeCount; row += 1) {
    rowPtr[row] = colBuilder.length;
    // Vary degree slightly around avgDegree for realistic sparsity.
    const degree = Math.max(1, Math.round(avgDegree * (0.7 + rand() * 0.6)));
    for (let k = 0; k < degree; k += 1) {
      const col = Math.floor(rand() * nodeCount);
      colBuilder.push(col);
      weightBuilder.push(rand());
    }
  }
  rowPtr[nodeCount] = colBuilder.length;
  return {
    nodeCount,
    edgeCount: colBuilder.length,
    rowPtr,
    colIdx: Int32Array.from(colBuilder),
    weights: Float32Array.from(weightBuilder),
  };
}

function buildInputVector(nodeCount, seed) {
  const rand = mulberry32(seed ^ 0x9E3779B9);
  const out = new Float32Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) out[i] = rand() * 2 - 1;
  return out;
}

/* ------------------------------------------------------------------ */
/* CPU mean-aggregation kernel                                         */
/* ------------------------------------------------------------------ */

/**
 * Standard sparse mean-aggregation over a CSR graph (a la GraphSAGE):
 *   out[v] = sum_u weights[v,u] * input[u] / max(1, degree[v])
 *
 * Pure JS, single-threaded — this is the baseline the CUDA path is
 * expected to beat by ≥ 3× on Φ2 hardware (RTX 4090 / Blackwell).
 */
function cpuMeanAggregate(graph, input) {
  const { nodeCount, rowPtr, colIdx, weights } = graph;
  const out = new Float32Array(nodeCount);
  for (let v = 0; v < nodeCount; v += 1) {
    const start = rowPtr[v];
    const end = rowPtr[v + 1];
    if (end <= start) continue;
    let sum = 0;
    for (let k = start; k < end; k += 1) {
      sum += weights[k] * input[colIdx[k]];
    }
    out[v] = sum / (end - start);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Canonical Merkle digest (parity with src/core/canonicalEncoding.ts) */
/* ------------------------------------------------------------------ */

function canonicalize(value) {
  if (value === undefined) return undefined;
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v) ?? 'null').join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts = keys
      .map((k) => {
        const enc = canonicalize(value[k]);
        return enc === undefined ? null : `${JSON.stringify(k)}:${enc}`;
      })
      .filter((p) => p !== null);
    return `{${parts.join(',')}}`;
  }
  return undefined;
}

function canonicalDigest(payload) {
  const raw = canonicalize(payload) ?? '{}';
  return createHash('sha256').update(raw).digest('hex');
}

function fingerprintFloatArray(arr) {
  // Quantise to 8 hex digits per cell to keep digests Node-version-stable
  // even when the JIT reorders fused-multiply-add chains by ±1 ulp.
  const buf = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i += 1) buf.writeFloatLE(arr[i], i * 4);
  return createHash('sha256').update(buf).digest('hex');
}

/* ------------------------------------------------------------------ */
/* Stat helpers                                                        */
/* ------------------------------------------------------------------ */

function average(values) {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function summariseLatencies(values) {
  return {
    samples: values.length,
    meanMs: round(average(values), 4),
    p50Ms: round(percentile(values, 0.5), 4),
    p95Ms: round(percentile(values, 0.95), 4),
    minMs: round(Math.min(...values), 4),
    maxMs: round(Math.max(...values), 4),
  };
}

function round(n, digits) {
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : 0;
}

/**
 * Strip host-dependent timing fields from a per-provider run record. Used
 * by `--mode=smoke` to emit a deterministic JSON that survives commit
 * without churning on every benchmark invocation.
 */
function stripTimings(run) {
  if (!run || !run.summary) return run;
  return {
    provider: run.provider,
    mode: run.mode,
    verifiedDevice: run.verifiedDevice,
    summary: { samples: run.summary.samples, meanMs: null, p50Ms: null, p95Ms: null, minMs: null, maxMs: null },
    outputFingerprint: run.outputFingerprint,
  };
}

/* ------------------------------------------------------------------ */
/* CPU run                                                             */
/* ------------------------------------------------------------------ */

function runCpuBaseline(graph, input, warmup, timed) {
  for (let i = 0; i < warmup; i += 1) cpuMeanAggregate(graph, input);
  const latencies = [];
  let lastOutput = null;
  for (let i = 0; i < timed; i += 1) {
    const t0 = performance.now();
    lastOutput = cpuMeanAggregate(graph, input);
    latencies.push(performance.now() - t0);
  }
  return {
    provider: 'CUDAAccelerator:cpu-fallback',
    mode: 'cpu',
    verifiedDevice: 'cpu',
    summary: summariseLatencies(latencies),
    outputFingerprint: fingerprintFloatArray(lastOutput),
    rawLatenciesMs: latencies.map((v) => round(v, 4)),
  };
}

/* ------------------------------------------------------------------ */
/* CUDA run (best-effort)                                              */
/* ------------------------------------------------------------------ */

async function tryRunCuda(graph, input, warmup, timed, kernelDir) {
  let ort;
  try {
    const moduleId = 'onnxruntime-node';
    ort = await import(moduleId);
  } catch (err) {
    return { skipped: `onnxruntime-node not installed: ${(err && err.message) || err}` };
  }
  const modelPath = resolve(kernelDir, 'mcop_graphAggregate.onnx');
  let session;
  try {
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['CUDAExecutionProvider'],
      graphOptimizationLevel: 'all',
      enableProfiling: true,
    });
  } catch (err) {
    return { skipped: `Failed to create CUDA session for ${modelPath}: ${(err && err.message) || err}` };
  }

  const feeds = buildCudaFeeds(ort, graph, input);
  for (let i = 0; i < warmup; i += 1) await session.run(feeds);

  const latencies = [];
  let lastOutput = null;
  for (let i = 0; i < timed; i += 1) {
    const t0 = performance.now();
    const result = await session.run(feeds);
    latencies.push(performance.now() - t0);
    const firstKey = Object.keys(result)[0];
    if (firstKey) lastOutput = result[firstKey].data;
  }

  const profilerOutput = session.endProfiling();
  const verified = parseExecutionProvider(profilerOutput);
  if (verified !== 'CUDAExecutionProvider') {
    return { skipped: `Ghost-GPU detected: profiler reports verified=${verified}` };
  }

  return {
    provider: 'CUDAHardwareLayer:onnx',
    mode: 'cuda',
    verifiedDevice: verified,
    summary: summariseLatencies(latencies),
    outputFingerprint: lastOutput ? fingerprintFloatArray(Float32Array.from(lastOutput)) : null,
    rawLatenciesMs: latencies.map((v) => round(v, 4)),
  };
}

function buildCudaFeeds(ort, graph, input) {
  return {
    rowPtr: new ort.Tensor('int32', graph.rowPtr, [graph.nodeCount + 1]),
    colIdx: new ort.Tensor('int32', graph.colIdx, [graph.edgeCount]),
    weights: new ort.Tensor('float32', graph.weights, [graph.edgeCount]),
    input: new ort.Tensor('float32', input, [graph.nodeCount]),
  };
}

function parseExecutionProvider(profilerOutput) {
  if (!profilerOutput) return 'unknown';
  let parsed;
  try {
    parsed = JSON.parse(profilerOutput);
  } catch {
    parsed = profilerOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  const providers = new Set();
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;
    if (node.args && typeof node.args === 'object') {
      if (typeof node.args.provider === 'string') providers.add(node.args.provider);
      if (typeof node.args.execution_provider === 'string') providers.add(node.args.execution_provider);
    }
    if (typeof node.provider === 'string') providers.add(node.provider);
  };
  visit(parsed);
  if (providers.has('CUDAExecutionProvider')) return 'CUDAExecutionProvider';
  if (providers.has('CPUExecutionProvider')) return 'CPUExecutionProvider';
  if (providers.size === 1) return [...providers][0];
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

/**
 * Programmatic entry point. Exposed for jest so the smoke-mode record is
 * tested directly without spawning a subprocess.
 */
export async function runBenchmark({
  mode = 'smoke',
  seed = DEFAULT_SEED,
  capturedAt,
  enableCuda = process.env.MCOP_ENABLE_CUDA === '1',
  kernelDir = process.env.MCOP_CUDA_KERNEL_DIR ?? './models',
  lowMemory = process.env.MCOP_LOW_MEMORY_MODE !== undefined && process.env.MCOP_LOW_MEMORY_MODE !== '',
  log = () => {},
} = {}) {
  const isFull = mode === 'full';
  const nodeCount = isFull ? (lowMemory ? 4096 : 32_768) : 1024;
  const warmup = isFull ? 5 : 2;
  const timed = isFull ? 20 : 8;

  log('MCOP CUDA Φ2 benchmark — proteome-graph-step / mean-aggregation');
  log(
    `mode=${mode} nodeCount=${nodeCount} avgDegree=${AVG_DEGREE} warmup=${warmup} timed=${timed} seed=0x${seed.toString(16)}`,
  );
  log(`enableCUDA=${enableCuda} kernelDir=${kernelDir} lowMemory=${lowMemory}`);

  const graph = buildCsrGraph(nodeCount, AVG_DEGREE, seed);
  const input = buildInputVector(nodeCount, seed);
  log(`graph: nodes=${graph.nodeCount} edges=${graph.edgeCount}`);

  const cpu = runCpuBaseline(graph, input, warmup, timed);
  log(`cpu: meanMs=${cpu.summary.meanMs} p95Ms=${cpu.summary.p95Ms} fingerprint=${cpu.outputFingerprint.slice(0, 16)}`);

  const cuda = enableCuda
    ? await tryRunCuda(graph, input, warmup, timed, kernelDir)
    : { skipped: 'enableCuda=false' };
  let speedup = null;
  if (cuda.summary && cpu.summary.meanMs > 0) {
    speedup = round(cpu.summary.meanMs / cuda.summary.meanMs, 3);
    log(`cuda: meanMs=${cuda.summary.meanMs} p95Ms=${cuda.summary.p95Ms} verified=${cuda.verifiedDevice} speedup=${speedup}×`);
  } else {
    log(`cuda: skipped (${cuda.skipped})`);
  }

  // Smoke-mode commits a structural-only record (no host-dependent timings)
  // so the JSON is deterministic and reproducible across machines. Full
  // mode emits the complete measurement record for upload as a CI artifact.
  const isSmoke = !isFull;
  const cpuRecord = isSmoke ? stripTimings(cpu) : cpu;
  const cudaRecord = cuda.summary ? (isSmoke ? stripTimings(cuda) : cuda) : cuda;

  const record = {
    schema: 'mcop-cuda-bench/1.0',
    capturedAt: capturedAt ?? process.env.MCOP_BENCH_CAPTURED_AT ?? new Date().toISOString(),
    mode,
    seed: `0x${seed.toString(16).toUpperCase()}`,
    fixture: {
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
      avgDegree: AVG_DEGREE,
      lowMemory,
    },
    iterations: { warmup, timed },
    host: isSmoke ? null : { platform: process.platform, arch: process.arch, nodeVersion: process.version },
    cpu: cpuRecord,
    cuda: cudaRecord,
    speedup: isSmoke ? null : speedup,
    targets: {
      phi2GoalSpeedup: 3.0,
      phi2Met: !isSmoke && speedup !== null && speedup >= 3.0,
    },
  };
  record.merkleRoot = canonicalDigest(record);
  return record;
}

/** Test-only helpers exposed for jest parity assertions. */
export const __benchInternals = {
  mulberry32,
  buildCsrGraph,
  buildInputVector,
  cpuMeanAggregate,
  canonicalDigest,
  fingerprintFloatArray,
  parseExecutionProvider,
  stripTimings,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode === 'full' ? 'full' : 'smoke';
  const outPath = resolve(process.cwd(), args.out ?? 'docs/benchmarks/cuda_graph_aggregate.json');
  const seed = Number.parseInt(args.seed ?? '0xC0FFEE', 16) >>> 0;

  const record = await runBenchmark({ mode, seed, log: console.log });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(record, replacer, 2)}\n`, 'utf8');
  console.log(`wrote ${outPath} merkleRoot=${record.merkleRoot.slice(0, 16)}`);
}

function replacer(_key, value) {
  if (value instanceof Int32Array || value instanceof Float32Array || value instanceof Uint8Array) {
    return Array.from(value);
  }
  return value;
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? 'true' : arg.slice(eq + 1);
    out[key] = value;
  }
  return out;
}

// Only run main() when invoked as a CLI, not when imported by jest.
const isCliEntry = (() => {
  if (typeof process === 'undefined' || !process.argv?.[1]) return false;
  const invoked = resolve(process.argv[1]);
  // Compare against this module's URL → file path.
  const here = resolve(new URL(import.meta.url).pathname);
  return invoked === here;
})();

if (isCliEntry) {
  main().catch((err) => {
    console.error('benchmark-cuda-graph: fatal', err);
    process.exit(1);
  });
}
