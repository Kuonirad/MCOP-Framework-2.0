"use client";

import React from "react";

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
  quality: {
    humanLikert: number | null;
    automatedScore: number;
    bertScoreF1: number;
  };
  latency: {
    totalMs: number;
    triadMs: number;
    llmMs: number;
  };
}

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

/* ------------------------------------------------------------------ */
/* Interactive Task Uploader                                          */
/* ------------------------------------------------------------------ */

function TaskUploader() {
  return (
    <section
      aria-labelledby="uploader-heading"
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6"
    >
      <h2 id="uploader-heading" className="text-lg font-semibold">
        Upload custom tasks
      </h2>
      <p className="text-sm text-slate-400">
        Paste a JSON array of tasks (each with <code>id</code>,{" "}
        <code>domain</code>, <code>humanPrompt</code>,{" "}
        <code>goalKeywords</code>) to preview how they would be scored.
      </p>
      <form
        action="/api/benchmarks/upload"
        method="POST"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const textarea = form.querySelector("textarea") as HTMLTextAreaElement;
          try {
            const tasks = JSON.parse(textarea.value);
            if (!Array.isArray(tasks)) throw new Error("Expected an array");
            const params = new URLSearchParams();
            params.set("tasks", JSON.stringify(tasks));
            window.open(`/benchmarks/preview?${params.toString()}`, "_blank");
          } catch (err) {
            alert("Invalid JSON: " + (err as Error).message);
          }
        }}
      >
        <textarea
          name="tasks"
          rows={5}
          className="rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          placeholder={`[\n  {\n    "id": "my-task",\n    "domain": "generic",\n    "humanPrompt": "Summarize the quarterly earnings.",\n    "goalKeywords": ["earnings", "quarterly", "summary"]\n  }\n]`}
        />
        <div className="flex gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 px-4 py-1.5 text-sm font-medium text-emerald-300 transition hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Preview scoring
          </button>
          <a
            href="/api/benchmarks/sample"
            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Download sample JSON
          </a>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Live Merkle Explorer                                               */
/* ------------------------------------------------------------------ */

function MerkleExplorer({ runs }: { runs: ReadonlyArray<BenchmarkRun> }) {
  const auditableRuns = runs.filter((r) => r.auditable && r.merkleRoot);
  const [selectedRoot, setSelectedRoot] = React.useState<string | null>(null);

  const selectedRun = selectedRoot
    ? auditableRuns.find((r) => r.merkleRoot === selectedRoot)
    : null;

  return (
    <section
      aria-labelledby="merkle-heading"
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6"
    >
      <h2 id="merkle-heading" className="text-lg font-semibold">
        Live Merkle Explorer
      </h2>
      <p className="text-sm text-slate-400">
        Every MCOP-mediated run emits a SHA-256 Merkle root. Select a root to
        inspect the provenance chain. These roots are RFC 8785 canonical
        digests — reproducible across Python and TypeScript implementations.
      </p>

      <div className="flex flex-wrap gap-2">
        {auditableRuns.map((run) => (
          <button
            key={run.merkleRoot!}
            onClick={() => setSelectedRoot(run.merkleRoot)}
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition ${
              selectedRoot === run.merkleRoot
                ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30"
            }`}
          >
            {run.taskId}:{run.merkleRoot!.slice(0, 8)}…
          </button>
        ))}
      </div>

      {selectedRun && (
        <div className="mt-2 rounded-xl border border-emerald-300/20 bg-emerald-500/[0.03] p-4">
          <div className="grid gap-2 font-mono text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Task</span>
              <span>{selectedRun.taskId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mode</span>
              <span>{modeLabel(selectedRun.mode)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Merkle Root</span>
              <span className="text-emerald-300">{selectedRun.merkleRoot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Goal Coverage</span>
              <span>{(selectedRun.goalCoverage * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Latency</span>
              <span>{selectedRun.latency.totalMs.toFixed(2)} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Triad overhead</span>
              <span>{selectedRun.latency.triadMs.toFixed(2)} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Quality (auto)</span>
              <span>{selectedRun.quality.automatedScore.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">BERTScore F1</span>
              <span>{selectedRun.quality.bertScoreF1.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default TaskUploader;
export { MerkleExplorer, type BenchmarkRun };
