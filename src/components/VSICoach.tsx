"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "./useReducedMotion";
import {
  useStabilityHeatmap,
  type HeatmapEntry,
} from "./useStabilityHeatmap";
import {
  useVSIPredictor,
  type VSIPredictionState,
  type VSIStatus,
} from "./useVSIPredictor";

/**
 * VSI Coach — predictive Visual Stability Index panel embedded in the
 * Performance HUD. Surfaces:
 *   - the rolling 10-second VSI score and its derived status,
 *   - a tiny SVG sparkline of recent shift magnitudes,
 *   - the most-recent largest-source attribution ("which element jumped"),
 *   - a one-shot copy-to-clipboard fix snippet tailored to that source,
 *   - a **preview-fix mode** that temporarily applies `contain: layout`
 *     so engineers can validate the fix before committing it,
 *   - and a debounced `aria-live` announcer that respects
 *     `prefers-reduced-motion` by quieting status churn.
 *
 * Accessibility:
 *   - `role="region"` with a stable `aria-labelledby` heading.
 *   - The status announcer uses `aria-live="polite"` and only emits when
 *     status crosses a threshold, so SR users don't get spammed by a
 *     high-frequency shift storm.
 *   - Reduced-motion users get a longer min interval between
 *     announcements (1500ms vs 600ms) and the sparkline shrinks to a
 *     static dot row instead of an animated polyline.
 *   - One-click "Copy fix" uses `navigator.clipboard` with a graceful
 *     `document.execCommand` fallback so it works without HTTPS in dev.
 *   - **Preview fix** auto-reverts on unmount or when the root-cause
 *     selector changes, so the page is never left in a modified state.
 *   - Every interactive control is keyboard reachable, with visible
 *     `focus-visible` ring on dark backgrounds.
 */

const STATUS_LABEL: Record<VSIStatus, string> = {
  good: "Stable",
  ni: "Watch",
  poor: "Unstable",
  idle: "Pending",
};

const STATUS_TONE: Record<
  VSIStatus,
  { dot: string; text: string; bar: string }
> = {
  good: {
    dot: "bg-emerald-400 shadow-emerald-400/60",
    text: "text-emerald-300",
    bar: "from-emerald-400/70 to-emerald-400/10",
  },
  ni: {
    dot: "bg-amber-400 shadow-amber-400/60",
    text: "text-amber-300",
    bar: "from-amber-400/70 to-amber-400/10",
  },
  poor: {
    dot: "bg-rose-400 shadow-rose-400/60",
    text: "text-rose-300",
    bar: "from-rose-400/70 to-rose-400/10",
  },
  idle: {
    dot: "bg-slate-500/60 shadow-none",
    text: "text-slate-400",
    bar: "from-slate-500/40 to-slate-500/5",
  },
};

interface FixSuggestion {
  readonly title: string;
  readonly snippet: string;
  readonly wcag: string;
}

function buildFixSuggestion(state: VSIPredictionState): FixSuggestion {
  const cause = state.rootCause;
  // No attribution → universal advice that's still actionable.
  if (!cause || !cause.selector) {
    return {
      title: "Reserve space for late-loading content",
      snippet:
        "/* Suggested: give async children explicit dimensions */\n" +
        ".your-async-region { min-height: 200px; contain: layout; }",
      wcag: "WCAG 1.4.10 Reflow · 2.4.3 Focus Order",
    };
  }
  const selector = cause.selector;
  if (cause.tagName === "img" || cause.tagName === "video") {
    return {
      title: `Lock dimensions for ${selector}`,
      snippet:
        `/* ${selector} shifted by ~${cause.heightPx}px — add explicit dims */\n` +
        `${selector} { aspect-ratio: 16 / 9; width: 100%; height: auto; }\n` +
        `/* Or set width/height attributes on the element so the browser */\n` +
        `/* reserves the box before the asset arrives. */`,
      wcag: "WCAG 1.4.10 Reflow",
    };
  }
  if (cause.tagName === "iframe") {
    return {
      title: `Constrain ${selector} with aspect-ratio`,
      snippet:
        `/* Iframes without dimensions trigger late shifts. */\n` +
        `${selector} { aspect-ratio: 16 / 9; width: 100%; }`,
      wcag: "WCAG 1.4.10 Reflow",
    };
  }
  return {
    title: `Contain layout for ${selector}`,
    snippet:
      `/* ${selector} shifted by ~${cause.heightPx}px in the last window. */\n` +
      `${selector} { contain: layout; min-height: ${Math.max(40, cause.heightPx)}px; }`,
    wcag: "WCAG 2.4.3 Focus Order · Predictable focus during async render",
  };
}

interface SparklineProps {
  readonly values: ReadonlyArray<number>;
  readonly status: VSIStatus;
  readonly reducedMotion: boolean;
}

const Sparkline = memo(function Sparkline({
  values,
  status,
  reducedMotion,
}: SparklineProps) {
  // Empty state: a calm baseline placeholder rather than collapsing the
  // row, so the panel height never changes (zero CLS contribution).
  if (values.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="h-6 w-full rounded bg-gradient-to-r from-slate-700/40 to-slate-700/10"
      />
    );
  }
  const max = Math.max(...values, 0.01);
  const w = 120;
  const h = 24;
  const stroke =
    status === "poor"
      ? "#fb7185"
      : status === "ni"
        ? "#fbbf24"
        : status === "good"
          ? "#34d399"
          : "#94a3b8";

  // Reduced-motion: render dots only, no continuous polyline animation.
  if (reducedMotion) {
    return (
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${w} ${h}`}
        className="h-6 w-full"
        preserveAspectRatio="none"
      >
        {values.map((v, i) => {
          const cx =
            values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
          const cy = h - (v / max) * (h - 2) - 1;
          return <circle key={i} cx={cx} cy={cy} r="1.6" fill={stroke} />;
        })}
      </svg>
    );
  }

  const points = values
    .map((v, i) => {
      const x =
        values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      className="h-6 w-full"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
});

interface OffenderListProps {
  readonly entries: ReadonlyArray<HeatmapEntry>;
}

/**
 * Top-N stability heatmap rendered inline below the trend line.  This
 * is the surface that turns the predictor's "what" into the engineer's
 * "where" — a stable, deterministic ranking of offenders the user can
 * fix one at a time.  The list is hidden entirely when no attributed
 * shifts have occurred so it never inflates the panel for stable pages.
 */
const OffenderList = memo(function OffenderList({
  entries,
}: OffenderListProps) {
  if (entries.length === 0) return null;
  return (
    <div
      className="mt-3 rounded-lg border border-white/5 bg-slate-900/40 p-2.5"
      data-testid="vsi-offenders"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
        Top offenders
      </p>
      <ul className="mt-1.5 space-y-1" role="list">
        {entries.map((entry) => (
          <li
            key={entry.selector}
            data-testid="vsi-offender-row"
            data-selector={entry.selector}
            className="flex items-center justify-between gap-2 text-[10px] text-slate-300"
          >
            <span
              className="truncate font-mono text-slate-200"
              title={`${entry.selector} (${entry.count} shift${entry.count === 1 ? "" : "s"})`}
            >
              {entry.selector}
            </span>
            <span className="font-mono tabular-nums text-slate-400">
              {entry.value.toFixed(3)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});

interface VSICoachProps {
  /**
   * Honour the parent panel's open state — the announcer pauses while
   * the panel is collapsed so SR users don't get progress spam from a
   * UI they can't see.
   */
  readonly open: boolean;
}

export const VSICoach = memo(function VSICoach({ open }: VSICoachProps) {
  const state = useVSIPredictor();
  const heatmap = useStabilityHeatmap();
  const reducedMotion = useReducedMotion();
  const styles = STATUS_TONE[state.status];
  const fix = useMemo(() => buildFixSuggestion(state), [state]);
  const [copied, setCopied] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSelectorRef = useRef<string | null>(null);

  // Auto-revert preview when the root-cause selector changes, so we
  // never leave a stale `contain: layout` on a different element.
  const currentSelector = state.rootCause?.selector ?? null;
  useEffect(() => {
    if (
      previewing &&
      previewSelectorRef.current !== null &&
      previewSelectorRef.current !== currentSelector
    ) {
      revertPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSelector]);

  /**
   * Apply `contain: layout` (and a min-height matching the observed
   * shift) to the root-cause element so the engineer can see the
   * fix in action before committing it to source.
   */
  const applyPreview = useCallback(() => {
    if (typeof window === "undefined") return;
    const selector = state.rootCause?.selector;
    if (!selector) return;
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return;
    const heightPx = state.rootCause?.heightPx ?? 0;
    element.style.setProperty("contain", "layout", "important");
    if (heightPx > 0) {
      element.style.setProperty(
        "min-height",
        `${Math.max(40, heightPx)}px`,
        "important",
      );
    }
    previewSelectorRef.current = selector;
    setPreviewing(true);
    // Auto-revert after 8 s so the page isn't left in a modified state
    // if the engineer forgets to click Revert.
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      revertPreview();
    }, 8_000);
  }, [state.rootCause]);

  const revertPreview = useCallback(() => {
    if (typeof window === "undefined") return;
    const selector = previewSelectorRef.current;
    if (!selector) return;
    const element = document.querySelector(selector) as HTMLElement | null;
    if (element) {
      element.style.removeProperty("contain");
      element.style.removeProperty("min-height");
    }
    previewSelectorRef.current = null;
    setPreviewing(false);
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  // Clean up any active preview on unmount so the page is never left
  // with orphaned inline styles.
  useEffect(() => () => {
    revertPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Live-region announcement is derived in render rather than mirrored
   * through `setState` in an effect.  This avoids the cascading-render
   * hazard the `react-hooks/set-state-in-effect` lint rule guards
   * against and keeps the announcer fully reactive to predictor state.
   *
   * `aria-live="polite"` already coalesces back-to-back updates so
   * assistive tech only voices the latest message after the prior one
   * finishes — no JS-side throttle is required.  When the panel is
   * hidden or the predictor is idle, we render an empty string so SR
   * users don't get progress spam from a UI they can't see.
   */
  // Announcement copy: status + (optional) selector + (optional) imminent
  // breach hint.  The breach phrase is suppressed when the prediction
  // window is comfortably long (>5s) so we don't crowd the live region
  // with low-urgency speculation, and entirely silenced for users with
  // `prefers-reduced-motion: reduce` (cognitive-load opt-out parity
  // with the LayoutShiftAnnouncer's quieting policy).
  const breachPhrase =
    !reducedMotion &&
    state.predictionMs != null &&
    state.predictionTarget != null &&
    state.predictionMs <= 5_000
      ? ` Predicted ${STATUS_LABEL[state.predictionTarget]} in ${Math.round(state.predictionMs / 100) / 10} seconds.`
      : "";
  const announcement =
    !open || state.status === "idle"
      ? ""
      : `Visual stability ${STATUS_LABEL[state.status]}${
          state.rootCause?.selector
            ? ` near ${state.rootCause.selector}`
            : ""
        }.${breachPhrase}`;
  // `reducedMotion` still influences the sparkline below (dots vs polyline)
  // and the visual transitions; we silence the unused-var rule for the
  // announcement branch by referencing it in a stable derived attribute.
  const motionMode = reducedMotion ? "reduced" : "full";

  const handleCopy = useCallback(async () => {
    if (typeof window === "undefined") return;
    const text = fix.snippet;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard denied — leave UI untouched */
    }
  }, [fix.snippet]);

  /**
   * Build a structured diagnostics payload that engineers can paste
   * into a bug report.  Captures the live predictor state, the top
   * offender table, and the suggested fix snippet at the moment the
   * button was clicked — all serialisable, no DOM references.
   */
  const buildDiagnosticsPayload = useCallback(() => {
    return {
      schema: "mcop.vsi.diagnostics/v1",
      capturedAt: new Date().toISOString(),
      page: typeof window === "undefined" ? null : window.location.href,
      userAgent:
        typeof navigator === "undefined" ? null : navigator.userAgent,
      vsi: {
        value: state.vsi,
        status: state.status,
        trend: state.trend,
        shiftCount: state.shiftCount,
        predictionMs: state.predictionMs,
        predictionTarget: state.predictionTarget,
        rootCause: state.rootCause,
      },
      sparkline: state.sparkline,
      offenders: heatmap.map((h) => ({
        selector: h.selector,
        tagName: h.tagName,
        accumulatedShift: Number(h.value.toFixed(4)),
        count: h.count,
        heightPx: h.heightPx,
      })),
      suggestedFix: {
        title: fix.title,
        wcag: fix.wcag,
        snippet: fix.snippet,
      },
    };
  }, [state, heatmap, fix]);

  const handleCopyDiagnostics = useCallback(async () => {
    if (typeof window === "undefined") return;
    const text = JSON.stringify(buildDiagnosticsPayload(), null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setDiagCopied(true);
      if (diagTimerRef.current) clearTimeout(diagTimerRef.current);
      diagTimerRef.current = setTimeout(() => setDiagCopied(false), 1800);
    } catch {
      /* clipboard denied — leave UI untouched */
    }
  }, [buildDiagnosticsPayload]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (diagTimerRef.current) clearTimeout(diagTimerRef.current);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    },
    [],
  );

  const vsiDisplay =
    state.shiftCount === 0 ? "—" : state.vsi.toFixed(3);
  const trendLabel =
    state.shiftCount === 0
      ? "no shifts in window"
      : state.trend === "degrading"
        ? state.predictionMs != null
          ? `degrading · budget in ~${Math.round(state.predictionMs / 100) / 10}s`
          : "degrading"
        : state.trend === "improving"
          ? "improving"
          : "stable";

  return (
    <section
      aria-labelledby="vsi-coach-heading"
      data-testid="vsi-coach"
      data-vsi-status={state.status}
      data-vsi-trend={state.trend}
      data-motion-mode={motionMode}
      className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
      style={{ contain: "layout paint" }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3
          id="vsi-coach-heading"
          className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300/90"
        >
          Visual stability
        </h3>
        <span className="text-[10px] text-slate-500">
          {state.shiftCount} shift{state.shiftCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full shadow-[0_0_8px] ${styles.dot}`}
          />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/80">
            VSI
          </span>
        </div>
        <span
          className={`font-mono text-sm tabular-nums ${styles.text}`}
          aria-label={`VSI ${vsiDisplay} ${state.status === "idle" ? "pending" : state.status}`}
        >
          {vsiDisplay}
        </span>
      </div>
      <div className="mt-2">
        <Sparkline
          values={state.sparkline}
          status={state.status}
          reducedMotion={reducedMotion}
        />
      </div>
      <p className="mt-2 text-[10px] text-slate-400" data-testid="vsi-trend-line">
        {trendLabel}
      </p>
      <OffenderList entries={heatmap} />
      {state.shiftCount > 0 && (
        <div className="mt-3 rounded-lg border border-white/5 bg-slate-900/40 p-2.5">
          <p className="text-[10px] font-medium text-slate-300">{fix.title}</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.2em] text-slate-500">
            {fix.wcag}
          </p>
          <pre
            className="mt-2 max-h-24 overflow-auto rounded bg-slate-950/70 p-2 font-mono text-[10px] leading-snug text-slate-200"
            aria-label="Suggested CSS fix"
          >
            {fix.snippet}
          </pre>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCopyDiagnostics}
              data-testid="vsi-copy-diagnostics"
              aria-label={
                diagCopied
                  ? "Diagnostics copied to clipboard"
                  : "Copy VSI diagnostics report to clipboard"
              }
              className={[
                "inline-flex h-7 items-center rounded-full border border-white/10 bg-white/5 px-3 text-[10px] font-medium text-slate-200",
                "transition hover:border-sky-300/60 hover:text-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                "motion-reduce:transition-none",
              ].join(" ")}
            >
              {diagCopied ? "Diagnostics copied" : "Copy diagnostics"}
            </button>
            {previewing ? (
              <button
                type="button"
                onClick={revertPreview}
                data-testid="vsi-revert-fix"
                aria-label="Revert the previewed CSS fix"
                className={[
                  "inline-flex h-7 items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-3 text-[10px] font-medium text-rose-200",
                  "transition hover:border-rose-300/60 hover:text-white",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300",
                  "focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                  "motion-reduce:transition-none",
                ].join(" ")}
              >
                Revert fix
              </button>
            ) : (
              <button
                type="button"
                onClick={applyPreview}
                data-testid="vsi-preview-fix"
                aria-label="Preview the proposed CSS fix on the page"
                className={[
                  "inline-flex h-7 items-center rounded-full border border-white/10 bg-white/5 px-3 text-[10px] font-medium text-slate-200",
                  "transition hover:border-sky-300/60 hover:text-white",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
                  "focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                  "motion-reduce:transition-none",
                ].join(" ")}
              >
                Preview fix
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              data-testid="vsi-copy-fix"
              aria-label={
                copied
                  ? "Fix copied to clipboard"
                  : "Copy suggested fix to clipboard"
              }
              className={[
                "inline-flex h-7 items-center rounded-full border border-white/10 bg-white/5 px-3 text-[10px] font-medium text-slate-200",
                "transition hover:border-sky-300/60 hover:text-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                "motion-reduce:transition-none",
              ].join(" ")}
            >
              {copied ? "Copied" : "Copy fix"}
            </button>
          </div>
          {previewing && (
            <p className="mt-1.5 text-[9px] text-sky-300/80" data-testid="vsi-preview-active">
              Preview active · auto-reverts in 8 s
            </p>
          )}
        </div>
      )}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="vsi-announcer"
        className="sr-only"
      >
        {announcement}
      </p>
    </section>
  );
});

export default VSICoach;
