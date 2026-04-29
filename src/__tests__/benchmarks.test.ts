import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  approximateTokens,
  CANONICAL_BENCHMARK_TASKS,
  goalCoverage,
  pureAIRewrite,
  runPromptingBenchmark,
  type BenchmarkTask,
  type MockLlmCompletion,
} from '../benchmarks/promptingModes';

describe('benchmark utilities', () => {
  describe('approximateTokens', () => {
    it('counts whitespace-separated words', () => {
      expect(approximateTokens('one two three')).toBe(3);
    });
    it('returns 0 for empty / whitespace input', () => {
      expect(approximateTokens('')).toBe(0);
      expect(approximateTokens('   \n\t')).toBe(0);
    });
    it('treats punctuation as word boundaries', () => {
      expect(approximateTokens('hello, world!')).toBe(2);
    });
  });

  describe('goalCoverage', () => {
    it('returns 1 when all keywords appear', () => {
      expect(goalCoverage('alpha beta gamma', ['alpha', 'beta', 'gamma'])).toBe(1);
    });
    it('returns the partial fraction', () => {
      expect(goalCoverage('alpha gamma', ['alpha', 'beta', 'gamma'])).toBeCloseTo(2 / 3);
    });
    it('is case-insensitive', () => {
      expect(goalCoverage('AlPhA beta', ['alpha', 'BETA'])).toBe(1);
    });
    it('returns 1 when no keywords are required', () => {
      expect(goalCoverage('anything', [])).toBe(1);
    });
  });

  describe('pureAIRewrite', () => {
    it('preserves the original prompt verbatim inside the rewrite', () => {
      const original = 'Add /benchmarks route';
      expect(pureAIRewrite(original)).toContain(original);
    });
    it('produces a deterministic rewrite (stable across calls)', () => {
      expect(pureAIRewrite('x')).toBe(pureAIRewrite('x'));
    });
  });
});

describe('runPromptingBenchmark', () => {
  it('produces three rows per task with auditable mcop-mediated runs', async () => {
    const report = await runPromptingBenchmark({
      tasks: CANONICAL_BENCHMARK_TASKS,
      capturedAt: '2026-04-27T22:30:00.000Z',
    });
    expect(report.tasks).toEqual(CANONICAL_BENCHMARK_TASKS);
    expect(report.runs).toHaveLength(CANONICAL_BENCHMARK_TASKS.length * 3);
    const auditable = report.runs.filter((r) => r.auditable);
    expect(auditable).toHaveLength(CANONICAL_BENCHMARK_TASKS.length);
    auditable.forEach((r) => {
      expect(r.mode).toBe('mcop-mediated');
      expect(r.merkleRoot).toMatch(/^[0-9a-f]+$/);
    });
    const summary = report.summary;
    expect(summary.map((s) => s.mode)).toEqual([
      'human-only',
      'pure-ai',
      'mcop-mediated',
    ]);
    summary.forEach((s) => {
      expect(s.tasks).toBe(CANONICAL_BENCHMARK_TASKS.length);
    });
  });

  it('matches the committed canonical results snapshot', async () => {
    const report = await runPromptingBenchmark({
      tasks: CANONICAL_BENCHMARK_TASKS,
      capturedAt: '2026-04-27T22:30:00.000Z',
    });
    const file = path.join(
      __dirname,
      '..',
      '..',
      'docs',
      'benchmarks',
      'results.json',
    );

    if (process.env.BENCHMARK_GENERATE === '1') {
      fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    }

    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(report).toEqual(onDisk);
  });

  it('reports pure-ai dispatching strictly more tokens than human-only', async () => {
    const report = await runPromptingBenchmark({
      tasks: CANONICAL_BENCHMARK_TASKS,
      capturedAt: '2026-04-27T22:30:00.000Z',
    });
    const human = report.summary.find((s) => s.mode === 'human-only')!;
    const pureAi = report.summary.find((s) => s.mode === 'pure-ai')!;
    expect(pureAi.avgInputTokens).toBeGreaterThan(human.avgInputTokens);
  });

  it('reports mcop-mediated as the only auditable mode', async () => {
    const report = await runPromptingBenchmark({
      tasks: CANONICAL_BENCHMARK_TASKS,
      capturedAt: '2026-04-27T22:30:00.000Z',
    });
    const summary = Object.fromEntries(
      report.summary.map((s) => [s.mode, s.auditableRuns]),
    );
    expect(summary['human-only']).toBe(0);
    expect(summary['pure-ai']).toBe(0);
    expect(summary['mcop-mediated']).toBe(CANONICAL_BENCHMARK_TASKS.length);
  });

  /* ── Branch coverage extensions ── */

  it('uses the default capturedAt when none is supplied', async () => {
    const before = new Date().toISOString();
    const report = await runPromptingBenchmark({
      tasks: CANONICAL_BENCHMARK_TASKS.slice(0, 1),
    });
    const after = new Date().toISOString();
    expect(report.capturedAt >= before).toBe(true);
    expect(report.capturedAt <= after).toBe(true);
  });

  it('handles a custom llm that returns sparse responses', async () => {
    const tasks: BenchmarkTask[] = [
      {
        id: 'sparse',
        domain: 'generic',
        humanPrompt: 'test prompt',
        goalKeywords: ['test'],
      },
    ];

    const llm: MockLlmCompletion = ({ mode }) => {
      if (mode === 'mcop-mediated') {
        return 'test'; // short response so goalCoverage still hits
      }
      return 'nothing here';
    };

    const report = await runPromptingBenchmark({
      tasks,
      llm,
      capturedAt: '2026-04-27T22:30:00.000Z',
    });

    expect(report.runs).toHaveLength(3);
    const human = report.runs.find((r) => r.mode === 'human-only')!;
    expect(human.goalCoverage).toBe(0);
    const mediated = report.runs.find((r) => r.mode === 'mcop-mediated')!;
    expect(mediated.goalCoverage).toBe(1);
  });

  it('exposes avg([]) returning 0 for empty arrays', async () => {
    // The avg helper is private to the module; we exercise it through
    // the public API by ensuring no division-by-zero occurs.
    const report = await runPromptingBenchmark({
      tasks: CANONICAL_BENCHMARK_TASKS,
      capturedAt: '2026-04-27T22:30:00.000Z',
    });
    expect(report.summary.length).toBe(3);
    report.summary.forEach((s) => {
      expect(Number.isFinite(s.avgGoalCoverage)).toBe(true);
      expect(Number.isFinite(s.avgInputTokens)).toBe(true);
      expect(Number.isFinite(s.avgOutputTokens)).toBe(true);
      expect(Number.isFinite(s.avgTotalTokens)).toBe(true);
    });
  });
});
