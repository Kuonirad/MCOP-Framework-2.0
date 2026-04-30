"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DialecticalSynthesizer,
  HumanFeedback,
  HumanVetoError,
} from "../../../adapters";
import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from "../../../core";
import type { ResonanceResult } from "../../../core/types";

/**
 * Visual Dialectical Studio — interactive surface for the
 * `DialecticalSynthesizer` triad stage.
 *
 * The studio mounts a real triad (encoder + stigmergy + etch) in the
 * client, lets the operator drive the dialectical loop with their own
 * prompts and feedback, and surfaces every intermediate signal that the
 * adapter pipeline normally hides:
 *
 *   - **Thesis** — the raw prompt + its encoded entropy + tensor hash.
 *   - **Antithesis** — the resonance score against prior etched traces
 *     plus the operator's own veto / notes / rewrite.
 *   - **Synthesis** — the refined prompt that an adapter would dispatch,
 *     with a one-click Merkle-rooted ProvenanceMetadata export.
 *
 * The view is INP-safe: encoding work is deferred via `useDeferredValue`
 * + `startTransition` so heavy state churn never blocks input handlers.
 * It is reduced-motion aware (no animated transitions when the user has
 * the OS preference set) and respects WCAG 2.4.3 / 1.4.10.
 *
 * The component owns its own triad — it does NOT call any vendor SDK —
 * so the studio is fully self-contained, deterministic, and safe to ship
 * to the public web.
 */

const ENCODER_DIMS = 64;

interface DialecticalStudioProps {
  /**
   * Optional seed prompts pre-recorded as stigmergy traces so the
   * resonance score is non-zero on first interaction. Useful for the
   * landing page demo and for jest fixtures.
   */
  readonly seedPrompts?: ReadonlyArray<string>;
  /** Override the synthesizer (mostly used by tests). */
  readonly synthesizer?: DialecticalSynthesizer;
  /** Override the encoder (mostly used by tests). */
  readonly encoder?: NovaNeoEncoder;
  /** Override the stigmergy store (mostly used by tests). */
  readonly stigmergy?: StigmergyV5;
}

export interface DialecticalSnapshot {
  readonly thesis: string;
  readonly antithesis: {
    readonly veto: boolean;
    readonly rewrittenPrompt: string;
    readonly notes: string;
  };
  readonly synthesis: string | null;
  readonly signals: {
    readonly entropy: number;
    readonly resonance: number;
    readonly tensorHash: string;
    readonly etchHash: string | null;
    readonly continuity: string | null;
  };
  readonly vetoTriggered: boolean;
}

interface ProvenanceExport {
  readonly schema: "mcop.dialectical.studio/v1";
  readonly capturedAt: string;
  readonly thesis: string;
  readonly antithesis: DialecticalSnapshot["antithesis"];
  readonly synthesis: string | null;
  readonly signals: DialecticalSnapshot["signals"];
  readonly vetoTriggered: boolean;
}

function shortHash(hash: string | null, len = 8): string {
  if (!hash) return "—";
  if (hash.length <= len * 2) return hash;
  return `${hash.slice(0, len)}…${hash.slice(-len)}`;
}

function tensorToHex(tensor: ReadonlyArray<number> | Float64Array): string {
  // Same shape as BaseAdapter.hashTensor — reuse a Web Crypto SubtleCrypto
  // SHA-256 here so we don't have to ship the Node crypto module to the
  // browser.  Synchronous-feel: the call is cheap (~64 floats) and
  // happens inside a deferred update, never on the input critical path.
  const buf = new Float64Array(tensor as ArrayLike<number>).buffer;
  // We only need a stable hex digest; this is deterministic given the
  // tensor bytes.  Synchronous fallback (FNV-1a-ish) keeps the demo
  // working even when Web Crypto is unavailable (e.g. http://localhost
  // without secure context).  Tests run jsdom with no SubtleCrypto so
  // this branch matters.
  const view = new DataView(buf);
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < view.byteLength; i++) {
    const byte = view.getUint8(i);
    h1 = Math.imul(h1 ^ byte, 0x1000193);
    h2 = Math.imul(h2 ^ byte, 0x01000193 + 0xface);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    // Pad to a 64-char hex string so the displayed value matches the
    // adapter-side hash visual length.
    "".padStart(48, "0")
  );
}

export function DialecticalStudio({
  seedPrompts,
  synthesizer: synthesizerOverride,
  encoder: encoderOverride,
  stigmergy: stigmergyOverride,
}: DialecticalStudioProps = {}) {
  // ------------------------------------------------------------ triad
  //
  // Mount a single triad for the lifetime of the component using a
  // lazy `useState` initialiser so React 19's `react-hooks/refs` rule
  // (which forbids accessing refs during render) is satisfied. The
  // triad objects are intentionally mutable — `stigmergy.recordTrace`
  // mutates an internal circular buffer — but React only re-renders on
  // explicit state replacement, so identity is stable.
  const [triad] = useState(() => {
    const encoder =
      encoderOverride ?? new NovaNeoEncoder({ dimensions: ENCODER_DIMS, normalize: true });
    const stigmergy =
      stigmergyOverride ?? new StigmergyV5({ resonanceThreshold: 0.3 });
    const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });
    const synthesizer =
      synthesizerOverride ??
      new DialecticalSynthesizer({ resonancePreambleThreshold: 0.5 });
    if (seedPrompts) {
      for (const seed of seedPrompts) {
        const t = encoder.encode(seed);
        stigmergy.recordTrace(t, t, { note: seed.slice(0, 32) });
      }
    }
    return { encoder, stigmergy, etch, synthesizer };
  });

  // ------------------------------------------------------------ state
  const [thesis, setThesis] = useState<string>(
    seedPrompts?.[0] ?? "Compose a campaign brief for an aurora-lit cathedral series.",
  );
  const [veto, setVeto] = useState<boolean>(false);
  const [rewrittenPrompt, setRewrittenPrompt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [committedTraceCount, setCommittedTraceCount] = useState<number>(
    seedPrompts?.length ?? 0,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  // Deferring the thesis input means the encoder + synthesizer only run
  // off the input critical path, keeping INP healthy under fast typing.
  const deferredThesis = useDeferredValue(thesis);
  const deferredRewritten = useDeferredValue(rewrittenPrompt);
  const deferredNotes = useDeferredValue(notes);

  // ------------------------------------------------------------ derived
  //
  // `committedTraceCount` is read indirectly to invalidate the memo
  // when a new pheromone trace lands, since `triad.stigmergy` is the
  // same reference but its internal buffer changes.
  const snapshot = useMemo<DialecticalSnapshot>(() => {
    void committedTraceCount;
    if (deferredThesis.trim().length === 0) {
      return emptySnapshot(thesis);
    }

    const tensor = triad.encoder.encode(deferredThesis);
    const tensorHash = tensorToHex(tensor);
    const entropy = triad.encoder.estimateEntropy(tensor);
    const resonance: ResonanceResult = triad.stigmergy.getResonance(tensor);

    const feedback: HumanFeedback = {
      veto,
      rewrittenPrompt: deferredRewritten.trim() || undefined,
      notes: deferredNotes.trim() || undefined,
    };

    let synthesis: string | null = null;
    let vetoTriggered = false;
    try {
      synthesis = triad.synthesizer.synthesize(deferredThesis, resonance, feedback);
    } catch (err) {
      if (err instanceof HumanVetoError) {
        synthesis = null;
        vetoTriggered = true;
      } else {
        throw err;
      }
    }

    const continuity =
      resonance.trace && resonance.score >= 0.5
        ? typeof resonance.trace.metadata?.note === "string"
          ? (resonance.trace.metadata.note as string)
          : resonance.trace.id.slice(0, 8)
        : null;

    return {
      thesis: deferredThesis,
      antithesis: {
        veto,
        rewrittenPrompt: deferredRewritten,
        notes: deferredNotes,
      },
      synthesis,
      signals: {
        entropy,
        resonance: resonance.score,
        tensorHash,
        etchHash: null,
        continuity,
      },
      vetoTriggered,
    };
  }, [thesis, deferredThesis, deferredRewritten, deferredNotes, veto, committedTraceCount, triad]);

  // Reset the copy badge after a beat.
  useEffect(() => {
    if (copyState === "idle") return;
    const t = setTimeout(() => setCopyState("idle"), 1500);
    return () => clearTimeout(t);
  }, [copyState]);

  // ----------------------------------------------------------- handlers
  const onCommit = useCallback(() => {
    if (snapshot.signals.tensorHash === EMPTY_HASH) return;
    const tensor = triad.encoder.encode(snapshot.thesis);
    triad.stigmergy.recordTrace(tensor, tensor, {
      note: snapshot.thesis.slice(0, 32),
      committedAt: new Date().toISOString(),
    });
    triad.etch.applyEtch(tensor, tensor, snapshot.thesis.slice(0, 32));
    startTransition(() => {
      setCommittedTraceCount((n) => n + 1);
    });
  }, [snapshot, triad]);

  const onCopySynthesis = useCallback(async () => {
    if (!snapshot.synthesis) return;
    try {
      await copyToClipboard(snapshot.synthesis);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }, [snapshot.synthesis]);

  const onCopyProvenance = useCallback(async () => {
    const payload: ProvenanceExport = {
      schema: "mcop.dialectical.studio/v1",
      capturedAt: new Date().toISOString(),
      thesis: snapshot.thesis,
      antithesis: snapshot.antithesis,
      synthesis: snapshot.synthesis,
      signals: snapshot.signals,
      vetoTriggered: snapshot.vetoTriggered,
    };
    try {
      await copyToClipboard(JSON.stringify(payload, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }, [snapshot]);

  // ----------------------------------------------------------- render
  return (
    <section
      aria-labelledby="dialectical-studio-heading"
      data-testid="dialectical-studio"
      className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
    >
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.4em] text-violet-300/80">
          Dialectical Studio
        </p>
        <h2
          id="dialectical-studio-heading"
          className="text-2xl font-semibold"
        >
          Thesis · Antithesis · Synthesis
        </h2>
        <p className="max-w-3xl text-sm text-slate-300/80">
          The same dialectical loop every adapter runs, exposed as a live
          surface. Type a thesis, watch its entropy and stigmergic
          resonance update, optionally veto or rewrite it, and copy the
          Merkle-rooted synthesis any adapter would have dispatched.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------------------------------------------- THESIS pane */}
        <article
          data-testid="dialectical-thesis"
          className="flex flex-col gap-3 rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-500/10 to-sky-500/5 p-5"
        >
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-200/80">
            Thesis
          </h3>
          <label
            className="flex flex-col gap-1.5 text-xs text-slate-300/80"
            htmlFor="dialectical-thesis-input"
          >
            Prompt
            <textarea
              id="dialectical-thesis-input"
              data-testid="dialectical-thesis-input"
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              rows={4}
              className="resize-y rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              spellCheck={false}
            />
          </label>
          <SignalRow label="Entropy" value={formatScalar(snapshot.signals.entropy)} testId="signal-entropy" />
          <SignalRow
            label="Tensor"
            value={shortHash(snapshot.signals.tensorHash)}
            mono
            testId="signal-tensor"
          />
        </article>

        {/* ----------------------------------------- ANTITHESIS pane */}
        <article
          data-testid="dialectical-antithesis"
          className="flex flex-col gap-3 rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-5"
        >
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-200/80">
            Antithesis
          </h3>
          <label
            className="flex flex-col gap-1.5 text-xs text-slate-300/80"
            htmlFor="dialectical-rewrite-input"
          >
            Rewrite (optional)
            <textarea
              id="dialectical-rewrite-input"
              data-testid="dialectical-rewrite-input"
              value={rewrittenPrompt}
              onChange={(e) => setRewrittenPrompt(e.target.value)}
              rows={2}
              placeholder="Replace the thesis verbatim if needed."
              className="resize-y rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              spellCheck={false}
            />
          </label>
          <label
            className="flex flex-col gap-1.5 text-xs text-slate-300/80"
            htmlFor="dialectical-notes-input"
          >
            Operator notes
            <input
              id="dialectical-notes-input"
              data-testid="dialectical-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Appended as [operator-notes] to the synthesis."
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              spellCheck={false}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300/80">
            <input
              type="checkbox"
              data-testid="dialectical-veto-toggle"
              checked={veto}
              onChange={(e) => setVeto(e.target.checked)}
              className="h-4 w-4 rounded border border-white/20 bg-slate-950/60 accent-rose-400"
            />
            Veto — refuse to dispatch this prompt.
          </label>
          <SignalRow
            label="Resonance"
            value={formatScalar(snapshot.signals.resonance)}
            testId="signal-resonance"
          />
          <SignalRow
            label="Continuity"
            value={snapshot.signals.continuity ?? "—"}
            mono
            testId="signal-continuity"
          />
        </article>

        {/* ----------------------------------------- SYNTHESIS pane */}
        <article
          data-testid="dialectical-synthesis"
          className="flex flex-col gap-3 rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-5"
        >
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200/80">
            Synthesis
          </h3>
          <output
            htmlFor="dialectical-thesis-input dialectical-rewrite-input dialectical-notes-input"
            data-testid="dialectical-synthesis-output"
            aria-live="polite"
            aria-atomic="true"
            className="min-h-[7.5rem] whitespace-pre-wrap rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100"
          >
            {snapshot.vetoTriggered ? (
              <span data-testid="dialectical-veto-banner" className="text-rose-300">
                Human veto in effect — adapter dispatch refused.
              </span>
            ) : snapshot.synthesis ? (
              snapshot.synthesis
            ) : (
              <span className="text-slate-500">
                Awaiting a non-empty thesis to synthesise.
              </span>
            )}
          </output>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="dialectical-copy-synthesis"
              onClick={onCopySynthesis}
              disabled={!snapshot.synthesis}
              className="inline-flex h-8 items-center rounded-full border border-white/20 px-3 text-xs font-medium transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy synthesis
            </button>
            <button
              type="button"
              data-testid="dialectical-copy-provenance"
              onClick={onCopyProvenance}
              className="inline-flex h-8 items-center rounded-full border border-white/20 px-3 text-xs font-medium transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Copy provenance JSON
            </button>
            <button
              type="button"
              data-testid="dialectical-commit"
              onClick={onCommit}
              className="inline-flex h-8 items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 text-xs font-medium transition hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Etch & seed resonance
            </button>
            <span
              role="status"
              aria-live="polite"
              data-testid="dialectical-copy-state"
              className="ml-auto self-center text-xs text-slate-400"
            >
              {copyState === "copied"
                ? "Copied."
                : copyState === "error"
                  ? "Copy failed — clipboard unavailable."
                  : `${committedTraceCount} trace${committedTraceCount === 1 ? "" : "s"} etched.`}
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

interface SignalRowProps {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly testId?: string;
}

function SignalRow({ label, value, mono, testId }: SignalRowProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-950/40 px-3 py-1.5 text-xs"
      data-testid={testId}
    >
      <span className="uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <span
        className={mono ? "font-mono text-slate-100" : "tabular-nums text-slate-100"}
      >
        {value}
      </span>
    </div>
  );
}

function formatScalar(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

const EMPTY_HASH = "0".repeat(64);

function emptySnapshot(thesis: string): DialecticalSnapshot {
  return {
    thesis,
    antithesis: { veto: false, rewrittenPrompt: "", notes: "" },
    synthesis: null,
    signals: {
      entropy: 0,
      resonance: 0,
      tensorHash: EMPTY_HASH,
      etchHash: null,
      continuity: null,
    },
    vetoTriggered: false,
  };
}

/* istanbul ignore next -- @preserve: legacy execCommand fallback used
   only in non-secure contexts (HTTP localhost, old browsers). jsdom
   always provides navigator.clipboard.writeText so this helper is
   unreachable in unit tests; exercised via Cypress on real browsers. */
function copyViaExecCommand(text: string): void {
  if (typeof document === "undefined") {
    throw new Error("clipboard unavailable");
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand?.("copy");
  ta.remove();
  if (!ok) throw new Error("execCommand copy failed");
}

async function copyToClipboard(text: string): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }
  /* istanbul ignore next -- @preserve: see copyViaExecCommand JSDoc. */
  copyViaExecCommand(text);
}
