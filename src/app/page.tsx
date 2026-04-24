import TriadVisualizer from "./_components/TriadVisualizer";

/**
 * MCOP Framework Visualizer — production landing page that replaces the
 * Create Next App starter. LCP-optimized: the hero is pure text+CSS (no
 * blocking images), the triad diagram is an inline SVG rendered on the
 * server, and every font is preloaded with display-swap fallbacks.
 */
export default function Home() {
  const metrics: Array<{ label: string; value: string; hint: string }> = [
    { label: "Entropy target", value: "0.07", hint: "Crystalline determinism" },
    { label: "Resonance", value: "≥ 0.5", hint: "Default cosine threshold" },
    { label: "Confidence floor", value: "0.8", hint: "Adaptive confidence engine" },
    { label: "Trace buffer", value: "O(1)", hint: "Circular-buffer storage" },
  ];

  const kernels: Array<{ title: string; body: string; tone: string }> = [
    {
      title: "NOVA-NEO Encoder",
      body: "Deterministic SHA-256 hashing pipeline producing fixed-dimension tensors with optional L2 normalization and entropy estimates.",
      tone: "from-sky-500/20 to-sky-500/5 ring-sky-400/40",
    },
    {
      title: "Stigmergy v5",
      body: "Vector pheromone store with cosine resonance scoring, configurable thresholds, Merkle-proof chaining, and bounded circular memory.",
      tone: "from-violet-500/20 to-violet-500/5 ring-violet-400/40",
    },
    {
      title: "Holographic Etch",
      body: "Rank-1 micro-etch accumulator guarded by an adaptive confidence engine; skipped submissions land on a dedicated audit ring.",
      tone: "from-emerald-500/20 to-emerald-500/5 ring-emerald-400/40",
    },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-950 via-black to-slate-950 text-slate-100">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-16 focus:outline-none"
      >
        <header className="flex flex-col gap-6">
          <p className="text-xs uppercase tracking-[0.4em] text-sky-300/80">
            Meta-Cognitive Optimization Protocol
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            MCOP Framework{" "}
            <span className="bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
              2.0
            </span>
          </h1>
          <p className="max-w-3xl text-lg text-slate-300 sm:text-xl">
            Deterministic, auditable triad orchestration. Crystalline entropy
            targets, Merkle-tracked pheromones, and rank-1 micro-etches —
            packaged for research, prototyping, and production deployment.
          </p>
          <nav
            aria-label="Primary"
            className="flex flex-wrap gap-3 pt-2 text-sm font-medium"
          >
            <a
              className="rounded-full bg-white px-5 py-2 text-slate-950 shadow-lg shadow-sky-500/10 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0#readme"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the docs
            </a>
            <a
              className="rounded-full border border-white/20 px-5 py-2 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source on GitHub
            </a>
            <a
              className="rounded-full border border-white/20 px-5 py-2 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              href="/api/health"
            >
              Health endpoint
            </a>
          </nav>
        </header>

        <section aria-labelledby="triad-heading" className="flex flex-col gap-6">
          <h2 id="triad-heading" className="text-2xl font-semibold">
            The triad at a glance
          </h2>
          <TriadVisualizer />
        </section>

        <section aria-labelledby="kernels-heading" className="flex flex-col gap-6">
          <h2 id="kernels-heading" className="text-2xl font-semibold">
            Active kernels
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {kernels.map((k) => (
              <article
                key={k.title}
                className={`rounded-2xl bg-gradient-to-br ${k.tone} p-6 ring-1 backdrop-blur`}
              >
                <h3 className="text-lg font-semibold">{k.title}</h3>
                <p className="mt-2 text-sm text-slate-200/80">{k.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="metrics-heading" className="flex flex-col gap-6">
          <h2 id="metrics-heading" className="text-2xl font-semibold">
            Live defaults
          </h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  {m.label}
                </dt>
                <dd className="mt-1 font-mono text-2xl">{m.value}</dd>
                <p className="mt-1 text-xs text-slate-400">{m.hint}</p>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-slate-400">
          <span>© {new Date().getFullYear()} KullAI Labs · MIT licensed</span>
          <div className="flex gap-4">
            <a
              className="hover:text-slate-100"
              href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/ARCHITECTURE.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Architecture
            </a>
            <a
              className="hover:text-slate-100"
              href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Security
            </a>
            <a
              className="hover:text-slate-100"
              href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Contributing
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
