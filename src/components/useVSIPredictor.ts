"use client";

import { MCOP_CONFIG } from "@/config/mcop.config";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  subscribeVSI,
  type VSIShiftSample,
  type VSIShiftSource,
} from "@/app/_components/vsiBus";
import { fallbackCompute, useVSIWorker } from "./useVSIWorker";

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
  windowMs: MCOP_CONFIG.VSI.windowMs,
  recentMs: MCOP_CONFIG.VSI.recentMs,
  pollMs: MCOP_CONFIG.VSI.pollMs,
  sparklineCap: MCOP_CONFIG.VSI.sparklineCap,
};

interface InternalSample {
  readonly value: number;
  readonly startTime: number;
  readonly source: VSIShiftSource | null;
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
  const { compute } = useVSIWorker();

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

      const payload = {
        type: "compute" as const,
        samples: list,
        now,
        opts,
      };

      // When Web Workers are unavailable (jsdom, CSP, SSR), compute
      // synchronously so jest fake-timers and existing tests continue
      // to work without async flush dances.
      if (typeof Worker === "undefined" || typeof window === "undefined") {
        const next = fallbackCompute(payload);
        startTransition(() => setState(next));
        return;
      }

      /* istanbul ignore next -- @preserve: real-Worker success path; jsdom
         takes the synchronous fallback above, so this branch is exercised
         only in real browsers (Cypress + production). */
      compute(payload).then((next) => {
        startTransition(() => setState(next));
      });
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
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      // Proactively prune aged-out samples before pushing to prevent
      // unbounded buffer growth during shift storms.
      const cutoff = now - opts.windowMs;
      const list = samplesRef.current;
      let dropIdx = 0;
      while (dropIdx < list.length && list[dropIdx].startTime < cutoff) dropIdx += 1;
      if (dropIdx > 0) list.splice(0, dropIdx);
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
