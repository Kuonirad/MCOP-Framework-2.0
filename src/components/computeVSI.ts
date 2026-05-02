/**
 * `computeVSI` — sole canonical implementation of the Visual Stability
 * Index aggregation algorithm.
 *
 * Until 2026-05-01 the same algorithm lived in three places:
 *   - `usePerformanceCoach.ts` (the unified perf-coach state machine)
 *   - `useVSIWorker.ts` (the in-worker compute body, a string literal)
 *   - `useVSIWorker.ts` (the synchronous main-thread `fallbackCompute`)
 *
 * Each port could silently drift from the others, breaking the
 * predictor's parity guarantees. This module centralises the math so
 * the three call-sites all delegate to the same function.  The Worker
 * variant injects this exact source via `computeVSI.toString()` rather
 * than carrying a hand-maintained copy.
 *
 * Self-contained-by-design: no imports, no closures, no module-level
 * references inside the function body.  TypeScript types are erased on
 * compile, so the stringified output is plain JS that runs unchanged
 * inside a Web Worker blob URL.
 */

import type { VSIShiftSource } from "@/app/_components/vsiBus";

export type VSIStatus = "good" | "ni" | "poor" | "idle";
export type VSITrend = "improving" | "stable" | "degrading";

export interface VSIComputeSample {
  readonly value: number;
  readonly startTime: number;
  readonly source: VSIShiftSource | null;
}

export interface VSIComputeOpts {
  readonly windowMs: number;
  readonly recentMs: number;
  readonly sparklineCap: number;
  readonly goodThreshold: number;
  readonly poorThreshold: number;
}

export interface VSIComputeResult {
  readonly vsi: number;
  readonly status: VSIStatus;
  readonly trend: VSITrend;
  readonly predictionMs: number | null;
  readonly predictionTarget: VSIStatus | null;
  readonly shiftCount: number;
  readonly rootCause: VSIShiftSource | null;
  readonly sparkline: ReadonlyArray<number>;
}

/**
 * Pure VSI aggregation over a rolling-window sample buffer.
 *
 * @param samples  Time-ordered shift samples — older entries first.
 * @param now      Reference timestamp (`performance.now()` or `Date.now()`).
 * @param opts     Window / threshold / sparkline tunables.
 *
 * Self-contained: never reads from imports, closures, or module scope at
 * runtime, so this exact source can be stringified into a Web Worker.
 */
export function computeVSI(
  samples: ReadonlyArray<VSIComputeSample>,
  now: number,
  opts: VSIComputeOpts,
): VSIComputeResult {
  const cutoff = now - opts.windowMs;
  const recentCutoff = now - opts.recentMs;

  let vsi = 0;
  let recentVsi = 0;
  let olderVsi = 0;
  let count = 0;
  let rootCause: VSIShiftSource | null = null;
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
  let trend: VSITrend = "stable";
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
  let predictionTarget: VSIStatus | null = null;
  if (trend === "degrading") {
    let nextThreshold: number | null = null;
    if (vsi < opts.goodThreshold) {
      nextThreshold = opts.goodThreshold;
      predictionTarget = "ni";
    } else if (vsi < opts.poorThreshold) {
      nextThreshold = opts.poorThreshold;
      predictionTarget = "poor";
    }
    if (nextThreshold !== null) {
      const ratePerMs = recentVsi / opts.recentMs;
      if (ratePerMs > 0) {
        predictionMs = Math.max(
          0,
          Math.round((nextThreshold - vsi) / ratePerMs),
        );
      } else {
        predictionTarget = null;
      }
    }
  }

  let status: VSIStatus = "idle";
  if (count > 0) {
    if (vsi <= opts.goodThreshold) status = "good";
    else if (vsi <= opts.poorThreshold) status = "ni";
    else status = "poor";
  }

  const cappedSparkline =
    sparkline.length > opts.sparklineCap
      ? sparkline.slice(-opts.sparklineCap)
      : sparkline;

  return {
    vsi,
    status,
    trend,
    predictionMs,
    predictionTarget,
    shiftCount: count,
    rootCause,
    sparkline: cappedSparkline,
  };
}
