#!/usr/bin/env node
/**
 * Φ4 of the CUDA Hardware Layer ladder — verifiedDevice gate soak harness.
 *
 * Drives a 1 000-step deterministic ARC-style trace through the in-process
 * `CUDAHardwareLayer` gate logic (re-implemented in pure ESM for portability
 * to GitHub Actions `ubuntu-latest` runners — same shape as the Φ2/Φ3
 * benchmark harness). Every step:
 *
 *   1. Picks an op from the six op-sharded kernels (`encode`,
 *      `graphAggregate`, `holographicUpdate`, `cosineRecall`,
 *      `evolveScore`, `homeostasis`) via `step % 6`.
 *   2. Synthesises a mock `endProfiling()` payload tagged
 *      `CUDAExecutionProvider` (clean path — byte-stable Merkle fold).
 *   3. Runs the verifiedDevice parser, asserts the gate accepts the leaf,
 *      and seals a Merkle leaf via canonical-encoding parity.
 *   4. Optionally — when `--canary=` / `--canary-every=` is passed —
 *      injects adversarial (ghost-GPU) profiler payloads at selected
 *      steps. Canaries exercise the full `parseExecutionProvider` branch
 *      vocabulary (CPU, TensorRT/DML, mixed, malformed, empty, null).
 *      Multi-canary / cadence modes record **every** ghost event without
 *      breaking early so detection is asserted across the whole trace.
 *
 * The Merkle root is computed over the canonical sequence of `(step, op,
 * verifiedDevice, leafDigest)` tuples plus the run metadata, so a single
 * step regression invalidates the root.
 *
 * **Merkle stability contract**: clean (non-canary) leaves always use the
 * historical two-event CUDA payload shape. Canary-only payload variants and
 * continue-on-ghost bookkeeping must not alter the clean fold. Changing the
 * clean shape requires re-committing
 * `docs/benchmarks/cuda_verified_device_soak.json` and a schema bump.
 *
 * Environment knobs:
 *   MCOP_BENCH_CAPTURED_AT     Pin the ISO timestamp in the output JSON
 *                              for byte-stable replay across machines.
 *
 * CLI flags:
 *   --steps=<N>                Number of soak iterations. Default 1000.
 *   --seed=<u32>               PRNG seed (currently used as a salt only;
 *                              the soak's verifiedDevice gate is purely
 *                              structural). Default 0xC0FFEE.
 *   --canary=<step[,step...]>  Canary step(s). Single step preserves
 *                              legacy halt-on-first-ghost behaviour.
 *                              Comma-separated list injects at each step
 *                              and continues recording every ghost event.
 *   --canary-every=<N>         Inject a canary every N steps (N>0). Implies
 *                              continue-on-ghost for full-trace detection.
 *   --halt-on-ghost            Force halt on first ghost (overrides multi-
 *                              canary continue default).
 *   --continue-on-ghost        Force continue after ghost (overrides single-
 *                              canary halt default).
 *   --out=<path>               Output JSON path. Default
 *                              docs/benchmarks/cuda_verified_device_soak.json.
 *   --mode=full|smoke          Smoke mode strips host info for byte-stable
 *                              committed JSON. Default smoke.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SEED = 0xC0FFEE;
const DEFAULT_STEPS = 1000;

const KERNEL_NAMES = Object.freeze([
  'encode',
  'graphAggregate',
  'holographicUpdate',
  'cosineRecall',
  'evolveScore',
  'homeostasis',
]);

const KERNEL_TO_OPERATION = Object.freeze({
  encode: 'nova-neo-encode',
  graphAggregate: 'proteome-graph-step',
  holographicUpdate: 'holographic-write',
  cosineRecall: 'cosine-recall',
  evolveScore: 'nova-evolve-score',
  homeostasis: 'homeostasis',
});

/**
 * Op-aware adversarial canary vocabulary.
 * Each kernel gets a distinct payload shape so multi-canary runs exercise
 * every major `parseExecutionProvider` branch:
 *   - clean CPU (args.provider)
 *   - providers.size === 1 non-CUDA (TensorRT / DML)
 *   - mixed CUDA+CPU (CUDA preference path — NOT a ghost when CUDA present;
 *     cosineRecall uses pure CPU mixed-schema instead)
 *   - malformed / truncated JSON → JSON-lines / unknown fallback
 *   - empty / null → unknown default
 *
 * Expected verified provider after parse (must NOT be CUDAExecutionProvider
 * for the gate to fire as a ghost).
 */
const CANARY_VARIANT_BY_OP = Object.freeze({
  encode: 'cpu-args-provider',
  graphAggregate: 'tensorrt-single',
  holographicUpdate: 'dml-execution-provider',
  cosineRecall: 'cpu-mixed-schema',
  evolveScore: 'malformed-truncated',
  homeostasis: 'empty-string',
});

/** Expected parser result for each canary variant (for tests / diagnostics). */
const CANARY_VARIANT_EXPECTED = Object.freeze({
  'cpu-args-provider': 'CPUExecutionProvider',
  'tensorrt-single': 'TensorrtExecutionProvider',
  'dml-execution-provider': 'DmlExecutionProvider',
  'cpu-mixed-schema': 'CPUExecutionProvider',
  'malformed-truncated': 'unknown',
  'empty-string': 'unknown',
  'null-payload': 'unknown',
  'newline-cpu': 'CPUExecutionProvider',
  'mixed-cuda-cpu': 'CUDAExecutionProvider', // CUDA wins — not a ghost
  'truncated-json': 'unknown',
});

/* ------------------------------------------------------------------ */
/* Canonical encoding (parity with src/core/canonicalEncoding.ts)     */
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

/* ------------------------------------------------------------------ */
/* parseExecutionProvider (parity with CUDAHardwareLayer.ts)          */
/* ------------------------------------------------------------------ */

export function parseExecutionProvider(profilerOutput) {
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
/* Synthesised mock profiler payloads                                 */
/* ------------------------------------------------------------------ */

/**
 * Historical clean CUDA payload — **do not change shape** without
 * re-committing the Φ4 Merkle baseline JSON and bumping schema.
 * Two canonical event shapes so the parser covers both `args.provider`
 * and `args.execution_provider` fields seen in real ORT builds.
 */
function buildCleanCudaProfilerPayload(op, step) {
  const events = [
    {
      name: `${op}_kernel_${step}`,
      args: { provider: 'CUDAExecutionProvider' },
    },
    {
      name: `${op}_dispatch_${step}`,
      args: { execution_provider: 'CUDAExecutionProvider' },
    },
  ];
  return JSON.stringify(events);
}

/**
 * Adversarial / canary payload vocabulary. Each variant hits a distinct
 * branch of `parseExecutionProvider` (JSON parse, newline-delimited,
 * providers.size === 1, CUDA preference, empty → unknown).
 *
 * @param {string} op
 * @param {string} provider  Logical provider label (for variants that take one)
 * @param {number} step
 * @param {string} [variant='cpu-args-provider']
 * @returns {string|null|undefined}
 */
export function buildProfilerPayload(op, provider, step, variant = 'cpu-args-provider') {
  switch (variant) {
    case 'clean-cuda':
      return buildCleanCudaProfilerPayload(op, step);

    case 'cpu-args-provider':
      return JSON.stringify([
        { name: `${op}_kernel_${step}`, args: { provider: provider || 'CPUExecutionProvider' } },
        { name: `${op}_dispatch_${step}`, args: { execution_provider: provider || 'CPUExecutionProvider' } },
      ]);

    case 'cpu-mixed-schema':
      // One event uses args.provider, one top-level provider — both CPU.
      return JSON.stringify([
        { name: `${op}_kernel_${step}`, args: { provider: 'CPUExecutionProvider' } },
        { name: `${op}_dispatch_${step}`, provider: 'CPUExecutionProvider' },
      ]);

    case 'tensorrt-single':
      return JSON.stringify([
        { name: `${op}_kernel_${step}`, args: { provider: 'TensorrtExecutionProvider' } },
      ]);

    case 'dml-execution-provider':
      return JSON.stringify([
        { name: `${op}_kernel_${step}`, args: { execution_provider: 'DmlExecutionProvider' } },
      ]);

    case 'mixed-cuda-cpu':
      // CUDA preference path — parser must return CUDA (NOT a ghost).
      return JSON.stringify([
        { args: { provider: 'CPUExecutionProvider' } },
        { args: { provider: 'CUDAExecutionProvider' } },
      ]);

    case 'malformed-truncated':
      // Truncated JSON forces catch → newline-delimited path → empty → unknown.
      return `[{"name":"${op}_kernel_${step}","args":{"provider":"CPUExecutionProvider"`;

    case 'truncated-json':
      return '{"args":{"provider":"CPUExecutionProvider"';

    case 'newline-cpu':
      return [
        JSON.stringify({ name: `${op}_kernel_${step}`, args: { provider: 'CPUExecutionProvider' } }),
        JSON.stringify({ name: `${op}_dispatch_${step}`, args: { execution_provider: 'CPUExecutionProvider' } }),
      ].join('\n');

    case 'empty-string':
      return '';

    case 'null-payload':
      return null;

    case 'undefined-payload':
      return undefined;

    default:
      return JSON.stringify([
        { name: `${op}_kernel_${step}`, args: { provider: provider || 'CPUExecutionProvider' } },
      ]);
  }
}

/**
 * Resolve canary step set from scalar, list, and/or cadence.
 * @param {{ canary?: number|number[]|null, canaryEvery?: number|null, steps: number }} opts
 * @returns {Set<number>}
 */
export function resolveCanarySteps({ canary = null, canaryEvery = null, steps }) {
  const set = new Set();
  if (canary !== null && canary !== undefined) {
    const list = Array.isArray(canary) ? canary : [canary];
    for (const s of list) {
      const n = Number(s);
      if (Number.isInteger(n) && n >= 0 && n < steps) set.add(n);
    }
  }
  if (canaryEvery !== null && canaryEvery !== undefined) {
    const every = Number(canaryEvery);
    if (Number.isInteger(every) && every > 0) {
      for (let s = every; s < steps; s += every) set.add(s);
      // Also include step 0 only if every divides and user wants full cadence
      // from 0 — standard is every N starting at N (first injection after warm-up).
      // Include 0 when every === 1 so single-step denseness is complete.
      if (every === 1) set.add(0);
    }
  }
  return set;
}

/**
 * @param {string|undefined} raw  CLI --canary value
 * @returns {number|number[]|null}
 */
export function parseCanaryArg(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (String(raw).includes(',')) {
    return String(raw)
      .split(',')
      .map((p) => Number.parseInt(p.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0);
  }
  const n = Number.parseInt(String(raw), 10);
  return Number.isInteger(n) ? n : null;
}

function shouldContinueOnGhost({ canarySteps, canaryEvery, haltOnGhost, continueOnGhost }) {
  if (haltOnGhost === true) return false;
  if (continueOnGhost === true) return true;
  // Cadence mode always walks the full trace so every injection is recorded.
  if (canaryEvery !== null && canaryEvery !== undefined && Number(canaryEvery) > 0) return true;
  // Default: single canary → halt (legacy); multi-step list → continue.
  return canarySteps.size > 1;
}

/* ------------------------------------------------------------------ */
/* Soak driver                                                        */
/* ------------------------------------------------------------------ */

/**
 * Runs the verifiedDevice gate for `steps` iterations. Returns a
 * Merkle-rooted record. Throws nothing — ghost-GPU detections are
 * recorded structurally so the canary regression can assert on them.
 *
 * @param {object} opts
 * @param {number} [opts.steps]
 * @param {number} [opts.seed]
 * @param {number|number[]|null} [opts.canary]  Single step or list
 * @param {number|null} [opts.canaryEvery]      Cadence
 * @param {boolean} [opts.haltOnGhost]
 * @param {boolean} [opts.continueOnGhost]
 * @param {string} [opts.device]
 * @param {string} [opts.streams]
 */
export function runSoak({
  steps = DEFAULT_STEPS,
  seed = DEFAULT_SEED,
  canary = null,
  canaryEvery = null,
  haltOnGhost,
  continueOnGhost,
  device = 'cuda:0',
  streams = 'per-op',
} = {}) {
  const ghostGpuEvents = [];
  let merkleAccumulator = canonicalDigest({ type: 'MCOP_VERIFIED_DEVICE_SOAK_INIT', seed: `0x${seed.toString(16).toUpperCase()}`, device, streams });
  let firstGhostGPUStep = null;
  let lastVerified = null;
  let halted = false;

  const canarySteps = resolveCanarySteps({ canary, canaryEvery, steps });
  const cont = shouldContinueOnGhost({ canarySteps, canaryEvery, haltOnGhost, continueOnGhost });
  let sealedSteps = 0;

  for (let step = 0; step < steps; step += 1) {
    const op = KERNEL_NAMES[step % KERNEL_NAMES.length];
    const isCanary = canarySteps.has(step);

    let profilerOutput;
    let canaryVariant = null;
    if (isCanary) {
      canaryVariant = CANARY_VARIANT_BY_OP[op] ?? 'cpu-args-provider';
      profilerOutput = buildProfilerPayload(op, 'CPUExecutionProvider', step, canaryVariant);
    } else {
      // Clean path — fixed historical shape (Merkle stability).
      profilerOutput = buildCleanCudaProfilerPayload(op, step);
    }

    const verified = parseExecutionProvider(profilerOutput);
    lastVerified = verified;

    if (verified !== 'CUDAExecutionProvider') {
      ghostGpuEvents.push({
        step,
        op,
        kernel: KERNEL_TO_OPERATION[op],
        verifiedProvider: verified,
        canary: isCanary,
        canaryVariant,
      });
      if (firstGhostGPUStep === null) firstGhostGPUStep = step;
      if (!cont) {
        halted = true;
        break;
      }
      // Continue-on-ghost: do not seal a CUDA leaf for this step; skip fold.
      continue;
    }

    sealedSteps += 1;
    // Canonical leaf includes the run-relative invariants only — no
    // wall-clock timestamps, no host info — so the Merkle root is
    // byte-stable across machines.
    const leaf = {
      type: 'MCOP_VERIFIED_DEVICE_LEAF',
      step,
      op,
      kernel: KERNEL_TO_OPERATION[op],
      verifiedDevice: verified,
      requestedDevice: device,
      substrateLineage: `${verified}/${streams}`,
    };
    const leafDigest = canonicalDigest(leaf);
    merkleAccumulator = canonicalDigest({
      type: 'MCOP_VERIFIED_DEVICE_FOLD',
      previous: merkleAccumulator,
      leaf: leafDigest,
    });
  }

  // Legacy: completedSteps is the first ghost step when halted, else full steps.
  const completedSteps = halted && firstGhostGPUStep !== null ? firstGhostGPUStep : steps;
  // Coverage counts sealed CUDA leaves only (parity with historical halt-before-canary).
  const opCoverage = {};
  if (halted && firstGhostGPUStep !== null) {
    for (let i = 0; i < firstGhostGPUStep; i += 1) {
      const op = KERNEL_NAMES[i % KERNEL_NAMES.length];
      opCoverage[op] = (opCoverage[op] ?? 0) + 1;
    }
  } else {
    for (let i = 0; i < steps; i += 1) {
      if (canarySteps.has(i)) continue;
      const op = KERNEL_NAMES[i % KERNEL_NAMES.length];
      opCoverage[op] = (opCoverage[op] ?? 0) + 1;
    }
  }
  // sealedSteps kept for diagnostics (unused in public record; reserved).
  void sealedSteps;

  return {
    steps,
    completedSteps,
    halted,
    firstGhostGPUStep,
    ghostGpuEvents,
    opCoverage,
    lastVerifiedDevice: lastVerified,
    merkleAccumulator,
    canarySteps: [...canarySteps].sort((a, b) => a - b),
    continueOnGhost: cont,
  };
}

/* ------------------------------------------------------------------ */
/* Programmatic entry point                                           */
/* ------------------------------------------------------------------ */

export function runVerifiedDeviceSoak({
  steps = DEFAULT_STEPS,
  seed = DEFAULT_SEED,
  canary = null,
  canaryEvery = null,
  haltOnGhost,
  continueOnGhost,
  device = 'cuda:0',
  streams = 'per-op',
  capturedAt,
  mode = 'smoke',
  log = () => {},
} = {}) {
  const canaryLabel = canaryEvery != null
    ? `every=${canaryEvery}${canary != null ? `,steps=${Array.isArray(canary) ? canary.join(',') : canary}` : ''}`
    : (Array.isArray(canary) ? canary.join(',') : canary);
  log(`MCOP CUDA Φ4 verifiedDevice soak — steps=${steps} seed=0x${seed.toString(16)} canary=${canaryLabel} device=${device} streams=${streams}`);
  const soak = runSoak({ steps, seed, canary, canaryEvery, haltOnGhost, continueOnGhost, device, streams });
  log(`completedSteps=${soak.completedSteps} halted=${soak.halted} firstGhostGPUStep=${soak.firstGhostGPUStep} ghostGpuEvents=${soak.ghostGpuEvents.length}`);

  const isFull = mode === 'full';
  // Preserve legacy `canary` scalar for single-step mode so existing
  // consumers / tests keep reading a number. Multi-canary exposes `canarySteps`.
  const canaryField = Array.isArray(canary)
    ? (canary.length === 1 ? canary[0] : canary)
    : canary;

  const record = {
    schema: 'mcop-cuda-verified-device-soak/1.0',
    capturedAt: capturedAt ?? process.env.MCOP_BENCH_CAPTURED_AT ?? new Date().toISOString(),
    mode,
    seed: `0x${seed.toString(16).toUpperCase()}`,
    steps: soak.steps,
    completedSteps: soak.completedSteps,
    halted: soak.halted,
    firstGhostGPUStep: soak.firstGhostGPUStep,
    canary: canaryField,
    canaryEvery: canaryEvery ?? null,
    canarySteps: soak.canarySteps,
    continueOnGhost: soak.continueOnGhost,
    device,
    streams,
    kernelOps: KERNEL_NAMES,
    opCoverage: soak.opCoverage,
    ghostGpuEvents: soak.ghostGpuEvents,
    lastVerifiedDevice: soak.lastVerifiedDevice,
    host: isFull ? { platform: process.platform, arch: process.arch, nodeVersion: process.version } : null,
    targets: {
      phi4ZeroGhostGPUEvents: !soak.halted && soak.ghostGpuEvents.length === 0,
    },
    merkleRoot: soak.merkleAccumulator,
  };
  return record;
}

export const __soakInternals = {
  KERNEL_NAMES,
  KERNEL_TO_OPERATION,
  CANARY_VARIANT_BY_OP,
  CANARY_VARIANT_EXPECTED,
  parseExecutionProvider,
  buildProfilerPayload,
  buildCleanCudaProfilerPayload,
  resolveCanarySteps,
  parseCanaryArg,
  canonicalDigest,
  runSoak,
};

/* ------------------------------------------------------------------ */
/* CLI                                                                */
/* ------------------------------------------------------------------ */

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const steps = Number.parseInt(args.steps ?? `${DEFAULT_STEPS}`, 10);
  const seed = Number.parseInt(args.seed ?? '0xC0FFEE', 16) >>> 0;
  const canary = parseCanaryArg(args.canary);
  const canaryEvery = args['canary-every'] !== undefined
    ? Number.parseInt(args['canary-every'], 10)
    : null;
  const haltOnGhost = args['halt-on-ghost'] === 'true' || args['halt-on-ghost'] === true;
  const continueOnGhost = args['continue-on-ghost'] === 'true' || args['continue-on-ghost'] === true;
  const mode = args.mode === 'full' ? 'full' : 'smoke';
  const out = args.out
    ? resolve(process.cwd(), args.out)
    : resolve(process.cwd(), 'docs', 'benchmarks', 'cuda_verified_device_soak.json');

  const record = runVerifiedDeviceSoak({
    steps,
    seed,
    canary,
    canaryEvery: Number.isInteger(canaryEvery) ? canaryEvery : null,
    haltOnGhost: haltOnGhost || undefined,
    continueOnGhost: continueOnGhost || undefined,
    mode,
    log: console.log,
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  console.log(`wrote ${out} merkleRoot=${record.merkleRoot.slice(0, 16)} halted=${record.halted}`);
}

const isCliEntry = (() => {
  if (typeof process === 'undefined' || !process.argv?.[1]) return false;
  const invoked = resolve(process.argv[1]);
  const here = resolve(fileURLToPath(import.meta.url));
  return invoked === here;
})();

if (isCliEntry) {
  main().catch((err) => {
    console.error('cuda-verified-device-soak: fatal', err);
    process.exit(1);
  });
}
