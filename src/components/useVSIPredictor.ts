"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  subscribeVSI,
  type VSIShiftSample,
  type VSIShiftSource,
} from "@/app/_components/vsiBus";

/**
 * `useVSIPredictor` — turns the raw stream from `vsiBus` into a
 * predictive, attribution-aware view of session-long visual stability.
 *
 * What it computes (all derived in O(window-length), no DOM reads):
 *   - **vsi**: sum of layout-shift values inside a rolling time window
 *     (default 10s).  Aligned with web.dev's "good ≤ 0.1, poor > 0.25"
 *     CLS rubrics so the threshold ladder is intuitive.
 *   - **status**: classification of the current `vsi`.
 *   - **trend**: comparison of the most-recent slice (`recentMs`) vs the
 *     older portion of the window — `degrading` / `stable` / `improving`.
 *   - **predictionMs**: extrapolated time until `vsi` would cross 0.1
 *     given the recent shift rate.  `null` when the trend is improving
 *     or there isn't enough signal.
 *   - **rootCause**: the most-recent largest-source attribution, lifted
 *     so the coach can name the offending element/selector.
 *   - **sparkline**: the per-shift values (capped) so the UI can render
 *     a tiny inline trend without doing its own bookkeeping.
 *
 * The hook is SSR-safe (the bus stays inert in jsdom) and INP-safe — all
 * state commits go through `useTransition` so a layout-shift storm can't
 * starve the user's interactions.  It also honours `pollMs` to coalesce
 * recomputations, capping the recompute rate even under shift spam.
 */

export type VSIStatus = "good" | "ni" | "poor" | "idle";

export interface VSIPredictionState {
  readonly vsi: number;
  readonly status: VSIStatus;
  readonly trend: "improving" | "stable" | "degrading";
  /**
   * Predicted ms until `vsi` crosses into the next worse tier given the
   * current recent rate.  `null` when the trend is not degrading, the
   * recent slice is empty, or the session is already in the worst tier
   * (`poor`, no further tier to predict).
   *
   * Semantics by current tier (when `trend === "degrading"`):
   *   - good (vsi ≤ 0.1)  → ms until vsi reaches 0.1   (target = ni)
   *   - ni   (vsi ≤ 0.25) → ms until vsi reaches 0.25  (target = poor)
   *   - poor                                           → null
   */
  readonly predictionMs: number | null;
  /** The tier `predictionMs` is counting toward, mirroring the field above. */
  readonly predictionTarget: VSIStatus | null;
  readonly shiftCount: number;
  readonly rootCause: VSIShiftSource | null;
  readonly sparkline: ReadonlyArray<number>;
}

export interface UseVSIPredictorOptions {
  /** Rolling window for VSI accumulation, in ms.  Default 10000. */
  readonly windowMs?: number;
  /** Slice size for trend / prediction calculation, in ms.  Default 2000. */
  readonly recentMs?: number;
  /** Min ms between recomputes; coalesces bursts.  Default 250. */
  readonly pollMs?: number;
  /** Cap on retained sparkline length.  Default 32. */
  readonly sparklineCap?: number;
}

const DEFAULT_OPTS: Required<UseVSIPredictorOptions> = {
  windowMs: 10_000,
  recentMs: 2_000,
  pollMs: 250,
  sparklineCap: 32,
};

const VSI_GOOD = 0.1;
const VSI_POOR = 0.25;

function classify(vsi: number, count: number): VSIStatus {
  if (count === 0) return "idle";
  if (vsi <= VSI_GOOD) return "good";
  if (vsi <= VSI_POOR) return "ni";
  return "poor";
}

interface InternalSample {
  readonly value: number;
  readonly startTime: number;
  readonly source: VSIShiftSource | null;
}

function compute(
  samples: ReadonlyArray<InternalSample>,
  now: number,
  opts: Required<UseVSIPredictorOptions>,
): VSIPredictionState {
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

  // Trend: compare recent rate (per second) to older rate.  Both rates
  // are normalised against their *fixed slice durations* (recentMs and
  // windowMs - recentMs) rather than the age of the oldest sample seen,
  // which previously biased the older-rate denominator and produced
  // spurious "improving" verdicts during shift bursts.  A meaningful
  // delta still requires both windows to have data; otherwise we report
  // stable.
  const olderSliceMs = Math.max(1, opts.windowMs - opts.recentMs);
  let trend: VSIPredictionState["trend"] = "stable";
  if (recentVsi > 0 && olderVsi > 0) {
    const recentRate = recentVsi / (opts.recentMs / 1000);
    const olderRate = olderVsi / (olderSliceMs / 1000);
    if (recentRate > olderRate * 1.25) trend = "degrading";
    else if (recentRate < olderRate * 0.75) trend = "improving";
  } else if (recentVsi > 0 && olderVsi === 0) {
    // Brand-new instability with no prior baseline → flag as degrading
    // so the coach surfaces it instead of silently waiting.
    trend = "degrading";
  } else if (recentVsi === 0 && olderVsi > 0) {
    trend = "improving";
  }

  // Prediction: time-to-next-tier when degrading.  Previously the
  // prediction silently went null once the session crossed into `ni`
  // territory, hiding the most actionable coaching window ("~3 s until
  // POOR").  We now extrapolate to whichever threshold is next on the
  // ladder (good → 0.1 → 0.25 → poor) so the coach keeps speaking
  // until there is no further tier to warn about.
  let predictionMs: number | null = null;
  let predictionTarget: VSIStatus | null = null;
  if (trend === "degrading") {
    let nextThreshold: number | null = null;
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
        predictionMs = Math.max(
          0,
          Math.round((nextThreshold - vsi) / ratePerMs),
        );
      } else {
        predictionTarget = null;
      }
    }
  }

  // Cap sparkline length for the UI.  Latest values matter most.
  const cappedSparkline =
    sparkline.length > opts.sparklineCap
      ? sparkline.slice(-opts.sparklineCap)
      : sparkline;

  return {
    vsi,
    status: classify(vsi, count),
    trend,
    predictionMs,
    predictionTarget,
    shiftCount: count,
    rootCause,
    sparkline: cappedSparkline,
  };
}

const IDLE_STATE: VSIPredictionState = Object.freeze({
  vsi: 0,
  status: "idle",
  trend: "stable",
  predictionMs: null,
  predictionTarget: null,
  shiftCount: 0,
  rootCause: null,
  sparkline: [],
});

export function useVSIPredictor(
  options: UseVSIPredictorOptions = {},
): VSIPredictionState {
  const opts: Required<UseVSIPredictorOptions> = { ...DEFAULT_OPTS, ...options };
  const samplesRef = useRef<InternalSample[]>([]);
  const lastComputeRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<VSIPredictionState>(IDLE_STATE);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const recompute = () => {
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      // Drop samples that have aged out so the buffer stays bounded.
      const cutoff = now - opts.windowMs;
      const list = samplesRef.current;
      let dropIdx = 0;
      while (dropIdx < list.length && list[dropIdx].startTime < cutoff) dropIdx += 1;
      if (dropIdx > 0) list.splice(0, dropIdx);
      const next = compute(list, now, opts);
      startTransition(() => setState(next));
    };

    const schedule = () => {
      const now = Date.now();
      const elapsed = now - lastComputeRef.current;
      if (elapsed >= opts.pollMs) {
        lastComputeRef.current = now;
        recompute();
        return;
      }
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        lastComputeRef.current = Date.now();
        recompute();
      }, opts.pollMs - elapsed);
    };

    const unsubscribe = subscribeVSI((sample: VSIShiftSample) => {
      samplesRef.current.push({
        value: sample.value,
        startTime: sample.startTime,
        source: sample.source,
      });
      schedule();
    });

    // Compute once on mount so the consumer sees `idle` resolve to the
    // current cached state (e.g. shifts that happened before mount).
    recompute();

    return () => {
      unsubscribe();
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
    };
    // The options bag is intentionally read once per mount via opts; if
    // a consumer changes window/poll values, they remount the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
