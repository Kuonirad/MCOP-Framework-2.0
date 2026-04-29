/**
 * Visual Stability Index (VSI) broadcast bus.
 *
 * Where `vitalsBus` reports the canonical Core Web Vitals (CLS is a
 * load-time aggregate), `vsiBus` exposes a *session-long, real-time*
 * signal of layout instability. It listens to the browser's Layout
 * Instability API (`PerformanceObserver` of type `'layout-shift'`) and
 * fans samples — including each shift's largest source attribution —
 * out to every subscriber from a single observer.
 *
 * Design contract:
 *   - **Single observer**: at most one `PerformanceObserver` is attached
 *     for the lifetime of the page; subscribers are multiplexed.
 *   - **No SSR / test crashes**: `window.PerformanceObserver` is
 *     feature-detected. In jsdom (no observer), the bus stays inert and
 *     can be driven via `__emitShiftForTests` for deterministic tests.
 *   - **No detection of user-triggered shifts**: entries with
 *     `hadRecentInput` are dropped per spec — they're expected.
 *   - **Bounded memory**: the bus only retains the last `MAX_SAMPLES`
 *     shifts; older samples are evicted in O(1).
 *   - **Crash-safe**: a faulty subscriber must never break measurement
 *     or starve other subscribers (try/catch isolates each callback).
 */

export interface VSIShiftSource {
  /** Lower-case tag name of the largest-contributing element, if known. */
  readonly tagName: string | null;
  /** A short, dev-readable selector hint (`#id`, `.class`, `tag`). */
  readonly selector: string | null;
  /** Vertical extent of the shifted region in CSS pixels. */
  readonly heightPx: number;
}

export interface VSIShiftSample {
  /** Layout-shift score for this single entry. */
  readonly value: number;
  /** `performance.now()` timestamp of the shift. */
  readonly startTime: number;
  /** Wall-clock receipt time, for cross-tab correlation. */
  readonly ts: number;
  /** Best-effort attribution of the largest contributing source. */
  readonly source: VSIShiftSource | null;
}

type Listener = (sample: VSIShiftSample) => void;

const MAX_SAMPLES = 256;

const listeners = new Set<Listener>();
const recentSamples: VSIShiftSample[] = [];
let observer: PerformanceObserver | null = null;
let attached = false;

interface LayoutShiftAttribution {
  readonly node: Node | null;
  readonly currentRect: DOMRectReadOnly;
  readonly previousRect: DOMRectReadOnly;
}

interface LayoutShiftEntry extends PerformanceEntry {
  readonly value: number;
  readonly hadRecentInput: boolean;
  readonly sources?: ReadonlyArray<LayoutShiftAttribution>;
}

export function describeNode(node: Node | null, rect?: DOMRectReadOnly): VSIShiftSource | null {
  if (!node) return null;
  const el = node.nodeType === 1 ? (node as Element) : null;
  const tagName = el ? el.tagName.toLowerCase() : null;
  let selector: string | null = null;
  let heightPx = 0;
  if (el) {
    if (el.id) {
      selector = `#${el.id}`;
    } else if (el.classList.length > 0) {
      const stableClass = Array.from(el.classList).find((c) => c.length > 2) ?? el.classList[0];
      selector = `${tagName}.${stableClass}`;
    } else {
      selector = tagName;
    }
    // Use the provided rect from LayoutShiftAttribution instead of
    // calling getBoundingClientRect(), which would force a synchronous
    // layout calculation during an active layout-shift observation.
    if (rect) {
      heightPx = Math.round(rect.height);
    }
  }
  return { tagName, selector, heightPx };
}

export function pickLargestSource(
  sources: ReadonlyArray<LayoutShiftAttribution> | undefined,
): VSIShiftSource | null {
  if (!sources || sources.length === 0) return null;
  // Pick the source whose moved bounding box has the greatest area —
  // that's almost always the element a developer would want to fix.
  let best: LayoutShiftAttribution | null = null;
  let bestArea = -1;
  for (const s of sources) {
    const r = s.currentRect;
    const area = Math.max(0, r.width) * Math.max(0, r.height);
    if (area > bestArea) {
      best = s;
      bestArea = area;
    }
  }
  return best ? describeNode(best.node, best.currentRect) : null;
}

function broadcast(sample: VSIShiftSample): void {
  recentSamples.push(sample);
  if (recentSamples.length > MAX_SAMPLES) {
    recentSamples.shift();
  }
  for (const l of Array.from(listeners)) {
    try {
      l(sample);
    } catch {
      /* a faulty subscriber must never break measurement */
    }
  }
}

function attach(): void {
  if (attached) return;
  if (typeof window === "undefined") return;
  if (typeof window.PerformanceObserver === "undefined") return;
  attached = true;
  try {
    observer = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as LayoutShiftEntry;
        if (entry.hadRecentInput) continue;
        broadcast({
          value: entry.value,
          startTime: entry.startTime,
          ts: Date.now(),
          source: pickLargestSource(entry.sources),
        });
      }
    });
    // `buffered: true` replays shifts that happened before the observer
    // attached, so a late HUD mount still sees the early-page churn.
    observer.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* unsupported browser; silently degrade to no instability data */
    observer = null;
  }
}

/**
 * Subscribe to the VSI shift stream. Returns an unsubscribe function.
 * Replays cached samples so a late subscriber has historical context
 * available immediately.
 */
export function subscribeVSI(listener: Listener): () => void {
  listeners.add(listener);
  attach();
  for (const cached of recentSamples) {
    try {
      listener(cached);
    } catch {
      /* swallow: replay must not break subscribe */
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Read-only snapshot of buffered shift samples. Intended for tests. */
export function getRecentVSIShifts(): ReadonlyArray<VSIShiftSample> {
  return recentSamples.slice();
}

/** Test-only: push a synthetic shift through the bus. */
export function __emitShiftForTests(sample: VSIShiftSample): void {
  broadcast(sample);
}

/** Test-only: wipe all state between tests. */
export function __resetVSIForTests(): void {
  listeners.clear();
  recentSamples.length = 0;
  attached = false;
  observer = null;
}
