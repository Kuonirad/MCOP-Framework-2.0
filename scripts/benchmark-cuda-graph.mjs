#!/usr/bin/env node
/**
 * Φ2 + Φ3 of the CUDA Hardware Layer ladder — multi-op benchmark harness.
 *
 * Provides a deterministic CPU baseline (and optional in-process CUDA path
 * via `onnxruntime-node`) for every kernel exposed by `CUDAHardwareLayer`:
 *
 *   - `encode`             — dense embedding projection (NovaNeoEncoder shape).
 *   - `graphAggregate`     — proteome CSR mean-aggregation (Φ2 entry op).
 *   - `holographicUpdate`  — rank-1 micro-update on a holographic state matrix.
 *   - `cosineRecall`       — query × memory-bank cosine similarity sweep.
 *   - `evolveScore`        — population × phenotype fitness aggregation.
 *   - `homeostasis`        — bounded clamp-and-decay state update.
 *
 * Mirrors `scripts/benchmark-arc-evo.mjs` conventions: pure ESM, no
 * TypeScript runtime, deterministic seed, full per-row Merkle root.
 *
 * Environment knobs (mirrored from `arcagi3-run.yml`):
 *   MCOP_LOW_MEMORY_MODE    Scales fixture size down for low-RAM hosts.
 *   MCOP_ENABLE_CUDA=1      Attempts the real in-process CUDA path.
 *                           Requires `onnxruntime-node` installed and a
 *                           `models/mcop_<op>.onnx` kernel for the chosen op.
 *   MCOP_CUDA_KERNEL_DIR    Override for the kernel directory.
 *   MCOP_CUDA_STREAMS       'per-op' (default) | 'shared' — recorded in
 *                           provenance for Φ3 substrate-lineage analysis.
 *
 * CLI flags:
 *   --op=<kernel>           One of `encode | graphAggregate |
 *                           holographicUpdate | cosineRecall | evolveScore |
 *                           homeostasis | all`. Default `graphAggregate`.
 *   --mode=smoke            Reduced fixtures + 8 timed iterations.
 *                           Used for committed baseline + CI smoke.
 *   --mode=full             Full fixtures + 20 timed iterations.
 *   --out=<path>            Where to write the JSON record. Defaults to
 *                           `docs/benchmarks/cuda_<op>.json` (or
 *                           `docs/benchmarks/cuda_graph_aggregate.json`
 *                           for the legacy `graphAggregate` slot).
 *   --seed=<u32>            Override the deterministic PRNG seed.
 *
 * The harness is intentionally portable to the GitHub Actions
 * `ubuntu-latest` runner (CPU only). When a CUDA path is unavailable
 * the JSON's `cuda` slot is `{ skipped: <reason> }` rather than null,
 * so reviewers can see the gate fired correctly.
 */

import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* Deterministic constants                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_SEED = 0xC0FFEE;
const AVG_DEGREE = 12;

/* ------------------------------------------------------------------ */
/* PRNG + canonical-encoding parity                                    */
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
  const buf = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i += 1) buf.writeFloatLE(arr[i], i * 4);
  return createHash('sha256').update(buf).digest('hex');
}

/* ------------------------------------------------------------------ */
/* Fixture / kernel primitives shared by multiple ops                  */
/* ------------------------------------------------------------------ */

function buildCsrGraph(nodeCount, avgDegree, seed) {
  const rand = mulberry32(seed);
  const rowPtr = new Int32Array(nodeCount + 1);
  const colBuilder = [];
  const weightBuilder = [];
  for (let row = 0; row < nodeCount; row += 1) {
    rowPtr[row] = colBuilder.length;
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

function buildVector(length, seed) {
  const rand = mulberry32(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = rand() * 2 - 1;
  return out;
}

function buildMatrix(rows, cols, seed) {
  const rand = mulberry32(seed);
  const out = new Float32Array(rows * cols);
  for (let i = 0; i < out.length; i += 1) out[i] = rand() * 2 - 1;
  return out;
}

/* ------------------------------------------------------------------ */
/* Per-op kernel registry                                              */
/* ------------------------------------------------------------------ */

/**
 * Each entry describes one kernel surface in the v2.3 layer:
 *   - `legacyArtifact` — when the committed JSON path differs from
 *     `cuda_<op>.json` (only `graphAggregate` does, for backwards compat).
 *   - `dims(mode, lowMemory)` — fixture sizing per mode.
 *   - `buildFixture(dims, seed)` — deterministic typed-array fixtures.
 *   - `fixtureMeta(fixture)` — JSON-friendly summary (committed verbatim).
 *   - `cpuKernel(fixture)` — pure-JS reference implementation, returns
 *     a `Float32Array` whose fingerprint is committed for parity.
 *   - `buildCudaFeeds(ort, fixture)` — feeds dict for ORT (only used on
 *     a real GPU host; never exercised on `ubuntu-latest`).
 */
const KERNELS = {
  encode: {
    description: 'NovaNeoEncoder context → fixed-dim embedding projection',
    legacyArtifact: 'cuda_encode.json',
    dims(mode, lowMemory) {
      if (mode === 'smoke') return { batch: 8, inputDim: 256, hiddenDim: 64 };
      const batch = lowMemory ? 32 : 128;
      return { batch, inputDim: 1024, hiddenDim: 256 };
    },
    buildFixture(dims, seed) {
      const input = buildMatrix(dims.batch, dims.inputDim, seed);
      const projection = buildMatrix(dims.inputDim, dims.hiddenDim, seed ^ 0xA1B2C3D4);
      const bias = buildVector(dims.hiddenDim, seed ^ 0x5E6F7081);
      return { dims, input, projection, bias };
    },
    fixtureMeta(fixture) {
      return { batch: fixture.dims.batch, inputDim: fixture.dims.inputDim, hiddenDim: fixture.dims.hiddenDim };
    },
    cpuKernel(fixture) {
      const { input, projection, bias, dims } = fixture;
      const { batch, inputDim, hiddenDim } = dims;
      const out = new Float32Array(batch * hiddenDim);
      for (let b = 0; b < batch; b += 1) {
        for (let h = 0; h < hiddenDim; h += 1) {
          let sum = bias[h];
          for (let i = 0; i < inputDim; i += 1) {
            sum += input[b * inputDim + i] * projection[i * hiddenDim + h];
          }
          // GELU-ish smooth activation; matches NovaNeoEncoder's nonlinearity surface.
          out[b * hiddenDim + h] = sum / (1 + Math.exp(-sum));
        }
      }
      return out;
    },
    buildCudaFeeds(ort, fixture) {
      const { dims, input, projection, bias } = fixture;
      return {
        input: new ort.Tensor('float32', input, [dims.batch, dims.inputDim]),
        projection: new ort.Tensor('float32', projection, [dims.inputDim, dims.hiddenDim]),
        bias: new ort.Tensor('float32', bias, [dims.hiddenDim]),
      };
    },
  },

  graphAggregate: {
    description: 'Proteome CSR mean-aggregation (GraphSAGE-style)',
    legacyArtifact: 'cuda_graph_aggregate.json',
    dims(mode, lowMemory) {
      if (mode === 'smoke') return { nodeCount: 1024, avgDegree: AVG_DEGREE };
      return { nodeCount: lowMemory ? 4096 : 32_768, avgDegree: AVG_DEGREE };
    },
    buildFixture(dims, seed) {
      const graph = buildCsrGraph(dims.nodeCount, dims.avgDegree, seed);
      const input = buildVector(dims.nodeCount, seed ^ 0x9E3779B9);
      return { dims, graph, input };
    },
    fixtureMeta(fixture) {
      return {
        nodeCount: fixture.graph.nodeCount,
        edgeCount: fixture.graph.edgeCount,
        avgDegree: fixture.dims.avgDegree,
      };
    },
    cpuKernel(fixture) {
      const { graph, input } = fixture;
      const { nodeCount, rowPtr, colIdx, weights } = graph;
      const out = new Float32Array(nodeCount);
      for (let v = 0; v < nodeCount; v += 1) {
        const start = rowPtr[v];
        const end = rowPtr[v + 1];
        if (end <= start) continue;
        let sum = 0;
        for (let k = start; k < end; k += 1) sum += weights[k] * input[colIdx[k]];
        out[v] = sum / (end - start);
      }
      return out;
    },
    buildCudaFeeds(ort, fixture) {
      const { graph, input } = fixture;
      return {
        rowPtr: new ort.Tensor('int32', graph.rowPtr, [graph.nodeCount + 1]),
        colIdx: new ort.Tensor('int32', graph.colIdx, [graph.edgeCount]),
        weights: new ort.Tensor('float32', graph.weights, [graph.edgeCount]),
        input: new ort.Tensor('float32', input, [graph.nodeCount]),
      };
    },
  },

  holographicUpdate: {
    description: 'Rank-1 outer-product micro-update on a holographic state matrix',
    legacyArtifact: 'cuda_holographic_update.json',
    dims(mode, lowMemory) {
      if (mode === 'smoke') return { dim: 64 };
      return { dim: lowMemory ? 256 : 1024 };
    },
    buildFixture(dims, seed) {
      const state = buildMatrix(dims.dim, dims.dim, seed);
      const left = buildVector(dims.dim, seed ^ 0xBADDCAFE);
      const right = buildVector(dims.dim, seed ^ 0xDEADBEEF);
      return { dims, state, left, right, gain: 0.125 };
    },
    fixtureMeta(fixture) {
      return { dim: fixture.dims.dim, gain: fixture.gain };
    },
    cpuKernel(fixture) {
      const { state, left, right, gain, dims } = fixture;
      const { dim } = dims;
      const out = new Float32Array(state.length);
      for (let r = 0; r < dim; r += 1) {
        const lr = left[r];
        for (let c = 0; c < dim; c += 1) {
          out[r * dim + c] = state[r * dim + c] + gain * lr * right[c];
        }
      }
      return out;
    },
    buildCudaFeeds(ort, fixture) {
      const { dims, state, left, right, gain } = fixture;
      return {
        state: new ort.Tensor('float32', state, [dims.dim, dims.dim]),
        left: new ort.Tensor('float32', left, [dims.dim]),
        right: new ort.Tensor('float32', right, [dims.dim]),
        gain: new ort.Tensor('float32', new Float32Array([gain]), [1]),
      };
    },
  },

  cosineRecall: {
    description: 'Query × memory-bank cosine similarity sweep (Stigmergy V5)',
    legacyArtifact: 'cuda_cosine_recall.json',
    dims(mode, lowMemory) {
      if (mode === 'smoke') return { bank: 256, dim: 64 };
      return { bank: lowMemory ? 1024 : 8192, dim: 256 };
    },
    buildFixture(dims, seed) {
      const bank = buildMatrix(dims.bank, dims.dim, seed);
      const query = buildVector(dims.dim, seed ^ 0xC0DECAFE);
      // Pre-normalise the bank rows + query so the kernel reduces to a dot product;
      // matches StigmergyV5's pre-normalised pheromone-trace storage.
      normaliseRows(bank, dims.bank, dims.dim);
      normaliseRow(query, 0, dims.dim);
      return { dims, bank, query };
    },
    fixtureMeta(fixture) {
      return { bank: fixture.dims.bank, dim: fixture.dims.dim };
    },
    cpuKernel(fixture) {
      const { bank, query, dims } = fixture;
      const { bank: bankRows, dim } = dims;
      const out = new Float32Array(bankRows);
      for (let r = 0; r < bankRows; r += 1) {
        let sum = 0;
        for (let c = 0; c < dim; c += 1) sum += bank[r * dim + c] * query[c];
        out[r] = sum;
      }
      return out;
    },
    buildCudaFeeds(ort, fixture) {
      const { dims, bank, query } = fixture;
      return {
        bank: new ort.Tensor('float32', bank, [dims.bank, dims.dim]),
        query: new ort.Tensor('float32', query, [dims.dim]),
      };
    },
  },

  evolveScore: {
    description: 'Population × phenotype fitness aggregation (NovaEvolveTuner)',
    legacyArtifact: 'cuda_evolve_score.json',
    dims(mode, lowMemory) {
      if (mode === 'smoke') return { population: 64, traits: 16 };
      return { population: lowMemory ? 256 : 2048, traits: 64 };
    },
    buildFixture(dims, seed) {
      const phenotype = buildMatrix(dims.population, dims.traits, seed);
      const reference = buildVector(dims.traits, seed ^ 0x600D5EED);
      const weights = buildVector(dims.traits, seed ^ 0x1FACADE);
      return { dims, phenotype, reference, weights };
    },
    fixtureMeta(fixture) {
      return { population: fixture.dims.population, traits: fixture.dims.traits };
    },
    cpuKernel(fixture) {
      const { phenotype, reference, weights, dims } = fixture;
      const { population, traits } = dims;
      const out = new Float32Array(population);
      for (let p = 0; p < population; p += 1) {
        let score = 0;
        for (let t = 0; t < traits; t += 1) {
          const delta = phenotype[p * traits + t] - reference[t];
          score -= weights[t] * delta * delta;
        }
        out[p] = score;
      }
      return out;
    },
    buildCudaFeeds(ort, fixture) {
      const { dims, phenotype, reference, weights } = fixture;
      return {
        phenotype: new ort.Tensor('float32', phenotype, [dims.population, dims.traits]),
        reference: new ort.Tensor('float32', reference, [dims.traits]),
        weights: new ort.Tensor('float32', weights, [dims.traits]),
      };
    },
  },

  homeostasis: {
    description: 'Bounded clamp-and-decay state update (eudaimonic audit ring)',
    legacyArtifact: 'cuda_homeostasis.json',
    dims(mode, lowMemory) {
      if (mode === 'smoke') return { dim: 256, decay: 0.95, bound: 1.5 };
      return { dim: lowMemory ? 4096 : 32_768, decay: 0.95, bound: 1.5 };
    },
    buildFixture(dims, seed) {
      const state = buildVector(dims.dim, seed);
      const drive = buildVector(dims.dim, seed ^ 0xDEC0DE);
      const setpoint = buildVector(dims.dim, seed ^ 0x5E5E5E5E);
      return { dims, state, drive, setpoint };
    },
    fixtureMeta(fixture) {
      return { dim: fixture.dims.dim, decay: fixture.dims.decay, bound: fixture.dims.bound };
    },
    cpuKernel(fixture) {
      const { state, drive, setpoint, dims } = fixture;
      const { dim, decay, bound } = dims;
      const out = new Float32Array(dim);
      for (let i = 0; i < dim; i += 1) {
        const next = decay * state[i] + (1 - decay) * setpoint[i] + drive[i];
        out[i] = next > bound ? bound : next < -bound ? -bound : next;
      }
      return out;
    },
    buildCudaFeeds(ort, fixture) {
      const { dims, state, drive, setpoint } = fixture;
      return {
        state: new ort.Tensor('float32', state, [dims.dim]),
        drive: new ort.Tensor('float32', drive, [dims.dim]),
        setpoint: new ort.Tensor('float32', setpoint, [dims.dim]),
        decay: new ort.Tensor('float32', new Float32Array([dims.decay]), [1]),
        bound: new ort.Tensor('float32', new Float32Array([dims.bound]), [1]),
      };
    },
  },
};

const KERNEL_NAMES = Object.freeze(Object.keys(KERNELS));

function normaliseRow(buf, rowStart, length) {
  let sumSq = 0;
  for (let i = 0; i < length; i += 1) {
    const v = buf[rowStart + i];
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < length; i += 1) buf[rowStart + i] = buf[rowStart + i] / norm;
}

function normaliseRows(matrix, rows, cols) {
  for (let r = 0; r < rows; r += 1) normaliseRow(matrix, r * cols, cols);
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

function runCpuBaseline(kernel, fixture, warmup, timed) {
  for (let i = 0; i < warmup; i += 1) kernel.cpuKernel(fixture);
  const latencies = [];
  let lastOutput = null;
  for (let i = 0; i < timed; i += 1) {
    const t0 = performance.now();
    lastOutput = kernel.cpuKernel(fixture);
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

async function tryRunCuda(opName, kernel, fixture, warmup, timed, kernelDir) {
  let ort;
  try {
    const moduleId = 'onnxruntime-node';
    ort = await import(moduleId);
  } catch (err) {
    return { skipped: `onnxruntime-node not installed: ${(err && err.message) || err}` };
  }
  const modelPath = resolve(kernelDir, `mcop_${opName}.onnx`);
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

  const feeds = kernel.buildCudaFeeds(ort, fixture);
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
/* Programmatic entry points                                           */
/* ------------------------------------------------------------------ */

/**
 * Run a single kernel and return a Merkle-rooted record. Exported for jest.
 */
export async function runBenchmark({
  op = 'graphAggregate',
  mode = 'smoke',
  seed = DEFAULT_SEED,
  capturedAt,
  enableCuda = process.env.MCOP_ENABLE_CUDA === '1',
  kernelDir = process.env.MCOP_CUDA_KERNEL_DIR ?? './models',
  lowMemory = process.env.MCOP_LOW_MEMORY_MODE !== undefined && process.env.MCOP_LOW_MEMORY_MODE !== '',
  streams = process.env.MCOP_CUDA_STREAMS === 'shared' ? 'shared' : 'per-op',
  log = () => {},
} = {}) {
  const kernel = KERNELS[op];
  if (!kernel) {
    throw new Error(`Unknown CUDA kernel op '${op}'. Expected one of: ${KERNEL_NAMES.join(', ')}`);
  }

  const isFull = mode === 'full';
  const warmup = isFull ? 5 : 2;
  const timed = isFull ? 20 : 8;
  const dims = kernel.dims(mode, lowMemory);

  log('MCOP CUDA Φ2/Φ3 benchmark — multi-op kernel harness');
  log(`op=${op} mode=${mode} warmup=${warmup} timed=${timed} seed=0x${seed.toString(16)}`);
  log(`enableCUDA=${enableCuda} kernelDir=${kernelDir} lowMemory=${lowMemory} streams=${streams}`);

  const fixture = kernel.buildFixture(dims, seed);
  const fixtureMeta = kernel.fixtureMeta(fixture);
  log(`fixture: ${JSON.stringify(fixtureMeta)}`);

  const cpu = runCpuBaseline(kernel, fixture, warmup, timed);
  log(`cpu: meanMs=${cpu.summary.meanMs} p95Ms=${cpu.summary.p95Ms} fingerprint=${cpu.outputFingerprint.slice(0, 16)}`);

  const cuda = enableCuda
    ? await tryRunCuda(op, kernel, fixture, warmup, timed, kernelDir)
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
    schema: 'mcop-cuda-bench/1.1',
    capturedAt: capturedAt ?? process.env.MCOP_BENCH_CAPTURED_AT ?? new Date().toISOString(),
    op,
    description: kernel.description,
    mode,
    seed: `0x${seed.toString(16).toUpperCase()}`,
    fixture: { ...fixtureMeta, lowMemory },
    iterations: { warmup, timed },
    streams,
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
  KERNEL_NAMES,
  KERNELS,
  mulberry32,
  buildCsrGraph,
  buildVector,
  buildMatrix,
  canonicalDigest,
  fingerprintFloatArray,
  parseExecutionProvider,
  stripTimings,
};

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function defaultOutPath(opName) {
  const slot = KERNELS[opName]?.legacyArtifact ?? `cuda_${opName}.json`;
  return resolve(process.cwd(), 'docs', 'benchmarks', slot);
}

async function runOne(opName, mode, seed, outOverride, capturedAt) {
  const record = await runBenchmark({ op: opName, mode, seed, capturedAt, log: console.log });
  const outPath = outOverride ? resolve(process.cwd(), outOverride) : defaultOutPath(opName);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(record, replacer, 2)}\n`, 'utf8');
  console.log(`wrote ${outPath} merkleRoot=${record.merkleRoot.slice(0, 16)}`);
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode === 'full' ? 'full' : 'smoke';
  const seed = Number.parseInt(args.seed ?? '0xC0FFEE', 16) >>> 0;
  const capturedAt = args.capturedAt;
  const opArg = args.op ?? 'graphAggregate';

  if (opArg === 'all') {
    for (const name of KERNEL_NAMES) {
      console.log(`\n=== ${name} ===`);
      await runOne(name, mode, seed, undefined, capturedAt);
    }
    return;
  }

  if (!KERNELS[opArg]) {
    console.error(`benchmark-cuda-graph: unknown --op='${opArg}'. Expected one of: ${KERNEL_NAMES.join(', ')} | all`);
    process.exit(2);
  }
  await runOne(opArg, mode, seed, args.out, capturedAt);
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
  const here = resolve(fileURLToPath(import.meta.url));
  return invoked === here;
})();

if (isCliEntry) {
  main().catch((err) => {
    console.error('benchmark-cuda-graph: fatal', err);
    process.exit(1);
  });
}
