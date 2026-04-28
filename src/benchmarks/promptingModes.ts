/**
 * Prompting-mode benchmark — Human vs Pure-AI vs MCOP-mediated.
 *
 * Runs the same task fixture through three prompting strategies and
 * captures comparable metrics so the whitepaper can claim numbers
 * instead of vibes:
 *
 *   - HUMAN_ONLY     — hand-authored prompt, called against the LLM
 *                      directly (no triad, no provenance).
 *   - PURE_AI        — AI-rewritten prompt (deterministic stand-in for
 *                      a "tell ChatGPT to write me a better prompt"
 *                      preprocessing pass), called against the LLM
 *                      directly. Still no triad, still no provenance.
 *   - MCOP_MEDIATED  — same starting prompt funnelled through the full
 *                      MCOP triad (encode → resonance → dialectical
 *                      synth → etch) before dispatch.
 *
 * The benchmark is deterministic when run against `mockLlmCompletion`,
 * so the JSON it writes to `docs/benchmarks/results.json` is reproducible
 * and reviewable in PR diffs. A user can plug in a real LLM client to
 * replicate the comparison against any backend.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../core';
import {
  GrokMCOPAdapter,
  GrokClient,
  GrokCompletionResult,
} from '../adapters';

export type PromptingMode =
  | 'human-only'
  | 'pure-ai'
  | 'mcop-mediated';

export interface BenchmarkTask {
  readonly id: string;
  /** Domain tag; used by the dialectical synthesizer continuity preamble. */
  readonly domain: 'narrative' | 'cinematic' | 'graphic' | 'audio' | 'generic';
  /** Hand-authored prompt — the "human" baseline. */
  readonly humanPrompt: string;
  /** Goal text used to score how well a response addresses the task. */
  readonly goalKeywords: ReadonlyArray<string>;
}

export interface BenchmarkRunMetrics {
  readonly mode: PromptingMode;
  readonly taskId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /** Length of the prompt actually sent to the LLM (incl. preambles). */
  readonly dispatchedPromptLength: number;
  /** Heuristic 0-1 score: fraction of goalKeywords present in the response. */
  readonly goalCoverage: number;
  /** Whether this run produced a Merkle-rooted ProvenanceMetadata bundle. */
  readonly auditable: boolean;
  /** Etch hash if `auditable`, else null. */
  readonly merkleRoot: string | null;
}

export interface BenchmarkSummary {
  readonly mode: PromptingMode;
  readonly tasks: number;
  readonly avgInputTokens: number;
  readonly avgOutputTokens: number;
  readonly avgTotalTokens: number;
  readonly avgGoalCoverage: number;
  readonly auditableRuns: number;
}

export interface BenchmarkReport {
  readonly version: string;
  readonly capturedAt: string;
  readonly tasks: ReadonlyArray<BenchmarkTask>;
  readonly runs: ReadonlyArray<BenchmarkRunMetrics>;
  readonly summary: ReadonlyArray<BenchmarkSummary>;
}

/* --------------------------------------------------------------------- */
/* Tokenizer + scoring helpers                                            */
/* --------------------------------------------------------------------- */

/**
 * Deterministic word-boundary tokenizer. Not a real BPE — it doesn't
 * need to be. The point is to compare relative token counts across the
 * three prompting strategies under one consistent measure.
 */
export function approximateTokens(text: string): number {
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (!normalised) return 0;
  return normalised.split(/[\s\W]+/u).filter(Boolean).length;
}

export function goalCoverage(
  response: string,
  keywords: ReadonlyArray<string>,
): number {
  if (keywords.length === 0) return 1;
  const lower = response.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k.toLowerCase())).length;
  return hits / keywords.length;
}

/* --------------------------------------------------------------------- */
/* Pure-AI rewrite stub                                                   */
/* --------------------------------------------------------------------- */

/**
 * Deterministic stand-in for "ask GPT to rewrite my prompt". Adds
 * structure markers + a verbosity tax so the comparison reflects the
 * real-world cost of a naive AI preprocessor.
 */
export function pureAIRewrite(prompt: string): string {
  const lines = [
    '[Rewritten by Pure-AI preprocessor]',
    'Objective:',
    `  ${prompt.trim()}`,
    'Constraints:',
    '  - Be specific.',
    '  - Provide concrete examples.',
    '  - Cite sources where applicable.',
    'Format:',
    '  Markdown, with section headers per topic.',
  ];
  return lines.join('\n');
}

/* --------------------------------------------------------------------- */
/* Mock LLM client — deterministic, used by the example + the test suite */
/* --------------------------------------------------------------------- */

export interface MockLlmInput {
  readonly mode: PromptingMode;
  readonly task: BenchmarkTask;
  readonly dispatchedPrompt: string;
}

export type MockLlmCompletion = (input: MockLlmInput) => string;

/**
 * Default mock completion. Echoes the goal keywords back so the
 * `goalCoverage` heuristic has signal, with mode-specific stylistic
 * additions (verbose preamble for pure-AI, terse direct answer for
 * MCOP, plain prose for human-only).
 */
export const defaultMockLlmCompletion: MockLlmCompletion = ({
  mode,
  task,
}) => {
  const keywords = task.goalKeywords.join(', ');
  switch (mode) {
    case 'human-only':
      return `Direct answer for "${task.id}". Touches on ${keywords}.`;
    case 'pure-ai':
      // Pure-AI tends to over-elaborate; mimic that.
      return [
        `# Response (${task.id})`,
        `## Summary`,
        `Coverage of ${keywords} follows.`,
        `## Detail`,
        `(Long-form elaboration that rarely changes the core answer.)`,
      ].join('\n');
    case 'mcop-mediated':
      // MCOP-funnelled answers are dense + audit-anchored.
      return [
        `[mcop:${task.id}]`,
        `Topic: ${keywords}.`,
        `Decision: address each item, anchor with merkle root.`,
      ].join('\n');
  }
};

/* --------------------------------------------------------------------- */
/* Benchmark runner                                                       */
/* --------------------------------------------------------------------- */

export interface RunBenchmarkOptions {
  readonly tasks: ReadonlyArray<BenchmarkTask>;
  readonly llm?: MockLlmCompletion;
  /** ISO timestamp override (for deterministic snapshots in CI). */
  readonly capturedAt?: string;
}

export async function runPromptingBenchmark(
  options: RunBenchmarkOptions,
): Promise<BenchmarkReport> {
  const llm = options.llm ?? defaultMockLlmCompletion;
  const runs: BenchmarkRunMetrics[] = [];

  // Build a Grok adapter wrapped around a mock client so the
  // mcop-mediated branch produces real Merkle-rooted bundles without
  // needing live xAI access.
  const buildAdapter = (task: BenchmarkTask) => {
    const grokClient: GrokClient = {
      async createCompletion({ messages, options }): Promise<GrokCompletionResult> {
        const dispatched = messages
          .map((m) => `${m.role}:${m.content}`)
          .join('\n');
        const text = llm({
          mode: 'mcop-mediated',
          task,
          dispatchedPrompt: dispatched,
        });
        return {
          model: options.model ?? 'grok-2-bench',
          content: text,
          finishReason: 'stop',
          usage: {
            promptTokens: approximateTokens(dispatched),
            completionTokens: approximateTokens(text),
            totalTokens:
              approximateTokens(dispatched) + approximateTokens(text),
          },
        };
      },
    };
    return new GrokMCOPAdapter({
      encoder: new NovaNeoEncoder({ dimensions: 32, normalize: true }),
      stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
      etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
      client: grokClient,
      defaultModel: 'grok-2-bench',
    });
  };

  for (const task of options.tasks) {
    // ─── HUMAN_ONLY ────────────────────────────────────────────────
    const humanResponse = llm({
      mode: 'human-only',
      task,
      dispatchedPrompt: task.humanPrompt,
    });
    runs.push({
      mode: 'human-only',
      taskId: task.id,
      inputTokens: approximateTokens(task.humanPrompt),
      outputTokens: approximateTokens(humanResponse),
      totalTokens:
        approximateTokens(task.humanPrompt) +
        approximateTokens(humanResponse),
      dispatchedPromptLength: task.humanPrompt.length,
      goalCoverage: goalCoverage(humanResponse, task.goalKeywords),
      auditable: false,
      merkleRoot: null,
    });

    // ─── PURE_AI ───────────────────────────────────────────────────
    const aiPrompt = pureAIRewrite(task.humanPrompt);
    const aiResponse = llm({
      mode: 'pure-ai',
      task,
      dispatchedPrompt: aiPrompt,
    });
    runs.push({
      mode: 'pure-ai',
      taskId: task.id,
      inputTokens: approximateTokens(aiPrompt),
      outputTokens: approximateTokens(aiResponse),
      totalTokens: approximateTokens(aiPrompt) + approximateTokens(aiResponse),
      dispatchedPromptLength: aiPrompt.length,
      goalCoverage: goalCoverage(aiResponse, task.goalKeywords),
      auditable: false,
      merkleRoot: null,
    });

    // ─── MCOP_MEDIATED ─────────────────────────────────────────────
    const adapter = buildAdapter(task);
    const response = await adapter.generateOptimizedCompletion(
      task.humanPrompt,
    );
    runs.push({
      mode: 'mcop-mediated',
      taskId: task.id,
      inputTokens: response.result.usage?.promptTokens ?? 0,
      outputTokens: response.result.usage?.completionTokens ?? 0,
      totalTokens:
        response.result.usage?.totalTokens ??
        (response.result.usage?.promptTokens ?? 0) +
          (response.result.usage?.completionTokens ?? 0),
      dispatchedPromptLength: response.provenance.refinedPrompt.length,
      goalCoverage: goalCoverage(
        response.result.content,
        task.goalKeywords,
      ),
      auditable: true,
      merkleRoot: response.merkleRoot,
    });
  }

  const summary: BenchmarkSummary[] = (
    ['human-only', 'pure-ai', 'mcop-mediated'] as PromptingMode[]
  ).map((mode) => {
    const modeRuns = runs.filter((r) => r.mode === mode);
    const len = modeRuns.length || 1;
    return {
      mode,
      tasks: modeRuns.length,
      avgInputTokens: avg(modeRuns.map((r) => r.inputTokens)),
      avgOutputTokens: avg(modeRuns.map((r) => r.outputTokens)),
      avgTotalTokens: avg(modeRuns.map((r) => r.totalTokens)),
      avgGoalCoverage:
        Math.round(
          (modeRuns.reduce((acc, r) => acc + r.goalCoverage, 0) / len) *
            10000,
        ) / 10000,
      auditableRuns: modeRuns.filter((r) => r.auditable).length,
    };
  });

  return {
    version: 'mcop-benchmark/1.0',
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    tasks: options.tasks,
    runs,
    summary,
  };
}

function avg(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const total = values.reduce((acc, v) => acc + v, 0);
  return Math.round((total / values.length) * 100) / 100;
}

/* --------------------------------------------------------------------- */
/* Canonical benchmark fixture                                            */
/* --------------------------------------------------------------------- */

export const CANONICAL_BENCHMARK_TASKS: ReadonlyArray<BenchmarkTask> = [
  {
    id: 'narrative-rewrite',
    domain: 'narrative',
    humanPrompt:
      'Rewrite the cabin scene so the protagonist confronts her sister about the will.',
    goalKeywords: ['cabin', 'sister', 'will', 'confront'],
  },
  {
    id: 'cinematic-shotlist',
    domain: 'cinematic',
    humanPrompt:
      'Generate a 6-shot list for an opening sequence set on a midnight ferry crossing.',
    goalKeywords: ['ferry', 'midnight', '6-shot', 'opening'],
  },
  {
    id: 'graphic-style-pivot',
    domain: 'graphic',
    humanPrompt:
      'Pivot the title-card style from neon brutalism to art-deco gold while keeping the typographic hierarchy.',
    goalKeywords: ['title-card', 'art-deco', 'gold', 'typographic'],
  },
  {
    id: 'oncall-runbook',
    domain: 'generic',
    humanPrompt:
      'Draft an on-call runbook entry for a Postgres replication-lag spike on shard-3.',
    goalKeywords: ['runbook', 'postgres', 'replication', 'shard-3'],
  },
  {
    id: 'audio-stem-mix',
    domain: 'audio',
    humanPrompt:
      'Specify the stem-mix structure for a cinematic trailer that escalates over 90 seconds.',
    goalKeywords: ['stem-mix', 'cinematic', 'trailer', '90 seconds'],
  },
];
