import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Benchmark Preview · MCOP Framework",
  robots: { index: false, follow: false },
};

interface UploadedTask {
  id: string;
  domain: string;
  humanPrompt: string;
  goalKeywords: string[];
}

export default function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tasks?: string }>;
}) {
  return (
    <Preview searchParams={searchParams} />
  );
}

async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ tasks?: string }>;
}) {
  const params = await searchParams;
  const tasks: UploadedTask[] = (() => {
    try {
      const raw = params.tasks;
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (t): t is UploadedTask =>
          typeof t.id === "string" &&
          typeof t.domain === "string" &&
          typeof t.humanPrompt === "string" &&
          Array.isArray(t.goalKeywords)
      );
    } catch {
      return [];
    }
  })();

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,#0b1220_0%,#000000_55%,#020617_100%)] text-slate-100">
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Benchmark Preview</h1>
          <p className="text-sm text-slate-400">
            Tasks uploaded for preview. These are not persisted — run{" "}
            <code className="font-mono text-xs">runPromptingBenchmark</code>{" "}
            locally to score them.
          </p>
          <Link
            href="/benchmarks"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium transition hover:border-white/50"
          >
            ← Back to benchmarks
          </Link>
        </header>

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-slate-400">
            No valid tasks found in URL. Upload tasks from the{" "}
            <Link href="/benchmarks" className="underline hover:text-white">
              benchmarks page
            </Link>{" "}
            to preview them here.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-400">
              {tasks.length} task{tasks.length > 1 ? "s" : ""} ready for scoring:
            </p>
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-emerald-300">
                    {task.id}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">
                    {task.domain}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-200">{task.humanPrompt}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {task.goalKeywords.map((k) => (
                    <span
                      key={k}
                      className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
