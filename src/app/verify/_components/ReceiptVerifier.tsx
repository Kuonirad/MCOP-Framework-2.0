"use client";

import { useEffect, useMemo, useState } from "react";

import {
  receiptMatchesAnchor,
  verifyReceipt,
  type ReasoningReceipt,
  type ReasoningSessionBundle,
} from "@/core/reasoningReceipts";

interface ClaimText {
  id?: number;
  kind?: string;
  text?: string;
  [key: string]: unknown;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; bundle: ReasoningSessionBundle };

/** Truncate a 64-hex digest for display. */
function short(hex: string): string {
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}

/**
 * Verify one receipt, optionally against a reader-supplied override of the
 * claim text. The override is how the page lets a reader tamper with the data
 * and watch the proof break — all locally, in their browser.
 */
function checkReceipt(
  receipt: ReasoningReceipt,
  anchoredRoot: string,
  override?: unknown,
): { valid: boolean; reason?: string } {
  const subject: ReasoningReceipt =
    override === undefined ? receipt : { ...receipt, claim: override };
  const result = verifyReceipt(subject);
  if (!result.valid) return result;
  if (!receiptMatchesAnchor(subject, anchoredRoot)) {
    return { valid: false, reason: "root-mismatch" };
  }
  return { valid: true };
}

export function ReceiptVerifier({ bundleUrl }: { bundleUrl: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // Map of leafIndex → edited claim text (the reader's tampering).
  const [edits, setEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(bundleUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        return r.json();
      })
      .then((bundle: ReasoningSessionBundle) => {
        if (!cancelled) setState({ status: "ready", bundle });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bundleUrl]);

  const verified = useMemo(() => {
    if (state.status !== "ready") return null;
    const { bundle } = state;
    return bundle.receipts.map((receipt) => {
      const edited = edits[receipt.leafIndex];
      let override: unknown;
      if (edited !== undefined) {
        const base = receipt.claim as ClaimText;
        override = { ...base, text: edited };
      }
      return { receipt, ...checkReceipt(receipt, bundle.root, override) };
    });
  }, [state, edits]);

  if (state.status === "loading") {
    return <p className="text-sm text-slate-400">Loading reasoning session…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-rose-300">
        Could not load the session bundle ({state.message}).
      </p>
    );
  }

  const { bundle } = state;
  const allValid = verified?.every((v) => v.valid) ?? false;
  const anyTampered = Object.keys(edits).length > 0;

  return (
    <section className="flex flex-col gap-6">
      <div
        className={`flex flex-col gap-2 rounded-2xl border p-5 ${
          allValid
            ? "border-emerald-400/30 bg-emerald-400/[0.04]"
            : "border-rose-400/40 bg-rose-400/[0.05]"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {bundle.title ?? "Reasoning session"}
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              allValid ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"
            }`}
          >
            {allValid ? "ALL RECEIPTS VERIFIED" : "VERIFICATION FAILED"}
          </span>
        </div>
        <dl className="grid grid-cols-1 gap-1 text-sm text-slate-300/85 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-400">Published root</dt>
            <dd className="font-mono text-emerald-200/90">{short(bundle.root)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Claims</dt>
            <dd className="font-mono">{bundle.size}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Epoch</dt>
            <dd className="font-mono">{bundle.epoch}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Verified by</dt>
            <dd>your browser, locally</dd>
          </div>
        </dl>
        {anyTampered && (
          <p className="text-xs text-amber-200/80">
            You have edited {Object.keys(edits).length} claim(s). The proofs
            below are being re-folded live — edited claims no longer hash to
            their committed leaf, so their receipts break.
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        {verified?.map(({ receipt, valid, reason }) => {
          const claim = receipt.claim as ClaimText;
          const edited = edits[receipt.leafIndex];
          const displayText = edited ?? claim.text ?? JSON.stringify(claim);
          return (
            <li
              key={receipt.leafIndex}
              className={`flex flex-col gap-3 rounded-xl border p-4 ${
                valid ? "border-white/10 bg-white/[0.02]" : "border-rose-400/40 bg-rose-400/[0.06]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      valid ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/20 text-rose-200"
                    }`}
                  >
                    {valid ? "✓" : "✕"}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-slate-400">
                    claim #{receipt.leafIndex}
                    {claim.kind ? ` · ${claim.kind}` : ""}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {receipt.proof.length}-step proof · id {short(receipt.receiptId)}
                </span>
              </div>

              <label className="flex flex-col gap-1">
                <span className="sr-only">Claim text (editable to test tampering)</span>
                <textarea
                  value={displayText}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [receipt.leafIndex]: e.target.value }))
                  }
                  rows={2}
                  className="w-full resize-y rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300/50 focus:outline-none"
                />
              </label>

              <div className="flex items-center justify-between gap-3 text-xs">
                <span className={valid ? "text-emerald-300/80" : "text-rose-300"}>
                  {valid
                    ? "claim ∈ session(root) — proof folds to the published root"
                    : `broken: ${reason ?? "invalid"}`}
                </span>
                {edited !== undefined && (
                  <button
                    type="button"
                    onClick={() =>
                      setEdits((prev) => {
                        const next = { ...prev };
                        delete next[receipt.leafIndex];
                        return next;
                      })
                    }
                    className="rounded-full border border-white/20 px-3 py-1 font-medium transition hover:border-white/50"
                  >
                    restore original
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-slate-500">
        Leaf digest = RFC 8785 canonical-JSON SHA-256 of the claim. Tree =
        RFC 6962 (0x00/0x01 domain separation), bagged into one Merkle Mountain
        Range root. The same <code className="text-slate-400">leafEntryForClaim</code> and
        proof-folding run here, in Node, and in Python — byte for byte.
      </p>
    </section>
  );
}
