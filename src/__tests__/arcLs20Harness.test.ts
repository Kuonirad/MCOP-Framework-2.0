// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview v2.4 LS20 ARC harness regression test.
 *
 * The committed smoke-mode JSON under `docs/benchmarks/arc_ls20.json`
 * is a byte-stable structural baseline. This test:
 *   1. Asserts the file conforms to the `mcop-arc-ls20/1.0` schema.
 *   2. Re-runs the harness in a tmpdir-isolated child process with a
 *      pinned `capturedAt` and asserts the Merkle root, per-task
 *      taskRoot, solve counts, and lift reproduce byte-identically.
 *   3. Asserts the proteome's edge-of-chaos knobs come through the
 *      output verbatim from the NOVA-EVOLVE genome.
 *
 * Regression catches any drift in:
 *   - mulberry32 / Box–Muller PRNG order,
 *   - CSR graph construction (must match
 *     `src/proteome/ProteomeOrchestrator.ts`),
 *   - replicator-payoff matrix values,
 *   - the canonical-encoding key ordering,
 *   - the baseline / post-proteome scorer constants.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'benchmark-arc-ls20.mjs');
const COMMITTED = resolve(REPO_ROOT, 'docs', 'benchmarks', 'arc_ls20.json');

interface LS20Record {
  schema: string;
  capturedAt: string;
  mode: 'smoke' | 'full';
  seed: string;
  proteome: {
    nodeCount: number;
    stateDim: number;
    avgDegree: number;
    edgeCount: number;
    steps: number;
    homeostasis: number;
    mutationTemperature: number;
  };
  genome: Record<string, unknown>;
  tasks: Array<{
    id: string;
    baseline: number;
    equilibriumScore: number;
    post: number;
    preSolved: boolean;
    postSolved: boolean;
    taskRoot: string;
  }>;
  summary: {
    taskCount: number;
    preSolved: number;
    postSolved: number;
    preSolveRate: number;
    postSolveRate: number;
    lift: number;
    meanEquilibrium: number;
  };
  targets: { ls20SolveRate: number; phi24Met: boolean };
  host: unknown;
  durationMs: number | null;
  merkleRoot: string;
}

function readCommitted(): LS20Record {
  return JSON.parse(readFileSync(COMMITTED, 'utf8')) as LS20Record;
}

function runHarness(capturedAt: string): LS20Record {
  const dir = mkdtempSync(join(tmpdir(), 'mcop-arc-ls20-'));
  const tmpOut = join(dir, 'arc_ls20.json');
  try {
    execFileSync(process.execPath, [SCRIPT, '--mode=smoke', `--out=${tmpOut}`], {
      cwd: REPO_ROOT,
      env: { ...process.env, MCOP_BENCH_CAPTURED_AT: capturedAt, MCOP_BENCH_QUIET: '1' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return JSON.parse(readFileSync(tmpOut, 'utf8')) as LS20Record;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('v2.4 LS20 ARC harness', () => {
  it('committed JSON conforms to the mcop-arc-ls20/1.0 schema', () => {
    const committed = readCommitted();
    expect(committed.schema).toBe('mcop-arc-ls20/1.0');
    expect(committed.mode).toBe('smoke');
    expect(committed.seed).toMatch(/^0x[0-9A-F]+$/);
    expect(committed.summary.taskCount).toBe(20);
    expect(committed.tasks).toHaveLength(20);
    expect(committed.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    expect(committed.proteome.nodeCount).toBe(150);
    expect(committed.proteome.stateDim).toBe(8);
    expect(committed.proteome.avgDegree).toBe(6);
    expect(committed.targets.ls20SolveRate).toBe(0.5);
    expect(committed.host).toBeNull();
    expect(committed.durationMs).toBeNull();
  });

  it('proteome knobs flow from the NOVA-EVOLVE genome verbatim', () => {
    const committed = readCommitted();
    const genome = committed.genome as { homeostasis: number; mutationTemperature: number };
    expect(committed.proteome.homeostasis).toBe(genome.homeostasis);
    expect(committed.proteome.mutationTemperature).toBe(genome.mutationTemperature);
  });

  it('every task carries a 64-hex taskRoot', () => {
    const committed = readCommitted();
    for (const task of committed.tasks) {
      expect(task.taskRoot).toMatch(/^[a-f0-9]{64}$/);
      expect(task.id).toMatch(/^arc-ls20-\d{2}$/);
      expect(task.post).toBeGreaterThanOrEqual(task.baseline);
    }
  });

  it(
    'reproduces the committed Merkle root + per-task baselines from a clean run',
    () => {
      const committed = readCommitted();
      const fresh = runHarness(committed.capturedAt);
      expect(fresh.merkleRoot).toBe(committed.merkleRoot);
      expect(fresh.summary).toEqual(committed.summary);
      expect(fresh.proteome).toEqual(committed.proteome);
      expect(fresh.tasks.map((t) => t.taskRoot)).toEqual(committed.tasks.map((t) => t.taskRoot));
      expect(fresh.tasks.map((t) => t.baseline)).toEqual(committed.tasks.map((t) => t.baseline));
      expect(fresh.tasks.map((t) => t.post)).toEqual(committed.tasks.map((t) => t.post));
    },
    30_000,
  );

  it('post-proteome solve rate is non-negative lift over baseline', () => {
    const committed = readCommitted();
    expect(committed.summary.postSolveRate).toBeGreaterThanOrEqual(committed.summary.preSolveRate);
    expect(committed.summary.lift).toBeGreaterThanOrEqual(0);
  });
});
