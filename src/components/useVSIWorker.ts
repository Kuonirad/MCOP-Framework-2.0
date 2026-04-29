"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

// The worker script is inlined so it works in any bundler / test
// environment without special plugin configuration.
const WORKER_SCRIPT = `
const VSI_GOOD = 0.1;
const VSI_POOR = 0.25;

function classify(vsi, count) {
  if (count === 0) return "idle";
  if (vsi <= VSI_GOOD) return "good";
  if (vsi <= VSI_POOR) return "ni";
  return "poor";
}

self.onmessage = function(e) {
  const { type, samples, now, opts } = e.data;
  if (type !== "compute") return;

  const cutoff = now - opts.windowMs;
  const recentCutoff = now - opts.recentMs;

  let vsi = 0;
  let recentVsi = 0;
  let olderVsi = 0;
  let count = 0;
  let rootCause = null;
  const sparkline = [];

  for (const s of samples) {
    if (s.startTime < cutoff) continue;
    vsi += s.value;
    count += 1;
    sparkline.push(s.value);
    if (s.startTime >= recentCutoff) {
      recentVsi += s.value;
    } else {
      olderVsi += s.value;
    }
    if (s.source) rootCause = s.source;
  }

  const olderSliceMs = Math.max(1, opts.windowMs - opts.recentMs);
  let trend = "stable";
  if (recentVsi > 0 && olderVsi > 0) {
    const recentRate = recentVsi / (opts.recentMs / 1000);
    const olderRate = olderVsi / (olderSliceMs / 1000);
    if (recentRate > olderRate * 1.25) trend = "degrading";
    else if (recentRate < olderRate * 0.75) trend = "improving";
  } else if (recentVsi > 0 && olderVsi === 0) {
    trend = "degrading";
  } else if (recentVsi === 0 && olderVsi > 0) {
    trend = "improving";
  }

  let predictionMs = null;
  let predictionTarget = null;
  if (trend === "degrading") {
    let nextThreshold = null;
    if (vsi < VSI_GOOD) {
      nextThreshold = VSI_GOOD;
      predictionTarget = "ni";
    } else if (vsi < VSI_POOR) {
      nextThreshold = VSI_POOR;
      predictionTarget = "poor";
    }
    if (nextThreshold !== null) {
      const ratePerMs = recentVsi / opts.recentMs;
      if (ratePerMs > 0) {
        predictionMs = Math.max(0, Math.round((nextThreshold - vsi) / ratePerMs));
      } else {
        predictionTarget = null;
      }
    }
  }

  const cappedSparkline =
    sparkline.length > opts.sparklineCap
      ? sparkline.slice(-opts.sparklineCap)
      : sparkline;

  const state = {
    vsi,
    status: classify(vsi, count),
    trend,
    predictionMs,
    predictionTarget,
    shiftCount: count,
    rootCause,
    sparkline: cappedSparkline,
  };

  self.postMessage({ type: "result", state });
};
`;

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
  readonly usingWorker: boolean;
} {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const [usingWorker, setUsingWorker] = useState(false);

  useEffect(() => {
    const worker = createWorker();
    if (worker) {
      workerRef.current = worker;
      setUsingWorker(true);
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

  return { compute, usingWorker };
}

/** Synchronous fallback when the worker is unavailable. */
export function fallbackCompute(payload: ComputePayload): VSIPredictionState {
  const { samples, now, opts } = payload;
  const cutoff = now - opts.windowMs;
  const recentCutoff = now - opts.recentMs;

  let vsi = 0;
  let recentVsi = 0;
  let olderVsi = 0;
  let count = 0;
  let rootCause: VSIPredictionState["rootCause"] = null;
  const sparkline: number[] = [];

  for (const s of samples) {
    if (s.startTime < cutoff) continue;
    vsi += s.value;
    count += 1;
    sparkline.push(s.value);
    if (s.startTime >= recentCutoff) {
      recentVsi += s.value;
    } else {
      olderVsi += s.value;
    }
    if (s.source) rootCause = s.source;
  }

  const olderSliceMs = Math.max(1, opts.windowMs - opts.recentMs);
  let trend: VSIPredictionState["trend"] = "stable";
  if (recentVsi > 0 && olderVsi > 0) {
    const recentRate = recentVsi / (opts.recentMs / 1000);
    const olderRate = olderVsi / (olderSliceMs / 1000);
    if (recentRate > olderRate * 1.25) trend = "degrading";
    else if (recentRate < olderRate * 0.75) trend = "improving";
  } else if (recentVsi > 0 && olderVsi === 0) {
    trend = "degrading";
  } else if (recentVsi === 0 && olderVsi > 0) {
    trend = "improving";
  }

  let predictionMs: number | null = null;
  let predictionTarget: VSIPredictionState["predictionTarget"] = null;
  if (trend === "degrading") {
    let nextThreshold: number | null = null;
    if (vsi < 0.1) {
      nextThreshold = 0.1;
      predictionTarget = "ni";
    } else if (vsi < 0.25) {
      nextThreshold = 0.25;
      predictionTarget = "poor";
    }
    if (nextThreshold !== null) {
      const ratePerMs = recentVsi / opts.recentMs;
      if (ratePerMs > 0) {
        predictionMs = Math.max(0, Math.round((nextThreshold - vsi) / ratePerMs));
      } else {
        predictionTarget = null;
      }
    }
  }

  const cappedSparkline =
    sparkline.length > opts.sparklineCap
      ? sparkline.slice(-opts.sparklineCap)
      : sparkline;

  return {
    vsi,
    status: count === 0 ? "idle" : vsi <= 0.1 ? "good" : vsi <= 0.25 ? "ni" : "poor",
    trend,
    predictionMs,
    predictionTarget,
    shiftCount: count,
    rootCause,
    sparkline: cappedSparkline,
  };
}
