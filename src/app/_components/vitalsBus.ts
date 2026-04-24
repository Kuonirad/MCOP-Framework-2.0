/**
 * Shared Core Web Vitals broadcast bus.
 *
 * Owns a *single* set of `PerformanceObserver`s for LCP, CLS, INP, FCP, and
 * TTFB and multiplexes samples to every subscriber (the telemetry sentinel,
 * the live HUD, anything else that lands later).  Centralising the observer
 * keeps measurement cost O(1) no matter how many components want to read the
 * vitals stream, which is the whole point of the "zero-impact live HUD".
 *
 * The module is side-effect free at import time; observers only attach after
 * the first `subscribe()` call, and they detach again when the last subscriber
 * unsubscribes.  That means tests (and SSR) never touch browser-only APIs.
 */

export type VitalName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";

export interface VitalSample {
  readonly name: VitalName;
  readonly value: number;
  readonly ts: number;
}

type Listener = (sample: VitalSample) => void;

const listeners = new Set<Listener>();
// Remembers the most recent sample for each metric so late subscribers (the
// HUD mounts after the first LCP has already fired) immediately render a
// real value instead of dashes.
const latest: Partial<Record<VitalName, VitalSample>> = {};
let observers: PerformanceObserver[] | null = null;
let clsValue = 0;

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

function attach(): void {
  if (observers !== null) return;
  if (typeof window === "undefined") return;
  if (!("PerformanceObserver" in window)) return;

  const list: PerformanceObserver[] = [];

  const observe = (
    type: string,
    handler: (entry: PerformanceEntry) => void,
  ): void => {
    try {
      const po = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) handler(entry);
      });
      po.observe({ type, buffered: true } as PerformanceObserverInit);
      list.push(po);
    } catch {
      /* entry type unsupported in this browser; skip silently */
    }
  };

  observe("largest-contentful-paint", (entry) => {
    broadcast({ name: "LCP", value: entry.startTime, ts: Date.now() });
  });

  observe("paint", (entry) => {
    if (entry.name === "first-contentful-paint") {
      broadcast({ name: "FCP", value: entry.startTime, ts: Date.now() });
    }
  });

  observe("layout-shift", (entry) => {
    const layoutShift = entry as PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
    };
    if (!layoutShift.hadRecentInput) {
      clsValue += layoutShift.value;
      broadcast({ name: "CLS", value: clsValue, ts: Date.now() });
    }
  });

  observe("event", (entry) => {
    const eventEntry = entry as PerformanceEntry & {
      interactionId?: number;
      duration: number;
    };
    if (eventEntry.interactionId) {
      broadcast({ name: "INP", value: eventEntry.duration, ts: Date.now() });
    }
  });

  const nav = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  if (nav) {
    broadcast({ name: "TTFB", value: nav.responseStart, ts: Date.now() });
  }

  observers = list;
}

function detach(): void {
  if (observers === null) return;
  for (const po of observers) {
    try {
      po.disconnect();
    } catch {
      /* already disconnected */
    }
  }
  observers = null;
}

/**
 * Subscribe to the vitals stream.  Returns an unsubscribe function that
 * cleans up observers when the last listener leaves.  Replays the most
 * recent sample for each metric so late joiners render immediately.
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
    if (listeners.size === 0) detach();
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
  clsValue = 0;
  detach();
}
