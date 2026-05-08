import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Φ2 + Φ3 harness regression test.
 *
 * The smoke-mode JSON artifacts under `docs/benchmarks/cuda_<op>.json`
 * are committed to the repo as deterministic structural baselines
 * (host-dependent timings stripped). For each of the six op-sharded
 * kernels this test:
 *   1. Asserts the committed JSON conforms to the mcop-cuda-bench/1.1 schema.
 *   2. Re-runs the harness in a child process with a pinned
 *      `capturedAt` and asserts the resulting `merkleRoot`,
 *      `outputFingerprint`, fixture meta, and seed all reproduce
 *      byte-identically.
 *   3. Asserts the CUDA slot reports `skipped` (CPU-only runner).
 *
 * If a future change to the kernel, PRNG, canonical encoding, or
 * stream-allocation default shifts the Merkle root, this test catches
 * it before the JSON drifts on disk.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'benchmark-cuda-graph.mjs');

interface HarnessRecord {
  schema: string;
  capturedAt: string;
  op: string;
  description: string;
  mode: 'smoke' | 'full';
  seed: string;
  fixture: Record<string, unknown> & { lowMemory: boolean };
  iterations: { warmup: number; timed: number };
  streams: 'per-op' | 'shared';
  host: { platform: string; arch: string; nodeVersion: string } | null;
  cpu: { provider: string; mode: string; verifiedDevice: string; outputFingerprint: string };
  cuda: { skipped: string } | { provider: string; verifiedDevice: string };
  speedup: number | null;
  targets: { phi2GoalSpeedup: number; phi2Met: boolean };
  merkleRoot: string;
}

interface OpCase {
  op: string;
  artifact: string;
}

const OP_CASES: readonly OpCase[] = Object.freeze([
  { op: 'encode', artifact: 'cuda_encode.json' },
  { op: 'graphAggregate', artifact: 'cuda_graph_aggregate.json' },
  { op: 'holographicUpdate', artifact: 'cuda_holographic_update.json' },
  { op: 'cosineRecall', artifact: 'cuda_cosine_recall.json' },
  { op: 'evolveScore', artifact: 'cuda_evolve_score.json' },
  { op: 'homeostasis', artifact: 'cuda_homeostasis.json' },
]);

function committedPath(artifact: string): string {
  return resolve(REPO_ROOT, 'docs', 'benchmarks', artifact);
}

function readCommitted(artifact: string): HarnessRecord {
  return JSON.parse(readFileSync(committedPath(artifact), 'utf8')) as HarnessRecord;
}

function runHarness(op: string, capturedAt: string): HarnessRecord {
  // Run the harness in a one-off child so jest's module graph isn't polluted
  // by the ESM script's top-level constants. The output JSON is written to
  // a tmpdir so the test never touches the committed file.
  const dir = mkdtempSync(join(tmpdir(), 'mcop-cuda-bench-'));
  const tmpOut = join(dir, `cuda_${op}.json`);
  try {
    execFileSync(
      process.execPath,
      [SCRIPT, `--op=${op}`, '--mode=smoke', `--out=${tmpOut}`],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, MCOP_BENCH_CAPTURED_AT: capturedAt, MCOP_ENABLE_CUDA: '0', MCOP_LOW_MEMORY_MODE: '' },
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    );
    return JSON.parse(readFileSync(tmpOut, 'utf8')) as HarnessRecord;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Φ2/Φ3 cuda-graph benchmark harness', () => {
  it.each(OP_CASES)('$op committed JSON conforms to mcop-cuda-bench/1.1', ({ op, artifact }) => {
    const committed = readCommitted(artifact);
    expect(committed.schema).toBe('mcop-cuda-bench/1.1');
    expect(committed.op).toBe(op);
    expect(committed.mode).toBe('smoke');
    expect(committed.streams).toBe('per-op'); // Φ3 default
    expect(committed.iterations.warmup).toBe(2);
    expect(committed.iterations.timed).toBe(8);
    expect(committed.host).toBeNull(); // smoke mode strips host info for portability
    expect(committed.cpu.verifiedDevice).toBe('cpu');
    expect(committed.cpu.outputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(committed.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    expect(committed.targets.phi2GoalSpeedup).toBe(3);
    expect(committed.targets.phi2Met).toBe(false); // smoke mode never claims Φ2 met
    expect(committed.fixture.lowMemory).toBe(false);
    expect(typeof committed.description).toBe('string');
    expect(committed.description.length).toBeGreaterThan(0);
  });

  it.each(OP_CASES)(
    '$op reproduces the committed Merkle root from a clean run',
    ({ op, artifact }) => {
      const committed = readCommitted(artifact);
      const fresh = runHarness(op, committed.capturedAt);
      expect(fresh.merkleRoot).toBe(committed.merkleRoot);
      expect(fresh.cpu.outputFingerprint).toBe(committed.cpu.outputFingerprint);
      expect(fresh.seed).toBe(committed.seed);
      expect(fresh.fixture).toEqual(committed.fixture);
      expect(fresh.streams).toBe(committed.streams);
    },
    30_000,
  );

  it.each(OP_CASES)('$op reports CUDA as skipped in smoke mode', ({ artifact }) => {
    const committed = readCommitted(artifact);
    expect('skipped' in committed.cuda).toBe(true);
    if ('skipped' in committed.cuda) {
      expect(committed.cuda.skipped).toMatch(/enableCuda=false|MCOP_ENABLE_CUDA/);
    }
  });
});
