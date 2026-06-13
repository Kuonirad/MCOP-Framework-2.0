import type { Metadata } from "next";
import Link from "next/link";

import { ReceiptVerifier } from "./_components/ReceiptVerifier";

export const metadata: Metadata = {
  title: "Verifiable Reasoning Receipts · MCOP Framework",
  description:
    "A published reasoning session where every claim carries a few-kilobyte Merkle Mountain Range receipt your own browser verifies locally against one published root. Edit any claim and watch its proof break. The reader becomes the verifier.",
};

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,#0b1220_0%,#000000_55%,#020617_100%)] text-slate-100">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16 focus:outline-none"
      >
        <header className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-300/80">
            Provenance · Merkle Mountain Range · epoch mmr-rfc6962-sha256/1
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Verifiable Reasoning Receipts
          </h1>
          <p className="max-w-3xl text-base text-slate-300/85">
            Below is a real reasoning session — the argument behind the D1
            resonance calibration — committed to an append-only Merkle Mountain
            Range. Every claim carries a few-kilobyte inclusion proof. This page
            ships no answer key: your browser recomputes each leaf digest and
            folds each proof to the one published root, using the same portable
            SHA-256 substrate the encoder runs in-browser. Nothing here is taken
            on trust from a badge.
          </p>
          <p className="max-w-3xl text-sm text-amber-200/80">
            What a green check proves: <span className="font-medium">this claim
            was committed to a session with this root, unaltered since.</span> It
            does <span className="font-medium">not</span> prove the claim is
            true or the reasoning sound — determinism makes a computation
            replayable, not wise. To trust the root itself, compare it to an
            independently published one.
          </p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            ← Back to overview
          </Link>
        </header>

        <ReceiptVerifier bundleUrl="/receipts/d1-calibration.json" />
      </main>
    </div>
  );
}
