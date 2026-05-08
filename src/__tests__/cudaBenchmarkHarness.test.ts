import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Φ2 harness regression test.
 *
 * The smoke-mode `cuda_graph_aggregate.json` artifact is committed to the
 * repo as a deterministic structural baseline (host-dependent timings are
 * stripped). This test re-runs the harness in a child process with a
 * pinned `capturedAt`, then asserts:
 *   1. The committed JSON is structurally well-formed.
 *   2. Re-running the harness reproduces the same `merkleRoot`,
 *      `outputFingerprint`, edge count, and seed.
 *
 * If a future change to the kernel, PRNG, or canonical encoding shifts
 * the Merkle root, this test catches it before the JSON drifts on disk.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'benchmark-cuda-graph.mjs');
const COMMITTED_JSON = resolve(REPO_ROOT, 'docs', 'benchmarks', 'cuda_graph_aggregate.json');

interface HarnessRecord {
  schema: string;
  capturedAt: string;
  mode: 'smoke' | 'full';
  seed: string;
  fixture: { nodeCount: number; edgeCount: number; avgDegree: number; lowMemory: boolean };
  iterations: { warmup: number; timed: number };
  host: { platform: string; arch: string; nodeVersion: string } | null;
  cpu: { provider: string; mode: string; verifiedDevice: string; outputFingerprint: string };
  cuda: { skipped: string } | { provider: string; verifiedDevice: string };
  speedup: number | null;
  targets: { phi2GoalSpeedup: number; phi2Met: boolean };
  merkleRoot: string;
}

function readCommitted(): HarnessRecord {
  return JSON.parse(readFileSync(COMMITTED_JSON, 'utf8')) as HarnessRecord;
}

function runHarness(capturedAt: string): HarnessRecord {
  // Run the harness in a one-off child so jest's module graph isn't polluted
  // by the ESM script's top-level constants. The output JSON is written to
  // a tmpdir so the test never touches the committed file.
  const dir = mkdtempSync(join(tmpdir(), 'mcop-cuda-bench-'));
  const tmpOut = join(dir, 'cuda_graph_aggregate.json');
  try {
    execFileSync(
      process.execPath,
      [SCRIPT, '--mode=smoke', `--out=${tmpOut}`],
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

describe('Φ2 cuda-graph benchmark harness', () => {
  const committed = readCommitted();

  it('committed JSON conforms to mcop-cuda-bench/1.0', () => {
    expect(committed.schema).toBe('mcop-cuda-bench/1.0');
    expect(committed.mode).toBe('smoke');
    expect(committed.fixture.nodeCount).toBe(1024);
    expect(committed.fixture.avgDegree).toBe(12);
    expect(committed.fixture.edgeCount).toBeGreaterThan(0);
    expect(committed.iterations.warmup).toBe(2);
    expect(committed.iterations.timed).toBe(8);
    expect(committed.host).toBeNull(); // smoke mode strips host info for portability
    expect(committed.cpu.verifiedDevice).toBe('cpu');
    expect(committed.cpu.outputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(committed.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    expect(committed.targets.phi2GoalSpeedup).toBe(3);
    expect(committed.targets.phi2Met).toBe(false); // smoke mode never claims Φ2 met
  });

  it('reproduces the committed Merkle root from a clean run', () => {
    const fresh = runHarness(committed.capturedAt);
    expect(fresh.merkleRoot).toBe(committed.merkleRoot);
    expect(fresh.cpu.outputFingerprint).toBe(committed.cpu.outputFingerprint);
    expect(fresh.fixture.edgeCount).toBe(committed.fixture.edgeCount);
    expect(fresh.seed).toBe(committed.seed);
  }, 30_000);

  it('reports CUDA as skipped in smoke mode (no onnxruntime-node + flag off)', () => {
    expect('skipped' in committed.cuda).toBe(true);
    if ('skipped' in committed.cuda) {
      expect(committed.cuda.skipped).toMatch(/enableCuda=false|MCOP_ENABLE_CUDA/);
    }
  });
});
