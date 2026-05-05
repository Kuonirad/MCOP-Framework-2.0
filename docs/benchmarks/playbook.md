# MCOP Benchmarking Playbook v1.0

> **Status:** Published · **Version:** mcop-benchmark/2.0 · **Date:** 2026-05-05
>
> Source: [`docs/benchmarks/playbook.md`](./playbook.md) ·
> Snapshot: [`docs/benchmarks/results.json`](./results.json) ·
> Dashboard: [`/benchmarks`](../../src/app/benchmarks/page.tsx) ·
> Engine: [`src/benchmarks/promptingModes.ts`](../../src/benchmarks/promptingModes.ts)

---

## 1. What This Playbook Covers

This document is a self-contained guide to replicating, extending, and publishing MCOP benchmark studies. It assumes you have a checkout of `Kuonirad/MCOP-Framework-2.0` and a working Node.js / pnpm environment.

**After reading this playbook you will know how to:**

1. Reproduce the canonical 5-task benchmark snapshot locally.
2. Run the expanded 25-task suite (legal, medical, code, scientific).
3. Evaluate quality with both automated and human Likert scoring.
4. Measure end-to-end latency, triad overhead, and LLM call latency.
5. Plug in a real LLM backend (Claude, GPT-4o, Grok-2) for comparative studies.
6. Add new tasks without breaking snapshot determinism.
7. Publish results with Merkle-rooted provenance for peer review.

---

## 2. Quick Start (5 Minutes)

```bash
# 1. Clone
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0

# 2. Install
pnpm install

# 3. Assert the committed snapshot (no LLM keys needed)
pnpm test -- benchmarks

# Expected output: 21 tests passed, 0 failed
```

If this passes, your environment is correctly reproducing the deterministic baseline.

---

## 3. Schema Overview (v2.0)

The benchmark report is a JSON document with four top-level keys:

| Key | Description |
| --- | --- |
| `version` | `mcop-benchmark/2.0` (schema identifier) |
| `capturedAt` | ISO-8601 timestamp of the run |
| `tasks` | Array of task definitions (`id`, `domain`, `humanPrompt`, `goalKeywords`) |
| `runs` | One record per (task × mode) — 3 runs per task |
| `summary` | Aggregated averages per mode |

### Per-run fields (v2.0 additions in **bold**)

| Field | Type | Description |
| --- | --- | --- |
| `mode` | `human-only` \| `pure-ai` \| `mcop-mediated` | Prompting strategy |
| `taskId` | string | Reference to task definition |
| `inputTokens` | number | Tokens in the dispatched prompt |
| `outputTokens` | number | Tokens in the LLM response |
| `totalTokens` | number | Sum of input + output |
| `dispatchedPromptLength` | number | Characters sent to LLM |
| `goalCoverage` | number [0,1] | Fraction of goal keywords present in response |
| `auditable` | boolean | Whether a Merkle root was produced |
| `merkleRoot` | string \| null | SHA-256 etch hash (MCOP-mediated only) |
| **`quality.humanLikert`** | number \| null | 1–5 human evaluator score |
| **`quality.automatedScore`** | number [0,1] | Semantic similarity against goal keywords |
| **`quality.bertScoreF1`** | number [0,1] | Length-normalized keyword density F1 |
| **`latency.totalMs`** | number | End-to-end pipeline latency |
| **`latency.triadMs`** | number | Time in encode → resonate → synthesize → etch |
| **`latency.llmMs`** | number | Time in the LLM call itself |

### Summary fields (v2.0 additions)

All per-run fields are averaged into the summary, plus:

- `avgHumanLikert` — average human score (null if unrated)
- `avgAutomatedScore` — average automated semantic similarity
- `avgBertScoreF1` — average BERTScore-style F1
- `avgLatencyMs` — average end-to-end latency
- `avgTriadMs` — average triad overhead
- `avgLlmMs` — average LLM call latency

---

## 4. Reproducing the Canonical Snapshot

The canonical snapshot uses **deterministic mock completions** — no API keys, no network, no non-determinism. This is by design: the JSON in `docs/benchmarks/results.json` must be byte-identical across runs so CI can act as a regression guard.

### Regenerate the snapshot

```bash
BENCHMARK_GENERATE=1 pnpm test -- benchmarks
git diff docs/benchmarks/results.json
```

If the diff is empty, the current code produces the same deterministic output as the committed snapshot. If it differs, inspect whether:

1. You changed `CANONICAL_BENCHMARK_TASKS` (expected — tasks are API).
2. You changed tokenization logic (expected if deliberate).
3. You introduced a non-deterministic mock or timestamp leak (bug — fix before merging).

---

## 5. Running the Expanded 25-Task Suite

The expanded fixture adds 20 tasks across four new domains:

| Domain | Tasks | Example |
| --- | --- | --- |
| `legal` | 5 | Contract clauses, discovery motions, GDPR privacy notices |
| `medical` | 5 | Differential diagnoses, discharge summaries, SOAP notes |
| `code` | 5 | Rust lock-free buffers, API migrations, SQL optimization |
| `scientific` | 5 | Paper abstracts, methods sections, falsifiable hypotheses |

### Run expanded suite

```typescript
import { runPromptingBenchmark, EXPANDED_BENCHMARK_TASKS } from './src/benchmarks/promptingModes';

const report = await runPromptingBenchmark({
  tasks: EXPANDED_BENCHMARK_TASKS,
});
console.log(JSON.stringify(report.summary, null, 2));
```

Or via Jest:

```bash
pnpm test -- benchmarks   # includes a test that exercises the 25-task fixture
```

---

## 6. Plugging In a Real LLM Backend

The benchmark runner accepts a custom `llm` function. To run against Claude 3.5, GPT-4o, or Grok-2:

```typescript
import { runPromptingBenchmark, CANONICAL_BENCHMARK_TASKS } from './src/benchmarks/promptingModes';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const llm = async ({ mode, task, dispatchedPrompt }) => {
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: dispatchedPrompt }],
  });
  return response.content[0].text;
};

const report = await runPromptingBenchmark({
  tasks: CANONICAL_BENCHMARK_TASKS,
  llm,
});
```

**Important:** Real LLM outputs are non-deterministic. When using a live backend, do **not** assert against the committed `results.json` snapshot. Instead, write the report to a separate file (e.g., `docs/benchmarks/results-claude-3-5.json`) and compare summaries manually or via a tolerance-aware diff.

### Comparative study protocol

To run a head-to-head comparative study:

1. Fix the task fixture (use `CANONICAL_BENCHMARK_TASKS` for reproducibility).
2. Run against Backend A (e.g., Claude 3.5) → save `results-a.json`.
3. Run against Backend B (e.g., GPT-4o) → save `results-b.json`.
4. Run against Backend C (e.g., Grok-2) → save `results-c.json`.
5. Run the MCOP-mediated pipeline against each backend → save `results-mcop-a.json`, etc.
6. Compare summaries on: tokens, coverage, latency, quality scores, auditable runs.

See [`docs/benchmarks/comparative-study-2026.md`](./comparative-study-2026.md) for the first published comparative study against Claude 3.5 / GPT-4o / Grok-2.

---

## 7. Human Likert Evaluation Protocol

Automated scores (`automatedScore`, `bertScoreF1`) are fast and deterministic, but they proxy quality through keyword presence. For publication-grade benchmarks, add human Likert ratings:

### Blinded evaluation setup

1. Export all responses (human-only, pure-ai, mcop-mediated) for each task.
2. Shuffle and anonymize — evaluators must not know which mode produced which response.
3. Score each response 1–5 on:
   - **Relevance** (does it address the prompt?)
   - **Accuracy** (are facts correct?)
   - **Conciseness** (is it free of fluff?)
   - **Structure** (is it well-organized?)
4. Average the four dimensions into a single Likert score.
5. Map back to mode/task and populate `quality.humanLikert`.

The deterministic benchmark runner uses a seeded `humanLikertFor()` function to exercise the schema without requiring live evaluators. Replace this with real ratings when running a published study.

---

## 8. Latency Measurement Guide

The benchmark captures three latency measurements:

| Measurement | How it is captured | Typical range |
| --- | --- | --- |
| `totalMs` | `performance.now()` at pipeline start → end | 3–15 ms (mock) |
| `triadMs` | `performance.now()` inside `adapter.generate()` start → end | 0.5–2 ms |
| `llmMs` | `totalMs - triadMs` | 2–12 ms |

When using a real LLM backend, `llmMs` will dominate (100–3000 ms depending on provider and prompt length). The `triadMs` overhead remains sub-5 ms even with the full MCOP stack because the triad runs locally without network calls.

**Pro tip:** To measure triad latency in isolation, run `adapter.prepare(prompt)` instead of `adapter.generate(prompt)`. This executes encode → resonate → synthesize → etch without dispatching to the LLM.

---

## 9. Adding New Tasks

Tasks are the only user-editable part of the benchmark that does not require code changes. To add a task:

1. Define it in `src/benchmarks/promptingModes.ts` under `EXPANDED_BENCHMARK_TASKS` (or a new array):

```typescript
{
  id: 'my-new-task',
  domain: 'generic',   // or 'legal', 'medical', 'code', 'scientific', etc.
  humanPrompt: 'Your hand-authored prompt here.',
  goalKeywords: ['keyword-a', 'keyword-b', 'keyword-c'],
}
```

2. Regenerate the snapshot:

```bash
BENCHMARK_GENERATE=1 pnpm test -- benchmarks
```

3. Review the diff:

```bash
git diff docs/benchmarks/results.json
```

4. Commit the new task + updated snapshot in the same PR.

**Rules for task quality:**

- `id` must be kebab-case, unique across the fixture.
- `domain` must be one of the declared union types (extend the type if needed).
- `humanPrompt` should be the actual prompt a human would write — no preprocessing.
- `goalKeywords` should be the minimal set of concepts that prove the response is on-task.

---

## 10. Publishing Benchmark Results

When publishing a benchmark study (paper, blog post, whitepaper extension):

1. **Commit the raw JSON** to `docs/benchmarks/` with a descriptive filename:
   - `results.json` — canonical deterministic snapshot (always present)
   - `results-claude-3-5-2026-05.json` — live backend study
2. **Link the Merkle roots** in your prose. Every MCOP-mediated run carries a root like `4b0e712e…8811`. These are reproducible: anyone with the same prompt + code can recompute the identical hash.
3. **Include the schema version** so future readers know which fields to expect.
4. **Archive the code version** via Git commit SHA. The benchmark is only reproducible if the exact code is preserved.

---

## 11. FAQ

**Q: Can I run benchmarks without pnpm?**
A: Yes — any Node.js package manager works. The tests use Jest, which is installed as a devDependency.

**Q: Why are token counts approximate?**
A: We use a deterministic whitespace tokenizer rather than BPE (GPT-2/GPT-4 tokenizer). The goal is comparability across modes, not exact API billing prediction. If you need real token counts, replace `approximateTokens` with `tiktoken` or the provider's usage block.

**Q: How do I benchmark against my own LLM?**
A: Pass a custom `llm` function to `runPromptingBenchmark()`. See Section 6.

**Q: What if I want to benchmark image or video generation?**
A: The current fixture is text-completion only. Extend the runner by adding a new `BenchmarkTask` subtype with `mediaGoal` instead of `goalKeywords`, and swap the mock LLM for a mock image/video client. The triad (encode → resonate → etch) is media-agnostic.

**Q: Can I run the benchmark in a browser?**
A: Yes — the `/benchmarks` route includes a task uploader that previews scoring client-side. For full benchmark execution, use Node.js (the adapter stack depends on `crypto` and `perf_hooks`).

---

## 12. Changelog

| Date | Version | Change |
| --- | --- | --- |
| 2026-04-27 | mcop-benchmark/1.0 | Initial schema: tokens, coverage, auditability |
| 2026-05-05 | mcop-benchmark/2.0 | Added quality (human Likert + automated), latency (total/triad/llm), expanded to 25 tasks |

---

*End of Playbook v1.0*
