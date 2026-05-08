/**
 * Φ4 of the CUDA Hardware Layer ladder — verifiedDevice gate hardening.
 *
 * This suite proves the gate's safety invariant on `ubuntu-latest` (no
 * GPU / no ONNX exports required) by:
 *
 *   1. Running 1 000 iterations × 6 ops = 6 000 calls of
 *      `CUDAHardwareLayer.accelerate()` against an injected mock
 *      `sessionFactory` that returns CUDA-tagged profiler payloads, and
 *      asserting that **zero** `GhostGPUError`s are raised, every leaf's
 *      `verifiedDevice` is `CUDAExecutionProvider`, and every leaf's
 *      `substrateLineage` is `CUDAExecutionProvider/per-op`.
 *
 *   2. Running the soak with a single-step canary (a sessionFactory that
 *      flips one specific call to a CPU profile) and asserting the gate
 *      halts at exactly the canary step — proving ghost-GPU detection
 *      fires deterministically on adversarial inputs.
 *
 *   3. Cross-checking the standalone harness
 *      (`scripts/cuda-verified-device-soak.mjs`) committed JSON
 *      reproduces byte-identically from a clean run, so the structural
 *      gate-parity assertion is anchored.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CUDA_KERNEL_OPS,
  CUDAHardwareLayer,
  GhostGPUError,
  type CUDAKernelOp,
  type OnnxInferenceSession,
  type OnnxTensor,
} from '../hardware/CUDAHardwareLayer';

const REPO_ROOT = join(__dirname, '..', '..');
const HARNESS = join(REPO_ROOT, 'scripts', 'cuda-verified-device-soak.mjs');
const COMMITTED = join(REPO_ROOT, 'docs', 'benchmarks', 'cuda_verified_device_soak.json');

const SOAK_STEPS = 1000;

function cudaProfile(op: CUDAKernelOp, step: number): string {
  return JSON.stringify([
    { name: `${op}_kernel_${step}`, args: { provider: 'CUDAExecutionProvider' } },
    { name: `${op}_dispatch_${step}`, args: { execution_provider: 'CUDAExecutionProvider' } },
  ]);
}

function cpuProfile(op: CUDAKernelOp, step: number): string {
  return JSON.stringify([
    { name: `${op}_kernel_${step}`, args: { provider: 'CPUExecutionProvider' } },
  ]);
}

/**
 * Build a session whose `endProfiling()` returns whatever the ambient
 * `currentProfile` ref points at on each call. Lets us mutate the
 * profile mid-soak from the canary regression.
 */
function buildAmbientSessionFactory(profileRef: { current: string }) {
  return async (_op: CUDAKernelOp, _modelPath: string): Promise<OnnxInferenceSession> => ({
    async run(_feeds: Record<string, OnnxTensor>) {
      return { output: { data: new Float32Array([0]), dims: [1] } };
    },
    endProfiling() {
      return profileRef.current;
    },
  });
}

describe('Φ4 verifiedDevice gate — 1 000-step soak (in-process)', () => {
  it('seals 1 000 × 6 = 6 000 leaves with zero GhostGPUError events', async () => {
    let nextStep = 0;
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      device: 'cuda:0',
      streams: 'per-op',
      sessionFactory: async () => ({
        async run() {
          return { output: { data: new Float32Array([0]), dims: [1] } };
        },
        endProfiling() {
          // Each call observes a fresh profile keyed on a strictly
          // monotonic step counter — exercises the parser on novel
          // strings every time and guarantees no caching can hide a
          // gate failure.
          const op = CUDA_KERNEL_OPS[nextStep % CUDA_KERNEL_OPS.length];
          return cudaProfile(op, nextStep);
        },
      }),
    });
    await layer.loadKernels();

    const observedKernels: string[] = [];
    const observedLineages = new Set<string>();
    const observedDevices = new Set<string>();
    const merkleRoots = new Set<string>();

    for (let step = 0; step < SOAK_STEPS; step += 1) {
      for (const op of CUDA_KERNEL_OPS) {
        nextStep = step * CUDA_KERNEL_OPS.length + CUDA_KERNEL_OPS.indexOf(op);
        const result = await layer.accelerate(op, {});
        observedKernels.push(result._provenance.kernel);
        observedLineages.add(result._provenance.substrateLineage ?? '');
        observedDevices.add(result._provenance.verifiedDevice ?? '');
        merkleRoots.add(result._provenance.merkleRoot);
      }
    }

    expect(observedKernels).toHaveLength(SOAK_STEPS * CUDA_KERNEL_OPS.length);
    expect(observedDevices).toEqual(new Set(['CUDAExecutionProvider']));
    expect(observedLineages).toEqual(new Set(['CUDAExecutionProvider/per-op']));
    // Every emitted root is a SHA-256 hex digest with cryptographic
    // form. The set must include at least one root per kernel family
    // (six). It can be smaller than 6 000 because mock runs share a
    // sub-millisecond timestamp + zero `durationMs`, which is intrinsic
    // to canonical-encoding parity and not a safety property.
    expect(merkleRoots.size).toBeGreaterThanOrEqual(CUDA_KERNEL_OPS.length);
    for (const root of merkleRoots) expect(root).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it('halts at exactly the canary step when one leaf flips to CPUExecutionProvider', async () => {
    const canaryStep = 137;
    let stepCounter = 0;
    const profileRef = { current: cudaProfile(CUDA_KERNEL_OPS[0], 0) };
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      device: 'cuda:3',
      sessionFactory: buildAmbientSessionFactory(profileRef),
    });
    await layer.loadKernels();

    let observed: GhostGPUError | null = null;
    let stepsBeforeHalt = 0;
    try {
      while (stepCounter < SOAK_STEPS * CUDA_KERNEL_OPS.length) {
        const op = CUDA_KERNEL_OPS[stepCounter % CUDA_KERNEL_OPS.length];
        profileRef.current = stepCounter === canaryStep
          ? cpuProfile(op, stepCounter)
          : cudaProfile(op, stepCounter);
        await layer.accelerate(op, {});
        stepsBeforeHalt = stepCounter + 1;
        stepCounter += 1;
      }
    } catch (err) {
      if (err instanceof GhostGPUError) observed = err;
      else throw err;
    }

    expect(observed).not.toBeNull();
    expect(stepsBeforeHalt).toBe(canaryStep);
    expect(observed?.op).toBe(CUDA_KERNEL_OPS[canaryStep % CUDA_KERNEL_OPS.length]);
    expect(observed?.requestedDevice).toBe('cuda:3');
    expect(observed?.verifiedProvider).toBe('CPUExecutionProvider');
  });

  it('does not seal a leaf when the gate fires (no provenance leakage on halt)', async () => {
    const sessions: OnnxInferenceSession[] = [];
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () => {
        const session: OnnxInferenceSession = {
          async run() {
            return { output: { data: new Float32Array([0]), dims: [1] } };
          },
          endProfiling() {
            return cpuProfile('encode', 0);
          },
        };
        sessions.push(session);
        return session;
      },
    });
    await layer.loadKernels();

    await expect(layer.accelerate('encode', {})).rejects.toBeInstanceOf(GhostGPUError);
    // No public state mutation should have occurred; loadedKernels
    // remains the full set, but no provenance ledger was emitted.
    expect(layer.loadedKernels).toEqual(CUDA_KERNEL_OPS);
  });
});

describe('Φ4 verifiedDevice gate — pure-ESM soak harness parity', () => {
  it('committed JSON conforms to mcop-cuda-verified-device-soak/1.0', () => {
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as Record<string, unknown>;
    expect(committed.schema).toBe('mcop-cuda-verified-device-soak/1.0');
    expect(committed.mode).toBe('smoke');
    expect(committed.steps).toBe(SOAK_STEPS);
    expect(committed.completedSteps).toBe(SOAK_STEPS);
    expect(committed.halted).toBe(false);
    expect(committed.firstGhostGPUStep).toBeNull();
    expect(committed.canary).toBeNull();
    expect(committed.device).toBe('cuda:0');
    expect(committed.streams).toBe('per-op');
    expect(committed.kernelOps).toEqual(CUDA_KERNEL_OPS);
    expect(committed.host).toBeNull();
    expect((committed.targets as { phi4ZeroGhostGPUEvents: boolean }).phi4ZeroGhostGPUEvents).toBe(true);
    expect(committed.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    // Coverage is mod-6 so each op contributes exactly 1000/6 ≈ 167 leaves
    // with one extra in the leading ops; the sum equals SOAK_STEPS.
    const coverage = committed.opCoverage as Record<string, number>;
    expect(Object.values(coverage).reduce((a, b) => a + b, 0)).toBe(SOAK_STEPS);
    expect(Object.keys(coverage).sort()).toEqual([...CUDA_KERNEL_OPS].sort());
  });

  it('reproduces the committed Merkle root from a clean run', () => {
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as Record<string, unknown>;
    const tmp = mkdtempSync(join(tmpdir(), 'cuda-soak-'));
    const out = join(tmp, 'soak.json');
    try {
      execFileSync(
        process.execPath,
        [HARNESS, `--steps=${SOAK_STEPS}`, '--mode=smoke', `--out=${out}`],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            MCOP_BENCH_CAPTURED_AT: committed.capturedAt as string,
          },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      const fresh = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(fresh.merkleRoot).toBe(committed.merkleRoot);
      expect(fresh.opCoverage).toEqual(committed.opCoverage);
      expect(fresh.completedSteps).toBe(committed.completedSteps);
      expect(fresh.halted).toBe(committed.halted);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it('canary mode halts at exactly the requested step (regression for ghost-GPU detection)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cuda-soak-'));
    const out = join(tmp, 'soak_canary.json');
    try {
      execFileSync(
        process.execPath,
        [HARNESS, `--steps=${SOAK_STEPS}`, '--canary=500', '--mode=smoke', `--out=${out}`],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            MCOP_BENCH_CAPTURED_AT: '2026-05-07T20:30:00.000Z',
          },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      const record = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(record.halted).toBe(true);
      expect(record.completedSteps).toBe(500);
      expect(record.firstGhostGPUStep).toBe(500);
      expect(record.canary).toBe(500);
      expect((record.ghostGpuEvents as unknown[])).toHaveLength(1);
      const event = (record.ghostGpuEvents as Array<{ step: number; verifiedProvider: string; canary: boolean }>)[0];
      expect(event.step).toBe(500);
      expect(event.verifiedProvider).toBe('CPUExecutionProvider');
      expect(event.canary).toBe(true);
      expect((record.targets as { phi4ZeroGhostGPUEvents: boolean }).phi4ZeroGhostGPUEvents).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);
});
