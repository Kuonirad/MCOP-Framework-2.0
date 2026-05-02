"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * `useVSIWorker` — Web Worker-backed VSI computation with graceful
 * main-thread fallback.
 *
 * For pages experiencing extreme layout-shift frequency (e.g. live
 * dashboards with rapid DOM mutations), offloading the VSI math to a
 * worker keeps the main thread free for user input, directly
 * contributing to INP ≤ 200 ms.
 *
 * Design properties:
 *   - Transparent fallback: if the worker fails to spawn (unsupported
 *     browser, CSP restriction, jsdom), computation falls back to the
 *     main thread synchronously.
 *   - Shared interface: the worker and fallback both accept the same
 *     `{samples, now, opts}` payload and return the same
 *     `VSIPredictionState` shape.
 *   - Lifecycle-safe: worker is terminated on unmount; pending messages
 *     are dropped rather than leaking.
 *   - Zero external files: the worker is inlined as a blob URL so no
 *     build-tool worker-plugin configuration is required.
 */

import type { VSIPredictionState, UseVSIPredictorOptions } from "./useVSIPredictor";
import { computeVSI } from "./computeVSI";

interface ComputePayload {
  readonly type: "compute";
  readonly samples: ReadonlyArray<{
    readonly value: number;
    readonly startTime: number;
    readonly source: {
      readonly tagName: string | null;
      readonly selector: string | null;
      readonly heightPx: number;
    } | null;
  }>;
  readonly now: number;
  readonly opts: Required<UseVSIPredictorOptions>;
}

interface ComputeResult {
  readonly type: "result";
  readonly state: VSIPredictionState;
}

// VSI thresholds align with the web.dev CLS rubric and `MCOP_CONFIG.VSI`
// (good ≤ 0.1, poor > 0.25). They are hard-coded here because the worker
// script is stringified at module-load time and cannot reach the config
// module across the Worker boundary.
const VSI_GOOD = 0.1;
const VSI_POOR = 0.25;

// The worker script is inlined so it works in any bundler / test
// environment without special plugin configuration. The compute body is
// injected via `computeVSI.toString()` so the worker shares the exact
// canonical source as the synchronous fallback below — no hand-maintained
// second copy that could drift.
const WORKER_SCRIPT = `
const computeVSI = ${computeVSI.toString()};

self.onmessage = function(e) {
  const { type, samples, now, opts } = e.data;
  if (type !== "compute") return;

  const state = computeVSI(samples, now, {
    windowMs: opts.windowMs,
    recentMs: opts.recentMs,
    sparklineCap: opts.sparklineCap,
    goodThreshold: ${VSI_GOOD},
    poorThreshold: ${VSI_POOR},
  });

  self.postMessage({ type: "result", state });
};
`;

/**
 * Test-only handle on the inlined worker script source. The
 * `vsi.parity.test.ts` parity guardian asserts that this string
 * literally embeds `computeVSI.toString()` so any future change to the
 * canonical implementation propagates to the worker without a hand-edit.
 */
export const __WORKER_SCRIPT_FOR_TESTS: string = WORKER_SCRIPT;

function createWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (typeof Worker === "undefined") return null;
  try {
    const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    // Clean up the blob URL once the worker has loaded.
    worker.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
    return worker;
  } catch {
    return null;
  }
}

export function useVSIWorker(): {
  readonly compute: (
    payload: ComputePayload,
  ) => Promise<VSIPredictionState>;
} {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const worker = createWorker();
    if (worker) {
      workerRef.current = worker;
    }
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  const compute = useCallback(
    (payload: ComputePayload): Promise<VSIPredictionState> => {
      const worker = workerRef.current;
      if (!worker) {
        // Fallback: synchronous main-thread computation. This path is
        // taken in jsdom, CSP-locked environments, or browsers without
        // Worker support.
        return Promise.resolve(fallbackCompute(payload));
      }
      return new Promise((resolve) => {
        const id = ++idRef.current;
        const handler = (e: MessageEvent<ComputeResult>) => {
          if (e.data.type !== "result") return;
          worker.removeEventListener("message", handler);
          resolve(e.data.state);
        };
        worker.addEventListener("message", handler);
        worker.postMessage({ ...payload, _id: id });
      });
    },
    [],
  );

  return { compute };
}

/**
 * Synchronous fallback when the worker is unavailable.
 *
 * Delegates to the canonical `computeVSI` so this path and the worker
 * path are byte-equivalent — the worker script literally embeds
 * `computeVSI.toString()` at module load time.
 */
export function fallbackCompute(payload: ComputePayload): VSIPredictionState {
  return computeVSI(payload.samples, payload.now, {
    windowMs: payload.opts.windowMs,
    recentMs: payload.opts.recentMs,
    sparklineCap: payload.opts.sparklineCap,
    goodThreshold: VSI_GOOD,
    poorThreshold: VSI_POOR,
  });
}
