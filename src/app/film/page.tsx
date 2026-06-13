// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import type { Metadata } from "next";
import Link from "next/link";

import { FilmCredits } from "./_components/FilmCredits";

export const metadata: Metadata = {
  title: "The Credits Are a Root Hash · MCOP Framework",
  description:
    "A long-form AI film whose every shot is Merkle-traceable to its prompt, seed, adapter call, and the fingerprint of the previously generated clip it conditioned on. Your browser verifies the whole provenance sidecar locally. Edit a shot and watch the lineage break.",
};

export default function FilmPage() {
  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,#0b1220_0%,#000000_55%,#020617_100%)] text-slate-100">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16 focus:outline-none"
      >
        <header className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.4em] text-sky-300/80">
            Provenanced film · Direct Forcing · mcop-film-provenance/1.0
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            The credits are a root hash
          </h1>
          <p className="max-w-3xl text-base text-slate-300/85">
            Below is the provenance sidecar of a long-form generated film — a
            lunar traverse. Every shot is sealed into an append-only Merkle
            Mountain Range, and each shot cryptographically records the
            fingerprint of the clip it conditioned on through Direct Forcing. One
            credit root anchors the whole film. Your browser folds every
            shot&apos;s proof and re-checks the Direct Forcing chain locally; edit
            a shot and its lineage breaks in front of you.
          </p>
          <p className="max-w-3xl text-sm text-amber-200/80">
            What a verified film proves: <span className="font-medium">these
            shots, in this order, each conditioned on the previous one&apos;s
            real output, unaltered since the root was published.</span> It
            does{" "}
            <span className="font-medium">not</span> prove the footage depicts
            anything real, nor that a prompt&apos;s provenance is the training
            data&apos;s provenance.
          </p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            ← Back to overview
          </Link>
        </header>

        <FilmCredits sidecarUrl="/films/lunar-documentary.provenance.json" />
      </main>
    </div>
  );
}
