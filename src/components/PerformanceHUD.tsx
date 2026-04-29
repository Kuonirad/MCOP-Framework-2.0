"use client";

import { MCOP_CONFIG, classifyMetric } from "@/config/mcop.config";
import {
  memo,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  subscribeVitals,
  type VitalName,
  type VitalSample,
} from "@/app/_components/vitalsBus";
import { useDebouncedValue } from "./useDebouncedValue";
import { useLCPProfiler } from "./useLCPProfiler";
import PerformanceBudgetBar from "./PerformanceBudgetBar";
import VSICoach from "./VSICoach";

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

// Thresholds imported from centralised MCOP config so teams can override
// at build time without touching component code.
const THRESHOLDS = MCOP_CONFIG;

function classify(name: "LCP" | "INP" | "CLS", value: number): Status {
  return classifyMetric(name, value);
}

function format(name: "LCP" | "INP" | "CLS", value: number): string {
  if (name === "CLS") return value.toFixed(3);
  // LCP / INP → ms, shown as integers for compactness
  return `${Math.round(value)} ms`;
}

const STATUS_STYLES: Record<Status, { dot: string; text: string }> = {
  good: {
    dot: "bg-emerald-400 shadow-emerald-400/60",
    text: "text-emerald-300",
  },
  ni: {
    dot: "bg-amber-400 shadow-amber-400/60",
    text: "text-amber-300",
  },
  poor: {
    dot: "bg-rose-400 shadow-rose-400/60",
    text: "text-rose-300",
  },
  idle: { dot: "bg-slate-500/60 shadow-none", text: "text-slate-400" },
};

interface MetricRowProps {
  readonly name: "LCP" | "INP" | "CLS";
  readonly label: string;
  readonly sample: VitalSample | undefined;
  /** Optional LCP attribution from useLCPProfiler — shown below the metric. */
  readonly lcpAttribution?: {
    readonly elementTag: string | null;
    readonly elementUrl: string | null;
    readonly recommendation: string;
  } | null;
}

const BUDGET_THRESHOLDS = MCOP_CONFIG;

const MetricRow = memo(function MetricRow({
  name,
  label,
  sample,
  lcpAttribution,
}: MetricRowProps) {
  const status: Status = sample ? classify(name, sample.value) : "idle";
  const styles = STATUS_STYLES[status];
  const display = sample ? format(name, sample.value) : "—";
  const budget = BUDGET_THRESHOLDS[name];
  return (
    <div className="flex flex-col gap-1 py-1.5">
      <div className="flex items-center justify-between gap-6">
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
      {sample && (
        <PerformanceBudgetBar
          label={name}
          value={sample.value}
          goodThreshold={budget.good}
          poorThreshold={budget.poor}
        />
      )}
      {name === "LCP" && lcpAttribution && lcpAttribution.elementTag && (
        <div className="mt-1 rounded border border-white/5 bg-slate-900/40 p-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400">
            LCP Element
          </p>
          <p className="mt-0.5 text-[10px] text-slate-200">
            <code className="rounded bg-slate-950/60 px-1 py-px text-sky-300">
              {lcpAttribution.elementTag}
            </code>
            {lcpAttribution.elementUrl && (
              <span className="ml-1 text-slate-500">
                {lcpAttribution.elementUrl.length > 40
                  ? lcpAttribution.elementUrl.slice(0, 40) + "…"
                  : lcpAttribution.elementUrl}
              </span>
            )}
          </p>
          <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
            {lcpAttribution.recommendation}
          </p>
        </div>
      )}
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
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(() => setReady(true), {
        timeout: 1500,
      });
    } else {
      timeoutId = setTimeout(() => setReady(true), 0);
    }
    return () => {
      if (
        idleId !== undefined &&
        typeof win.cancelIdleCallback === "function"
      ) {
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
  /**
   * Forces the rendered "Test Mode" badge into a specific state. Used
   * by jest specs to assert both code paths without mounting twice in
   * different environments. When omitted (production default), the
   * badge auto-detects: SSR before hydration, "Live" once the browser
   * has provided a non-zero `PerformanceObserver` integration.
   */
  readonly testModeOverride?: TestMode;
}

/**
 * "Test Mode" describes which environment the HUD believes it is
 * running in:
 *   - `ssr`  — server-rendered or jsdom test render. No real browser
 *              vitals are being captured; metrics are deterministic
 *              fixtures or empty.
 *   - `live` — running in a real browser tab against a real
 *              `PerformanceObserver`-backed `vitalsBus`. Numbers
 *              reflect actual user experience.
 *
 * The badge surfaces this distinction so reviewers reading a
 * screenshot can tell at a glance whether the metrics are trustworthy
 * end-user telemetry or a deterministic test fixture.
 */
export type TestMode = "ssr" | "live";

/**
 * Detect whether the HUD is currently rendering in a real browser
 * (live mode) or under SSR / jsdom (test mode). The check runs once
 * after hydration so the mode label reflects the *runtime*
 * environment rather than the initial render context. We look for a
 * `PerformanceObserver` constructor because that is the single
 * capability the production `vitalsBus` requires; jest specs polyfill
 * a partial subset per-suite, but never the full constructor on the
 * real `globalThis`, so this is a reliable discriminator without a
 * brittle UA string check.
 */
function detectTestMode(): TestMode {
  if (typeof window === "undefined") return "ssr";
  const candidate = (window as Window & {
    PerformanceObserver?: { prototype?: unknown };
  }).PerformanceObserver;
  if (typeof candidate !== "function") return "ssr";
  // A real Chrome/Firefox PerformanceObserver advertises its supported
  // entry types via the static `supportedEntryTypes` array. jsdom's
  // partial polyfill (when present) does not, which is the seam we
  // use to tell the two apart.
  const supported = (
    candidate as unknown as {
      supportedEntryTypes?: ReadonlyArray<string>;
    }
  ).supportedEntryTypes;
  return Array.isArray(supported) && supported.length > 0 ? "live" : "ssr";
}

/**
 * `useSyncExternalStore` adapter for the test-mode probe. The probe
 * has no real subscription surface (the answer is fixed for the
 * lifetime of the page), but routing it through the store API gives
 * us the React-approved hydration seam: SSR renders "ssr"
 * (`getServerSnapshot`), the client snapshot runs `detectTestMode`
 * after mount (`getSnapshot`), and React performs the switch without
 * a `setState`-in-effect lint violation.
 */
const subscribeTestMode = (): (() => void) => () => undefined;
const getTestModeServerSnapshot = (): TestMode => "ssr";

function useDetectedTestMode(): TestMode {
  return useSyncExternalStore(
    subscribeTestMode,
    detectTestMode,
    getTestModeServerSnapshot,
  );
}

/**
 * Compact "Test Mode" pill rendered next to the "Live vitals" header.
 * The badge is purely informational — it does not gate any
 * functionality — so it is `aria-hidden` for the high-density label
 * and exposes a screen-reader-friendly summary via `aria-label` on a
 * sibling `sr-only` span.
 */
const TestModeBadge = memo(function TestModeBadge({
  mode,
}: {
  readonly mode: TestMode;
}) {
  const isLive = mode === "live";
  const label = isLive ? "Live" : "SSR";
  const tone = isLive
    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
    : "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return (
    <span
      data-testid="performance-hud-test-mode"
      data-mode={mode}
      className={`ml-1 inline-flex items-center rounded-full border px-1.5 py-px text-[8px] font-semibold uppercase tracking-[0.18em] ${tone}`}
      aria-label={
        isLive
          ? "Test mode: Live — metrics from real PerformanceObserver"
          : "Test mode: SSR — metrics from server render or jsdom test"
      }
    >
      {label}
    </span>
  );
});

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

export default function PerformanceHUD({
  defaultOpen = false,
  testModeOverride,
}: PerformanceHUDProps = {}) {
  const ready = useIdleMount();
  const [open, setOpen] = useState(defaultOpen);
  const [samples, setSamples] = useState<
    Partial<Record<VitalName, VitalSample>>
  >({});
  const [, startTransition] = useTransition();
  // Resolve the badge label after hydration so the SSR markup never
  // claims "Live" prematurely. `useSyncExternalStore` gives us the
  // React-approved SSR/CSR hydration seam without a setState-in-effect.
  const detectedTestMode = useDetectedTestMode();
  const testMode: TestMode = testModeOverride ?? detectedTestMode;
  // 300ms trailing-edge debounce on the displayed values. Web Vitals
  // (especially CLS) can fire many sub-visible deltas per second; the
  // debounce coalesces them into one trailing reconcile so the HUD never
  // burns INP budget on values the user can't actually see change.
  const displayedSamples = useDebouncedValue(samples, 300);

  // Pull LCP element attribution for element-level debugging.
  const lcpProfile = useLCPProfiler();

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

  // Keyboard a11y:
  //   Alt+P  — toggle the HUD from anywhere on the page (avoids capturing
  //            an unmodified key that would conflict with form input).
  //   Esc    — close the panel when it is currently open.
  // Only the open-state listener depends on `open`; we deliberately keep
  // the global Alt+P listener on a stable reference so it doesn't
  // re-bind on every render and thrash event registration.
  useEffect(() => {
    if (!ready) return;
    if (typeof window === "undefined") return;
    const onKey = (evt: KeyboardEvent) => {
      // Alt+P toggle.  We check `evt.altKey` and the lowercased key so
      // both `KeyP` (en) and locale-mapped variants resolve correctly.
      if (evt.altKey && (evt.key === "p" || evt.key === "P")) {
        evt.preventDefault();
        startTransition(() => setOpen((v) => !v));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        startTransition(() => setOpen(false));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ready) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-end px-4 sm:bottom-6 sm:px-6"
      data-testid="performance-hud"
    >
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {/* Panel --------------------------------------------------- */}
        <div
          id="performance-hud-panel"
          role="region"
          aria-label="Live performance metrics"
          aria-hidden={!open}
          /*
           * `inert` removes the panel and every descendant from the
           * accessibility tree and the focus order while it is visually
           * hidden. Without this, the new VSI Coach buttons (Copy fix
           * etc.) would still be tab-reachable behind a transparent
           * overlay — a real keyboard a11y bug. React 19 supports the
           * boolean prop natively.
           */
          inert={!open}
          data-testid="performance-hud-panel"
          data-open={open ? "true" : "false"}
          className={[
            "w-[min(92vw,20rem)] origin-bottom-right rounded-2xl border border-white/10",
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
              <TestModeBadge mode={testMode} />
            </div>
            <p className="text-[10px] text-slate-500">
              Core Web Vitals · VSI
            </p>
          </div>
          <MetricRow
            name="LCP"
            label="Largest paint"
            sample={displayedSamples.LCP}
            lcpAttribution={
              lcpProfile?.attribution
                ? {
                    elementTag: lcpProfile.attribution.elementTag,
                    elementUrl: lcpProfile.attribution.elementUrl,
                    recommendation: lcpProfile.recommendation,
                  }
                : null
            }
          />
          <MetricRow
            name="INP"
            label="Interaction"
            sample={displayedSamples.INP}
          />
          <MetricRow
            name="CLS"
            label="Layout shift"
            sample={displayedSamples.CLS}
          />
          <VSICoach open={open} />
          <p className="mt-3 border-t border-white/5 pt-2 text-[10px] leading-relaxed text-slate-500">
            Real-user metrics from this browser tab. Thresholds from{" "}
            <span className="text-slate-400">MCOP config</span> (web.dev
            defaults). Press{" "}
            <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono text-[9px]">
              Alt
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono text-[9px]">
              P
            </kbd>{" "}
            to toggle.
          </p>
        </div>

        {/* Toggle button ------------------------------------------- */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="performance-hud-panel"
          aria-keyshortcuts="Alt+P"
          aria-label={
            open
              ? "Hide performance HUD (Alt+P)"
              : "Show performance HUD (Alt+P)"
          }
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
              displayedSamples.LCP ||
                displayedSamples.INP ||
                displayedSamples.CLS
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
