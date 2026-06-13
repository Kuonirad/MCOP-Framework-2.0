// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
"use client";

import { useEffect, useMemo, useState } from "react";

import {
  verifyFilmSidecar,
  type FilmProvenanceSidecar,
  type ShotProvenanceRecord,
} from "@/core/filmProvenance";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sidecar: FilmProvenanceSidecar };

function short(hex: string): string {
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}

/** Apply the reader's edits to the shot records, returning a fresh sidecar. */
function withEdits(
  sidecar: FilmProvenanceSidecar,
  edits: Record<number, string>,
): FilmProvenanceSidecar {
  if (Object.keys(edits).length === 0) return sidecar;
  const shots = sidecar.shots.map((s, i) =>
    edits[i] !== undefined ? ({ ...s, prompt: edits[i] } as ShotProvenanceRecord) : s,
  );
  return { ...sidecar, shots };
}

export function FilmCredits({ sidecarUrl }: { sidecarUrl: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [edits, setEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(sidecarUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        return r.json();
      })
      .then((sidecar: FilmProvenanceSidecar) => {
        if (!cancelled) setState({ status: "ready", sidecar });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sidecarUrl]);

  const verification = useMemo(() => {
    if (state.status !== "ready") return null;
    const edited = withEdits(state.sidecar, edits);
    return verifyFilmSidecar(edited);
  }, [state, edits]);

  if (state.status === "loading") {
    return <p className="text-sm text-slate-400">Loading film provenance…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-rose-300">Could not load the sidecar ({state.message}).</p>
    );
  }

  const { sidecar } = state;
  const allValid = verification?.valid ?? false;
  const badByIndex = new Map(
    (verification?.results ?? []).map((r) => [r.shotIndex, r] as const),
  );

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
          <h2 className="text-lg font-semibold">{sidecar.title ?? "Untitled film"}</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              allValid ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"
            }`}
          >
            {allValid ? "PROVENANCE VERIFIED" : "PROVENANCE BROKEN"}
          </span>
        </div>
        <dl className="grid grid-cols-1 gap-1 text-sm text-slate-300/85 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-400">Credit root</dt>
            <dd className="font-mono text-emerald-200/90">{short(sidecar.creditRoot)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Shots</dt>
            <dd className="font-mono">{sidecar.shotCount}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Direct Forcing</dt>
            <dd>{sidecar.directForcing ? "chain-bound" : "off"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Verified by</dt>
            <dd>your browser, locally</dd>
          </div>
        </dl>
      </div>

      <ol className="flex flex-col gap-3">
        {sidecar.shots.map((shot, i) => {
          const bad = badByIndex.get(shot.shotIndex);
          const valid = bad ? bad.valid : true;
          const displayText = edits[i] ?? shot.prompt;
          return (
            <li
              key={shot.shotIndex}
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
                    shot #{shot.shotIndex}
                    {shot.model ? ` · ${shot.model}` : ""}
                    {shot.seed !== null ? ` · seed ${shot.seed}` : ""}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  fp {short(shot.fingerprintDigest)}
                </span>
              </div>

              <label className="flex flex-col gap-1">
                <span className="sr-only">Shot prompt (editable to test tampering)</span>
                <textarea
                  value={displayText}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [i]: e.target.value }))}
                  rows={2}
                  className="w-full resize-y rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-300/50 focus:outline-none"
                />
              </label>

              <div className="flex items-center justify-between gap-3 text-xs">
                <span className={valid ? "text-emerald-300/80" : "text-rose-300"}>
                  {shot.priorFingerprintDigest
                    ? `conditioned on shot #${shot.shotIndex - 1} · fp ${short(
                        shot.priorFingerprintDigest,
                      )}`
                    : "opening shot (genesis — no prior clip)"}
                  {valid ? "" : ` — broken: ${bad?.reason ?? "invalid"}`}
                </span>
                {edits[i] !== undefined && (
                  <button
                    type="button"
                    onClick={() =>
                      setEdits((prev) => {
                        const next = { ...prev };
                        delete next[i];
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
        Each shot record is sealed into the film&apos;s Merkle Mountain Range; the
        Direct Forcing edge (<code className="text-slate-400">priorFingerprintDigest</code>)
        binds it to the previous clip&apos;s actual output. The same
        <code className="text-slate-400"> verifyFilmSidecar</code> runs here, in
        Node, and in the generator — byte for byte.
      </p>
    </section>
  );
}
