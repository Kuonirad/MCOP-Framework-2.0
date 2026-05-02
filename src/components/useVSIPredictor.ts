"use client";

import { MCOP_CONFIG } from "@/config/mcop.config";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  subscribeVSI,
  type VSIShiftSample,
  type VSIShiftSource,
} from "@/app/_components/vsiBus";
import { fallbackCompute, useVSIWorker } from "./useVSIWorker";
import { useLCPProfiler } from "./useLCPProfiler";

/**
 * `useVSIPredictor` — turns the raw stream from `vsiBus` into a
 * predictive, attribution-aware view of session-long visual stability.
 *
 * v3 (2026-05) layers a deepened predictive coaching engine on top of
 * the canonical worker output without altering the worker, the
 * `vsiBus` schema, or any existing field semantics:
 *   - **Kalman-smoothed VSI** (`smoothedVsi`) — noise-resistant 1-D
 *     constant-velocity estimator, useful for HUDs that need a stable
 *     readout under shift storms.
 *   - **Linear-regression slope** (`slopePerSec`) — robust trend
 *     gradient over the rolling buffer.
 *   - **Pattern** (`pattern`) — rule-based classification of the
 *     current root cause, restricted to fields the bus actually
 *     publishes (`tagName`, `selector`, `heightPx`).
 *   - **Multi-horizon predictions** (`horizons`) — probability of
 *     crossing the poor threshold within 5/15/30 seconds.
 *   - **LCP fusion** (`lcpFusionRisk`) — boost when the LCP element
 *     is also the current shift source.
 *   - **Coaching action** (`coachingAction`) — deterministic, copy-
 *     pasteable fix string derived from `(pattern, slope, prob)`.
 *   - **Confidence** (`confidence`) — sample-count-driven trust score.
 *
 * All v3 fields are optional on the public type so the worker, the
 * `vsi.parity.test.ts` guardian, and existing consumers continue to
 * compile and run unchanged. The hook always populates them.
 *
 * The hook is SSR-safe and INP-safe — every state commit goes through
 * `useTransition`, and `pollMs` coalesces recomputes during shift
 * storms.
 */

export type VSIStatus = "good" | "ni" | "poor" | "idle";

export type VSIShiftPattern =
  | "img-no-dim"
  | "video-no-dim"
  | "unknown";

export interface VSIHorizonPrediction {
  readonly horizonMs: number;
  readonly probPoor: number;
  readonly expectedVsi: number;
}

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
  // ---- v3 enrichment (always populated by the hook, optional on the
  // type so the worker / `fallbackCompute` output remains assignable) ----
  readonly smoothedVsi?: number;
  readonly slopePerSec?: number;
  readonly horizons?: ReadonlyArray<VSIHorizonPrediction>;
  readonly pattern?: VSIShiftPattern;
  readonly coachingAction?: string;
  readonly confidence?: number;
  readonly lcpFusionRisk?: number;
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

const HORIZONS_MS: ReadonlyArray<number> = [5_000, 15_000, 30_000];
const POOR_THRESHOLD = 0.25;
const GOOD_THRESHOLD = 0.1;
const KALMAN_Q = 0.001;
const KALMAN_R = 0.1;

const IDLE_HORIZONS: ReadonlyArray<VSIHorizonPrediction> = HORIZONS_MS.map(
  (h) => ({ horizonMs: h, probPoor: 0, expectedVsi: 0 }),
);

const IDLE_STATE: VSIPredictionState = Object.freeze({
  vsi: 0,
  status: "idle",
  trend: "stable",
  predictionMs: null,
  predictionTarget: null,
  shiftCount: 0,
  rootCause: null,
  sparkline: [],
  smoothedVsi: 0,
  slopePerSec: 0,
  horizons: IDLE_HORIZONS,
  pattern: "unknown",
  coachingAction: "Stable — no action needed.",
  confidence: 0,
  lcpFusionRisk: 0,
});

/**
 * 1-D Kalman filter (constant-velocity model) for VSI smoothing.
 * Mutates internal state on each `update()`. Cheap: ~6 FLOPs per step.
 */
class SimpleKalman {
  private x = 0;
  private P = 1;

  update(measurement: number): number {
    const PPred = this.P + KALMAN_Q;
    const K = PPred / (PPred + KALMAN_R);
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * PPred;
    return this.x;
  }

  reset(): void {
    this.x = 0;
    this.P = 1;
  }
}

/**
 * Ordinary least-squares slope (dvsi/dt, in vsi-units per second) over
 * the running cumulative VSI within the rolling window. Returns 0 when
 * there are <3 samples or the time spread is degenerate.
 */
function linearRegressionSlope(samples: ReadonlyArray<InternalSample>): number {
  const n = samples.length;
  if (n < 3) return 0;
  const t0 = samples[0].startTime;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let cumulative = 0;
  for (let i = 0; i < n; i += 1) {
    const x = (samples[i].startTime - t0) / 1000;
    cumulative += samples[i].value;
    const y = cumulative;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom <= 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function detectPattern(source: VSIShiftSource | null): VSIShiftPattern {
  if (!source) return "unknown";
  const tag = source.tagName?.toLowerCase() ?? "";
  if (tag === "img" && source.heightPx === 0) return "img-no-dim";
  if (tag === "video" && source.heightPx === 0) return "video-no-dim";
  return "unknown";
}

function computeHorizons(
  vsi: number,
  slopePerSec: number,
): ReadonlyArray<VSIHorizonPrediction> {
  return HORIZONS_MS.map((h) => {
    const expectedVsi = Math.max(0, vsi + slopePerSec * (h / 1000));
    // Logistic-ish ramp: 0 at GOOD_THRESHOLD, 1 at POOR_THRESHOLD.
    const range = POOR_THRESHOLD - GOOD_THRESHOLD;
    const probPoor =
      range > 0
        ? Math.min(1, Math.max(0, (expectedVsi - GOOD_THRESHOLD) / range))
        : 0;
    return {
      horizonMs: h,
      probPoor: Math.round(probPoor * 100) / 100,
      expectedVsi: Math.round(expectedVsi * 1000) / 1000,
    };
  });
}

function buildCoachingAction(
  pattern: VSIShiftPattern,
  slopePerSec: number,
  probPoorNear: number,
  rootCause: VSIShiftSource | null,
): string {
  const selector = rootCause?.selector ?? "the offending element";
  if (pattern === "img-no-dim") {
    return `Set explicit width/height on <img> at ${selector} to lock layout.`;
  }
  if (pattern === "video-no-dim") {
    return `Set explicit width/height on <video> at ${selector} to lock layout.`;
  }
  if (probPoorNear >= 0.5) {
    return `Visual stability is trending poor — investigate ${selector}.`;
  }
  if (slopePerSec > 0.002) {
    return `VSI rising — investigate ${selector}.`;
  }
  return "Stable — no action needed.";
}

export function useVSIPredictor(
  options: UseVSIPredictorOptions = {},
): VSIPredictionState {
  const opts: Required<UseVSIPredictorOptions> = { ...DEFAULT_OPTS, ...options };
  const samplesRef = useRef<InternalSample[]>([]);
  const lastComputeRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kalmanRef = useRef<SimpleKalman>(new SimpleKalman());
  const [state, setState] = useState<VSIPredictionState>(IDLE_STATE);
  const [, startTransition] = useTransition();
  const { compute } = useVSIWorker();
  const lcp = useLCPProfiler();
  const lcpAttributionRef = useRef(lcp.attribution);
  lcpAttributionRef.current = lcp.attribution;

  useEffect(() => {
    const enrich = (
      base: VSIPredictionState,
      list: ReadonlyArray<InternalSample>,
    ): VSIPredictionState => {
      const smoothedVsi = kalmanRef.current.update(base.vsi);
      const slopePerSec = linearRegressionSlope(list);
      const pattern = detectPattern(base.rootCause);
      const horizons = computeHorizons(base.vsi, slopePerSec);
      const probPoorNear = horizons[0]?.probPoor ?? 0;
      const coachingAction = buildCoachingAction(
        pattern,
        slopePerSec,
        probPoorNear,
        base.rootCause,
      );
      const confidence = Math.min(0.95, 0.6 + base.shiftCount / 40);

      const lcpTag =
        lcpAttributionRef.current?.elementTag?.toLowerCase() ?? null;
      const causeTag = base.rootCause?.tagName?.toLowerCase() ?? null;
      const lcpFusionRisk =
        lcpTag && causeTag && lcpTag === causeTag ? 0.35 : 0;

      return {
        ...base,
        smoothedVsi,
        slopePerSec,
        horizons,
        pattern,
        coachingAction,
        confidence,
        lcpFusionRisk,
      };
    };

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
        const base = fallbackCompute(payload);
        const next = enrich(base, list);
        startTransition(() => setState(next));
        return;
      }

      /* istanbul ignore next -- @preserve: real-Worker success path; jsdom
         takes the synchronous fallback above, so this branch is exercised
         only in real browsers (Cypress + production). */
      compute(payload).then((base) => {
        const next = enrich(base, samplesRef.current);
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
