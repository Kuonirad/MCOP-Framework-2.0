/**
 * Shared Core Web Vitals broadcast bus.
 *
 * Fans canonical vitals samples (LCP, CLS, INP, FCP, TTFB) out to every
 * subscriber from a single source.  Internally we delegate measurement
 * to the official `web-vitals` library so we get:
 *
 *   - **Correct INP** (the worst interaction in the session, debounced),
 *     not "the duration of the most recent event entry" — which is what
 *     the previous hand-rolled `event` PerformanceObserver was emitting
 *     and was the root cause of the HUD's INP flicker.
 *   - **Canonical LCP** that respects the Web Vitals spec's stop
 *     conditions (first user interaction / page hide).
 *   - **Cumulative CLS** measured against the standard session windows.
 *
 * The bus is side-effect free at import time; observers only attach
 * after the first `subscribeVitals()` call, so SSR and tests never touch
 * browser-only APIs.  The public surface (`subscribeVitals`,
 * `getLatestVitals`, `__emitForTests`, `__resetForTests`) is unchanged.
 */

import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type Metric,
} from "web-vitals";

export type VitalName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";

export interface VitalSample {
  readonly name: VitalName;
  readonly value: number;
  readonly ts: number;
}

type Listener = (sample: VitalSample) => void;

const listeners = new Set<Listener>();
// Remembers the most recent sample for each metric so late subscribers
// (the HUD mounts after the first LCP has already fired) immediately
// render a real value instead of dashes.
const latest: Partial<Record<VitalName, VitalSample>> = {};
let attached = false;

function broadcast(sample: VitalSample): void {
  latest[sample.name] = sample;
  // Copy so a listener that unsubscribes during dispatch doesn't mutate
  // the iteration set out from under us.
  for (const l of Array.from(listeners)) {
    try {
      l(sample);
    } catch {
      /* a faulty subscriber must never break measurement */
    }
  }
}

function fromMetric(metric: Metric): VitalSample {
  return {
    name: metric.name as VitalName,
    value: metric.value,
    ts: Date.now(),
  };
}

function attach(): void {
  if (attached) return;
  if (typeof window === "undefined") return;
  attached = true;

  // `reportAllChanges: true` so the HUD updates as the metric evolves
  // (e.g. CLS accumulating, INP escalating to a worse interaction).
  // The library still debounces internally and only fires when the
  // canonical metric changes.
  const opts = { reportAllChanges: true };
  try {
    onLCP((m) => broadcast(fromMetric(m)), opts);
    onCLS((m) => broadcast(fromMetric(m)), opts);
    onINP((m) => broadcast(fromMetric(m)), opts);
    onFCP((m) => broadcast(fromMetric(m)), opts);
    onTTFB((m) => broadcast(fromMetric(m)), opts);
  } catch {
    /* unsupported browser; silently degrade to no metrics */
  }
}

/**
 * Subscribe to the vitals stream.  Returns an unsubscribe function.
 * Replays the most recent sample for each metric so late joiners render
 * immediately.
 *
 * Note: `web-vitals` registers persistent observers on first attach;
 * we no longer detach when the last subscriber leaves because the
 * library is designed for one-shot lifetime registration.  This costs
 * nothing at runtime (one observer per metric, regardless of subscriber
 * count) and avoids the previous double-attach race.
 */
export function subscribeVitals(listener: Listener): () => void {
  listeners.add(listener);
  attach();

  // Replay cached samples so the new subscriber has something to render
  // without having to wait for the next observation.
  for (const sample of Object.values(latest)) {
    if (sample) {
      try {
        listener(sample);
      } catch {
        /* swallow: replay must not break subscribe */
      }
    }
  }

  return () => {
    listeners.delete(listener);
  };
}

/** Read-only snapshot of the latest sample per metric.  Intended for tests. */
export function getLatestVitals(): Partial<Record<VitalName, VitalSample>> {
  return { ...latest };
}

/**
 * Test-only: push a synthetic sample through the bus.  Keeps the public
 * subscription API clean and lets jsdom tests exercise HUD rendering
 * without a real `PerformanceObserver`.
 */
export function __emitForTests(sample: VitalSample): void {
  broadcast(sample);
}

/** Test-only: wipe all state between tests. */
export function __resetForTests(): void {
  listeners.clear();
  for (const key of Object.keys(latest) as VitalName[]) {
    delete latest[key];
  }
  // We intentionally do NOT flip `attached` back: web-vitals' observers
  // can't be safely re-registered, but each suite's listeners are
  // cleared above so the next test starts from a clean broadcast set.
}
