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
 *      `CUDAExecutionProvider`.
 *   3. Runs the verifiedDevice parser, asserts the gate accepts the leaf,
 *      and seals a Merkle leaf via canonical-encoding parity.
 *   4. Optionally — when `--canary=<step>` is passed — flips the profile
 *      for one specific step to `CPUExecutionProvider`. The harness then
 *      asserts the gate halts at exactly that step and records the halt
 *      under `firstGhostGPUStep` in the output record.
 *
 * The Merkle root is computed over the canonical sequence of `(step, op,
 * verifiedDevice, leafDigest)` tuples plus the run metadata, so a single
 * step regression invalidates the root.
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
 *   --canary=<step>            If set, the verifiedDevice profile at this
 *                              step flips to CPUExecutionProvider so the
 *                              gate halts there. Used by the regression
 *                              test to prove ghost-GPU detection fires
 *                              at exactly the canonical step.
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
 * Build a profiler payload identical in shape to ORT's
 * `endProfiling()` output, tagged with the requested provider. Two
 * canonical event shapes are exercised so the parser path covers both
 * `args.provider` and `args.execution_provider` fields seen in real
 * ORT builds.
 */
function buildProfilerPayload(op, provider, step) {
  const events = [
    {
      name: `${op}_kernel_${step}`,
      args: { provider },
    },
    {
      name: `${op}_dispatch_${step}`,
      args: { execution_provider: provider },
    },
  ];
  return JSON.stringify(events);
}

/* ------------------------------------------------------------------ */
/* Soak driver                                                        */
/* ------------------------------------------------------------------ */

/**
 * Runs the verifiedDevice gate for `steps` iterations. Returns a
 * Merkle-rooted record. Throws nothing — ghost-GPU detections are
 * recorded structurally so the canary regression can assert on them.
 */
export function runSoak({ steps = DEFAULT_STEPS, seed = DEFAULT_SEED, canary = null, device = 'cuda:0', streams = 'per-op' } = {}) {
  const ghostGpuEvents = [];
  let merkleAccumulator = canonicalDigest({ type: 'MCOP_VERIFIED_DEVICE_SOAK_INIT', seed: `0x${seed.toString(16).toUpperCase()}`, device, streams });
  let firstGhostGPUStep = null;
  let lastVerified = null;
  let halted = false;

  for (let step = 0; step < steps; step += 1) {
    const op = KERNEL_NAMES[step % KERNEL_NAMES.length];
    const isCanary = canary !== null && step === canary;
    const provider = isCanary ? 'CPUExecutionProvider' : 'CUDAExecutionProvider';
    const profilerOutput = buildProfilerPayload(op, provider, step);
    const verified = parseExecutionProvider(profilerOutput);
    lastVerified = verified;

    if (verified !== 'CUDAExecutionProvider') {
      ghostGpuEvents.push({
        step,
        op,
        kernel: KERNEL_TO_OPERATION[op],
        verifiedProvider: verified,
        canary: isCanary,
      });
      if (firstGhostGPUStep === null) firstGhostGPUStep = step;
      halted = true;
      break;
    }

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

  const completedSteps = halted ? firstGhostGPUStep : steps;
  const opCoverage = {};
  for (let i = 0; i < completedSteps; i += 1) {
    const op = KERNEL_NAMES[i % KERNEL_NAMES.length];
    opCoverage[op] = (opCoverage[op] ?? 0) + 1;
  }

  return {
    steps,
    completedSteps,
    halted,
    firstGhostGPUStep,
    ghostGpuEvents,
    opCoverage,
    lastVerifiedDevice: lastVerified,
    merkleAccumulator,
  };
}

/* ------------------------------------------------------------------ */
/* Programmatic entry point                                           */
/* ------------------------------------------------------------------ */

export function runVerifiedDeviceSoak({
  steps = DEFAULT_STEPS,
  seed = DEFAULT_SEED,
  canary = null,
  device = 'cuda:0',
  streams = 'per-op',
  capturedAt,
  mode = 'smoke',
  log = () => {},
} = {}) {
  log(`MCOP CUDA Φ4 verifiedDevice soak — steps=${steps} seed=0x${seed.toString(16)} canary=${canary} device=${device} streams=${streams}`);
  const soak = runSoak({ steps, seed, canary, device, streams });
  log(`completedSteps=${soak.completedSteps} halted=${soak.halted} firstGhostGPUStep=${soak.firstGhostGPUStep} ghostGpuEvents=${soak.ghostGpuEvents.length}`);

  const isFull = mode === 'full';
  const record = {
    schema: 'mcop-cuda-verified-device-soak/1.0',
    capturedAt: capturedAt ?? process.env.MCOP_BENCH_CAPTURED_AT ?? new Date().toISOString(),
    mode,
    seed: `0x${seed.toString(16).toUpperCase()}`,
    steps: soak.steps,
    completedSteps: soak.completedSteps,
    halted: soak.halted,
    firstGhostGPUStep: soak.firstGhostGPUStep,
    canary,
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
  parseExecutionProvider,
  buildProfilerPayload,
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
  const canary = args.canary !== undefined ? Number.parseInt(args.canary, 10) : null;
  const mode = args.mode === 'full' ? 'full' : 'smoke';
  const out = args.out
    ? resolve(process.cwd(), args.out)
    : resolve(process.cwd(), 'docs', 'benchmarks', 'cuda_verified_device_soak.json');

  const record = runVerifiedDeviceSoak({ steps, seed, canary, mode, log: console.log });
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
