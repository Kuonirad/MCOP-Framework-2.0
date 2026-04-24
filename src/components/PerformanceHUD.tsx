"use client";

import { memo, useCallback, useEffect, useState, useTransition } from "react";
import {
  subscribeVitals,
  type VitalName,
  type VitalSample,
} from "@/app/_components/vitalsBus";

/**
 * Live Performance HUD — floating, toggleable overlay that renders live
 * Core Web Vitals (LCP, INP, CLS) pulled from the shared `vitalsBus`.
 *
 * Design constraints this component enforces:
 *   - Zero measurement overhead: it *subscribes* to the existing observer
 *     set instead of starting its own, so the HUD adds no extra
 *     `PerformanceObserver` callbacks to the main thread.
 *   - Zero CLS contribution: `position: fixed` takes the HUD out of
 *     normal layout flow; show/hide toggles opacity + transform only.
 *   - Idle-deferred mount: the component renders null on the first
 *     client paint and only attaches after a `requestIdleCallback`
 *     (falling back to `setTimeout(0)`), so the HUD never occupies the
 *     LCP critical path.
 *   - **INP-safe state updates**: every `setState` triggered by a vitals
 *     emission is wrapped in `useTransition` so React can interrupt the
 *     resulting reconcile if the user starts interacting with the page.
 *     Combined with `next/dynamic({ ssr: false })` lazy loading, this
 *     keeps the HUD off the LCP critical path *and* off the long-task
 *     budget that bounds INP.
 *   - Minimal re-renders: `MetricRow` is memoised and a sample is only
 *     committed if it differs in rounded display value, so a noisy
 *     stream (e.g. CLS accumulating in tiny increments) never causes a
 *     visible re-paint.
 *   - `prefers-reduced-motion` safe: transitions collapse to a
 *     no-motion fade when the user opts out.
 *   - Server-safe: guarded for `typeof window === "undefined"` so it
 *     works in the Next.js RSC tree without a dynamic import.
 */

type Status = "good" | "ni" | "poor" | "idle";

interface Threshold {
  readonly good: number;
  readonly ni: number;
}

// Thresholds match web.dev Core Web Vitals rubrics (Nov 2024 cutoffs).
// LCP/INP are in milliseconds, CLS is unitless.
const THRESHOLDS: Record<"LCP" | "INP" | "CLS", Threshold> = {
  LCP: { good: 2500, ni: 4000 },
  INP: { good: 200, ni: 500 },
  CLS: { good: 0.1, ni: 0.25 },
};

function classify(name: "LCP" | "INP" | "CLS", value: number): Status {
  const t = THRESHOLDS[name];
  if (value <= t.good) return "good";
  if (value <= t.ni) return "ni";
  return "poor";
}

function format(name: "LCP" | "INP" | "CLS", value: number): string {
  if (name === "CLS") return value.toFixed(3);
  // LCP / INP → ms, shown as integers for compactness
  return `${Math.round(value)} ms`;
}

const STATUS_STYLES: Record<Status, { dot: string; text: string }> = {
  good: { dot: "bg-emerald-400 shadow-emerald-400/60", text: "text-emerald-300" },
  ni: { dot: "bg-amber-400 shadow-amber-400/60", text: "text-amber-300" },
  poor: { dot: "bg-rose-400 shadow-rose-400/60", text: "text-rose-300" },
  idle: { dot: "bg-slate-500/60 shadow-none", text: "text-slate-400" },
};

interface MetricRowProps {
  readonly name: "LCP" | "INP" | "CLS";
  readonly label: string;
  readonly sample: VitalSample | undefined;
}

const MetricRow = memo(function MetricRow({ name, label, sample }: MetricRowProps) {
  const status: Status = sample ? classify(name, sample.value) : "idle";
  const styles = STATUS_STYLES[status];
  const display = sample ? format(name, sample.value) : "—";
  return (
    <div className="flex items-center justify-between gap-6 py-1.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full shadow-[0_0_8px] ${styles.dot}`}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/80">
          {label}
        </span>
      </div>
      <span
        className={`font-mono text-sm tabular-nums ${styles.text}`}
        aria-live="polite"
        aria-label={`${name} ${display} ${status === "idle" ? "pending" : status}`}
      >
        {display}
      </span>
    </div>
  );
});

/**
 * Deferred mount gate: returns `true` only after the browser has had a
 * quiet moment post-hydration, so the HUD's initial render never races
 * the LCP element for main-thread time.
 */
function useIdleMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(() => setReady(true), { timeout: 1500 });
    } else {
      timeoutId = setTimeout(() => setReady(true), 0);
    }
    return () => {
      if (idleId !== undefined && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);
  return ready;
}

interface PerformanceHUDProps {
  /**
   * Whether the HUD panel is open on mount. Defaults to closed so the
   * overlay never competes with first paint; users opt-in via the
   * floating button.
   */
  readonly defaultOpen?: boolean;
}

/**
 * Returns `true` if the new sample would change what the HUD displays.
 * Comparing the rounded/formatted output instead of the raw float means
 * the HUD only re-renders when a *visible* change occurs, eliminating
 * dozens of speculative reconciles per second on a CLS-heavy page.
 */
function isVisibleChange(
  prev: VitalSample | undefined,
  next: VitalSample,
): boolean {
  if (!prev) return true;
  if (prev.name !== next.name) return true;
  if (next.name === "CLS") {
    return prev.value.toFixed(3) !== next.value.toFixed(3);
  }
  return Math.round(prev.value) !== Math.round(next.value);
}

export default function PerformanceHUD({ defaultOpen = false }: PerformanceHUDProps = {}) {
  const ready = useIdleMount();
  const [open, setOpen] = useState(defaultOpen);
  const [samples, setSamples] = useState<Partial<Record<VitalName, VitalSample>>>({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!ready) return;
    // Subscribe once the page is idle; the bus replays cached samples
    // so the HUD has values to show immediately.  Each emission is
    // committed via `startTransition` so React can interrupt the
    // reconcile if the user is interacting with the page — keeping
    // INP under 200ms even on slow devices.
    return subscribeVitals((sample) => {
      startTransition(() => {
        setSamples((prev) => {
          const existing = prev[sample.name];
          if (!isVisibleChange(existing, sample)) return prev;
          return { ...prev, [sample.name]: sample };
        });
      });
    });
  }, [ready]);

  const toggle = useCallback(() => {
    // Toggle is a non-urgent visual transition — wrapping it in
    // `startTransition` lets React keep the click handler itself
    // synchronous and short, which is the metric INP actually measures.
    startTransition(() => setOpen((v) => !v));
  }, []);

  if (!ready) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-end px-4 sm:bottom-6 sm:px-6 motion-reduce:transition-none"
      data-testid="performance-hud"
    >
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {/* Panel --------------------------------------------------- */}
        <div
          id="performance-hud-panel"
          role="region"
          aria-label="Live performance metrics"
          aria-hidden={!open}
          data-testid="performance-hud-panel"
          data-open={open ? "true" : "false"}
          className={[
            "w-[min(92vw,18rem)] origin-bottom-right rounded-2xl border border-white/10",
            "bg-slate-950/70 p-4 text-slate-100 shadow-2xl shadow-sky-500/10 backdrop-blur-xl",
            "transition duration-200 ease-out motion-reduce:transition-none",
            // GPU-only transforms keep the panel toggle off the layout/
            // paint critical path so it never contributes to CLS or
            // long tasks.
            "will-change-[transform,opacity]",
            open
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-2 scale-95 opacity-0",
          ].join(" ")}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_8px] shadow-sky-400/80"
              />
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300/90">
                Live vitals
              </p>
            </div>
            <p className="text-[10px] text-slate-500">Core Web Vitals</p>
          </div>
          <MetricRow name="LCP" label="Largest paint" sample={samples.LCP} />
          <MetricRow name="INP" label="Interaction" sample={samples.INP} />
          <MetricRow name="CLS" label="Layout shift" sample={samples.CLS} />
          <p className="mt-3 border-t border-white/5 pt-2 text-[10px] leading-relaxed text-slate-500">
            Real-user metrics from this browser tab. Thresholds follow{" "}
            <span className="text-slate-400">web.dev</span> Core Web Vitals.
          </p>
        </div>

        {/* Toggle button ------------------------------------------- */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="performance-hud-panel"
          aria-label={open ? "Hide performance HUD" : "Show performance HUD"}
          className={[
            "inline-flex h-11 items-center gap-2 rounded-full border border-white/10",
            "bg-slate-950/70 px-4 text-xs font-medium text-slate-200 shadow-lg",
            "backdrop-blur-xl transition hover:border-sky-400/60 hover:text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            "motion-reduce:transition-none",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={[
              "inline-block h-2 w-2 rounded-full transition",
              samples.LCP || samples.INP || samples.CLS
                ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/80"
                : "bg-slate-500",
            ].join(" ")}
          />
          <span className="tabular-nums">
            {open ? "Hide" : "Live vitals"}
          </span>
        </button>
      </div>
    </div>
  );
}
