import type { Metadata } from "next";
import Link from "next/link";

import results from "../../../docs/benchmarks/results.json";

export const metadata: Metadata = {
  title: "Benchmarks · MCOP Framework",
  description:
    "Reproducible Human vs Pure-AI vs MCOP-mediated prompting benchmark. Average tokens, goal coverage, and audit-trail availability across the canonical task fixture.",
};

interface BenchmarkSummary {
  mode: string;
  tasks: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgGoalCoverage: number;
  auditableRuns: number;
}

interface BenchmarkRun {
  mode: string;
  taskId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  dispatchedPromptLength: number;
  goalCoverage: number;
  auditable: boolean;
  merkleRoot: string | null;
}

interface BenchmarkTask {
  id: string;
  domain: string;
  humanPrompt: string;
  goalKeywords: ReadonlyArray<string>;
}

interface BenchmarkReport {
  version: string;
  capturedAt: string;
  tasks: ReadonlyArray<BenchmarkTask>;
  runs: ReadonlyArray<BenchmarkRun>;
  summary: ReadonlyArray<BenchmarkSummary>;
}

const report = results as BenchmarkReport;

function modeLabel(mode: string): string {
  switch (mode) {
    case "human-only":
      return "Human-only";
    case "pure-ai":
      return "Pure-AI rewrite";
    case "mcop-mediated":
      return "MCOP-mediated";
    default:
      return mode;
  }
}

export default function BenchmarksPage() {
  const human = report.summary.find((s) => s.mode === "human-only");
  const pureAi = report.summary.find((s) => s.mode === "pure-ai");
  const mcop = report.summary.find((s) => s.mode === "mcop-mediated");

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,#0b1220_0%,#000000_55%,#020617_100%)] text-slate-100">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 focus:outline-none"
      >
        <header className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-300/80">
            Benchmarks · Adapter Protocol v2.1
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Human vs Pure-AI vs MCOP-mediated
          </h1>
          <p className="max-w-3xl text-base text-slate-300/85">
            A reproducible comparison of three prompting strategies on the
            canonical five-task fixture: average tokens, goal coverage, and
            audit-trail availability. The full methodology lives in{" "}
            <Link
              href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/docs/benchmarks/methodology.md"
              className="underline decoration-dotted underline-offset-4 hover:text-white"
            >
              docs/benchmarks/methodology.md
            </Link>{" "}
            and the whitepaper that quotes these numbers is{" "}
            <Link
              href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/docs/whitepapers/Human_vs_PureAI_Prompting.md"
              className="underline decoration-dotted underline-offset-4 hover:text-white"
            >
              docs/whitepapers/Human_vs_PureAI_Prompting.md
            </Link>
            .
          </p>
          <p className="text-xs text-slate-400">
            Snapshot version <code className="font-mono">{report.version}</code>{" "}
            · captured at{" "}
            <time className="font-mono">{report.capturedAt}</time>
          </p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            ← Back to overview
          </Link>
        </header>

        <section
          aria-labelledby="summary-heading"
          className="flex flex-col gap-4"
        >
          <h2 id="summary-heading" className="text-2xl font-semibold">
            Summary
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-white/[0.04] text-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Mode</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Tasks
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Avg input tokens
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Avg output tokens
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Avg total tokens
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Goal coverage
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Auditable runs
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.summary.map((row) => {
                  const isMcop = row.mode === "mcop-mediated";
                  return (
                    <tr
                      key={row.mode}
                      className={
                        isMcop
                          ? "border-t border-white/10 bg-emerald-500/5"
                          : "border-t border-white/10"
                      }
                    >
                      <td className="px-4 py-3 font-medium">
                        {modeLabel(row.mode)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.tasks}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.avgInputTokens}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.avgOutputTokens}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.avgTotalTokens}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {(row.avgGoalCoverage * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {row.auditableRuns} / {row.tasks}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {human && pureAi && mcop ? (
            <p
              data-testid="benchmark-headline"
              className="text-sm text-slate-300/90"
            >
              Pure-AI rewrite costs{" "}
              <strong>
                {((pureAi.avgTotalTokens / human.avgTotalTokens - 1) * 100).toFixed(0)}%
              </strong>{" "}
              more tokens than human-only without improving coverage. MCOP
              mediation adds only{" "}
              <strong>
                {((mcop.avgTotalTokens / human.avgTotalTokens - 1) * 100).toFixed(0)}%
              </strong>{" "}
              and is the only mode emitting Merkle-rooted provenance —
              {mcop.auditableRuns} of {mcop.tasks} runs auditable.
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="tasks-heading"
          className="flex flex-col gap-4"
        >
          <h2 id="tasks-heading" className="text-2xl font-semibold">
            Per-task detail
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-white/[0.04] text-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Task</th>
                  <th className="px-4 py-3 text-left font-semibold">Mode</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Total tokens
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Coverage
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Merkle root
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((run, idx) => (
                  <tr
                    key={`${run.taskId}-${run.mode}-${idx}`}
                    className="border-t border-white/10"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {run.taskId}
                    </td>
                    <td className="px-4 py-3">{modeLabel(run.mode)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {run.totalTokens}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(run.goalCoverage * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {run.merkleRoot
                        ? `${run.merkleRoot.slice(0, 12)}…${run.merkleRoot.slice(-6)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="reproduce-heading"
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6"
        >
          <h2
            id="reproduce-heading"
            className="text-lg font-semibold"
          >
            Reproduce locally
          </h2>
          <pre className="overflow-x-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-200">
{`pnpm install
pnpm test -- benchmarks               # asserts the committed snapshot
BENCHMARK_GENERATE=1 pnpm test -- benchmarks   # regenerates results.json
git diff docs/benchmarks/results.json          # inspect any drift`}
          </pre>
        </section>
      </main>
    </div>
  );
}
