import type { Metadata } from "next";
import Link from "next/link";

import { DialecticalStudio } from "./_components/DialecticalStudio";

export const metadata: Metadata = {
  title: "Dialectical Studio · MCOP Framework",
  description:
    "Visual surface for the MCOP dialectical synthesizer — type a thesis, watch entropy and stigmergic resonance update, optionally veto or rewrite, and copy a Merkle-rooted ProvenanceMetadata bundle.",
};

const SEED_PROMPTS = [
  "Compose a campaign brief for an aurora-lit cathedral series.",
  "Outline a research agenda for verifiable, stigmergic multi-agent coordination.",
];

export default function DialecticalPage() {
  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,#0b1220_0%,#000000_55%,#020617_100%)] text-slate-100">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 focus:outline-none"
      >
        <header className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.4em] text-violet-300/80">
            Adapter Protocol v2.1 · Triad stage 3
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Dialectical Studio
          </h1>
          <p className="max-w-3xl text-base text-slate-300/85">
            Every MCOP adapter funnels prompts through the dialectical
            synthesizer before dispatch — appending continuity tags when
            stigmergic resonance fires, honouring human vetoes, and
            stamping a Merkle-rooted ProvenanceMetadata bundle. This page
            surfaces that loop directly so you can drive it with your own
            prompts and watch every intermediate signal in real time.
          </p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            ← Back to overview
          </Link>
        </header>

        <DialecticalStudio seedPrompts={SEED_PROMPTS} />

        <section
          aria-labelledby="how-it-works-heading"
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6"
        >
          <h2
            id="how-it-works-heading"
            className="text-lg font-semibold"
          >
            How the loop works
          </h2>
          <ol className="ml-5 list-decimal text-sm text-slate-300/85">
            <li>
              The thesis is encoded by{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">
                NovaNeoEncoder
              </code>{" "}
              into a 64-dim normalised tensor; entropy is reported live.
            </li>
            <li>
              Stigmergy v5 returns a cosine-similarity resonance score against
              prior etched traces. Click <em>Etch &amp; seed resonance</em>{" "}
              to record the current thesis as a future anchor.
            </li>
            <li>
              The dialectical synthesizer composes thesis + resonance +
              optional human feedback (veto, rewrite, notes) into the refined
              prompt every adapter dispatches.
            </li>
            <li>
              <em>Copy provenance JSON</em> emits the same{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">
                mcop.dialectical.studio/v1
              </code>{" "}
              bundle you would archive alongside any production call.
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
