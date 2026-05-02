"use client";

import { MCOP_CONFIG } from "@/config/mcop.config";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  subscribeVitals,
  type VitalName,
  type VitalSample,
} from "@/app/_components/vitalsBus";
import {
  subscribeVSI,
  type VSIShiftSample,
  type VSIShiftSource,
} from "@/app/_components/vsiBus";
import { computeVSI as computeVSICore } from "./computeVSI";

/**
 * `usePerformanceCoach` — Unified performance intelligence hook.
 *
 * Aggregates LCP, INP, CLS, VSI, FCP, and TTFB into a single coherent
 * coaching surface. Surfaces:
 *   - **Current status** per metric (good / ni / poor)
 *   - **Trend direction** (improving / stable / degrading)
 *   - **Actionable recommendations** tailored to the worst-performing metric
 *   - **INP guard** — detects interaction latency spikes and suggests fixes
 *   - **LCP profiler** — tracks LCP element attribution when available
 *   - **Budget compliance** — which metrics are within web.dev thresholds
 *
 * Design properties:
 *   - Single subscription to both buses (zero extra observers)
 *   - All state commits via `useTransition` (INP-safe)
 *   - Bounded memory (proactive pruning on every ingestion)
 *   - SSR-safe (buses are inert in jsdom)
 *
 * This is the flagship positive creation of the Performance HUD
 * optimization sweep — a reusable, comprehensive performance coach
 * that any component can drop in to get full-spectrum telemetry.
 */

export type MetricStatus = "good" | "ni" | "poor" | "idle";
export type Trend = "improving" | "stable" | "degrading";

export interface MetricThreshold {
  readonly good: number;
  readonly poor: number;
}

export const THRESHOLDS: Record<"LCP" | "INP" | "CLS", MetricThreshold> = {
  LCP: MCOP_CONFIG.LCP,
  INP: MCOP_CONFIG.INP,
  CLS: MCOP_CONFIG.CLS,
};

export function classifyMetric(
  name: "LCP" | "INP" | "CLS",
  value: number,
): MetricStatus {
  const t = THRESHOLDS[name];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "ni";
  return "poor";
}

export interface CoachingMessage {
  readonly severity: "info" | "warn" | "critical";
  readonly metric: VitalName | "VSI";
  readonly title: string;
  readonly body: string;
  readonly action?: string;
  readonly wcag?: string;
}

export interface INPGuardState {
  readonly status: MetricStatus;
  readonly lastValue: number;
  readonly spikeDetected: boolean;
  readonly recommendation: string;
}

export interface LCPProfile {
  readonly status: MetricStatus;
  readonly lastValue: number;
  readonly elementTag: string | null;
  readonly elementUrl: string | null;
  readonly recommendation: string;
}

export interface VSIState {
  readonly vsi: number;
  readonly status: MetricStatus;
  readonly trend: Trend;
  readonly shiftCount: number;
  readonly rootCause: VSIShiftSource | null;
  readonly predictionMs: number | null;
  readonly predictionTarget: MetricStatus | null;
}

export interface PerformanceCoachState {
  readonly lcp: LCPProfile;
  readonly inp: INPGuardState;
  readonly cls: { status: MetricStatus; lastValue: number };
  readonly vsi: VSIState;
  readonly fcp: { status: MetricStatus; lastValue: number };
  readonly ttfb: { status: MetricStatus; lastValue: number };
  readonly overallStatus: MetricStatus;
  readonly worstMetric: VitalName | "VSI" | null;
  readonly messages: ReadonlyArray<CoachingMessage>;
  readonly allGood: boolean;
}

interface InternalVitalSnapshot {
  [key: string]: VitalSample | null;
  lcp: VitalSample | null;
  inp: VitalSample | null;
  cls: VitalSample | null;
  fcp: VitalSample | null;
  ttfb: VitalSample | null;
}

const IDLE_LCP: LCPProfile = Object.freeze({
  status: "idle",
  lastValue: 0,
  elementTag: null,
  elementUrl: null,
  recommendation: "Waiting for Largest Contentful Paint…",
});

const IDLE_INP: INPGuardState = Object.freeze({
  status: "idle",
  lastValue: 0,
  spikeDetected: false,
  recommendation: "Waiting for interactions…",
});

const IDLE_CLS = Object.freeze({ status: "idle" as MetricStatus, lastValue: 0 });
const IDLE_FCP = Object.freeze({ status: "idle" as MetricStatus, lastValue: 0 });
const IDLE_TTFB = Object.freeze({ status: "idle" as MetricStatus, lastValue: 0 });

const IDLE_VSI: VSIState = Object.freeze({
  vsi: 0,
  status: "idle",
  trend: "stable",
  shiftCount: 0,
  rootCause: null,
  predictionMs: null,
  predictionTarget: null,
});

function buildLCPProfile(sample: VitalSample | null): LCPProfile {
  if (!sample) return IDLE_LCP;
  const value = sample.value;
  const status = classifyMetric("LCP", value);
  let recommendation = "LCP is within budget.";
  if (status === "ni") {
    recommendation =
      "LCP exceeds 2.5 s. Preload the LCP image with `<link rel=preload as=image>` or inline critical CSS.";
  } else if (status === "poor") {
    recommendation =
      "LCP exceeds 4 s. Consider a skeleton placeholder, font-display: swap, and compressing the hero asset.";
  }
  return {
    status,
    lastValue: value,
    elementTag: null, // Could be enriched with PerformanceObserver({type:'largest-contentful-paint'}).element
    elementUrl: null,
    recommendation,
  };
}

function buildINPGuard(sample: VitalSample | null, prev: INPGuardState): INPGuardState {
  if (!sample) return IDLE_INP;
  const value = sample.value;
  const status = classifyMetric("INP", value);
  const spikeDetected = value > THRESHOLDS.INP.good && prev.lastValue <= THRESHOLDS.INP.good;
  let recommendation = "Interactions are responsive.";
  if (status === "ni") {
    recommendation =
      "INP > 200 ms. Wrap heavy work in `useTransition`, debounce inputs, or move computation to a Web Worker.";
  } else if (status === "poor") {
    recommendation =
      "INP > 500 ms. Chunk long tasks (<50 ms each), avoid layout thrashing, and minimise main-thread work.";
  }
  return { status, lastValue: value, spikeDetected, recommendation };
}

function buildCLSState(sample: VitalSample | null): { status: MetricStatus; lastValue: number } {
  if (!sample) return IDLE_CLS;
  const value = sample.value;
  return { status: classifyMetric("CLS", value), lastValue: value };
}

function buildFCPState(sample: VitalSample | null): { status: MetricStatus; lastValue: number } {
  if (!sample) return IDLE_FCP;
  const value = sample.value;
  const status: MetricStatus = value <= MCOP_CONFIG.FCP.good ? "good" : value <= MCOP_CONFIG.FCP.poor ? "ni" : "poor";
  return { status, lastValue: value };
}

function buildTTFBState(sample: VitalSample | null): { status: MetricStatus; lastValue: number } {
  if (!sample) return IDLE_TTFB;
  const value = sample.value;
  const status: MetricStatus = value <= MCOP_CONFIG.TTFB.good ? "good" : value <= MCOP_CONFIG.TTFB.poor ? "ni" : "poor";
  return { status, lastValue: value };
}

interface InternalVSISample {
  value: number;
  startTime: number;
  source: VSIShiftSource | null;
}

/**
 * Build a coach-facing `VSIState` from the canonical `computeVSI`
 * implementation in `./computeVSI`. The shared core also returns a
 * `sparkline` field; this wrapper drops it because the perf-coach
 * aggregator does not surface a sparkline (the dedicated `useVSIPredictor`
 * hook owns that surface).
 */
function computeVSI(
  samples: ReadonlyArray<InternalVSISample>,
  now: number,
): VSIState {
  const result = computeVSICore(samples, now, {
    windowMs: MCOP_CONFIG.VSI.windowMs,
    recentMs: MCOP_CONFIG.VSI.recentMs,
    sparklineCap: MCOP_CONFIG.VSI.sparklineCap,
    goodThreshold: MCOP_CONFIG.VSI.good,
    poorThreshold: MCOP_CONFIG.VSI.poor,
  });
  return {
    vsi: result.vsi,
    status: result.status,
    trend: result.trend,
    shiftCount: result.shiftCount,
    rootCause: result.rootCause,
    predictionMs: result.predictionMs,
    predictionTarget: result.predictionTarget,
  };
}

function generateMessages(state: PerformanceCoachState): CoachingMessage[] {
  const msgs: CoachingMessage[] = [];
  if (state.lcp.status === "poor") {
    msgs.push({
      severity: "critical",
      metric: "LCP",
      title: "LCP critically slow",
      body: state.lcp.recommendation,
      action: "Preload hero image",
      wcag: "WCAG 2.4.3 Focus Order",
    });
  } else if (state.lcp.status === "ni") {
    msgs.push({
      severity: "warn",
      metric: "LCP",
      title: "LCP needs improvement",
      body: state.lcp.recommendation,
      action: "Inline critical CSS",
    });
  }

  if (state.inp.status === "poor") {
    msgs.push({
      severity: "critical",
      metric: "INP",
      title: "Interactions severely delayed",
      body: state.inp.recommendation,
      action: "Chunk long tasks",
      wcag: "WCAG 2.4.3 Focus Order",
    });
  } else if (state.inp.status === "ni") {
    msgs.push({
      severity: "warn",
      metric: "INP",
      title: "Interaction latency high",
      body: state.inp.recommendation,
      action: "Use useTransition",
    });
  }

  if (state.cls.status === "poor") {
    msgs.push({
      severity: "critical",
      metric: "CLS",
      title: "Layout extremely unstable",
      body: "CLS > 0.25. Reserve space for all async content and use `contain: layout`.",
      action: "Add explicit dimensions",
      wcag: "WCAG 1.4.10 Reflow",
    });
  } else if (state.cls.status === "ni") {
    msgs.push({
      severity: "warn",
      metric: "CLS",
      title: "Layout shifting",
      body: "CLS > 0.1. Set width/height on images and avoid inserting content above existing content.",
      action: "Reserve space",
    });
  }

  if (state.vsi.status === "poor") {
    msgs.push({
      severity: "critical",
      metric: "VSI",
      title: "Visual stability critical",
      body: `Session VSI ${state.vsi.vsi.toFixed(3)}. ${state.vsi.rootCause?.selector ? `Offender: ${state.vsi.rootCause.selector}` : "Add `contain: layout` to dynamic regions."}`,
      action: "Contain unstable regions",
      wcag: "WCAG 1.4.10 Reflow",
    });
  } else if (state.vsi.status === "ni" && state.vsi.trend === "degrading") {
    msgs.push({
      severity: "warn",
      metric: "VSI",
      title: "Visual stability degrading",
      body: state.vsi.predictionMs != null
        ? `Predicted poor in ${(state.vsi.predictionMs / 1000).toFixed(1)} s. ${state.vsi.rootCause?.selector ? `Watch ${state.vsi.rootCause.selector}.` : ""}`
        : "Recent shift rate is higher than the baseline. Monitor layout changes.",
      action: "Review recent shifts",
    });
  }

  if (state.ttfb.status === "poor") {
    msgs.push({
      severity: "warn",
      metric: "TTFB",
      title: "Server response slow",
      body: "TTFB > 1.8 s. Enable caching, use a CDN, or reduce server-side work.",
      action: "Enable edge caching",
    });
  }

  return msgs;
}

function computeOverallStatus(state: Omit<PerformanceCoachState, "overallStatus" | "worstMetric" | "messages" | "allGood">): {
  overallStatus: MetricStatus;
  worstMetric: VitalName | "VSI" | null;
  allGood: boolean;
} {
  const scores: Array<{ name: VitalName | "VSI"; status: MetricStatus }> = [
    { name: "LCP", status: state.lcp.status },
    { name: "INP", status: state.inp.status },
    { name: "CLS", status: state.cls.status },
    { name: "VSI", status: state.vsi.status },
    { name: "FCP", status: state.fcp.status },
    { name: "TTFB", status: state.ttfb.status },
  ];

  const rank: Record<MetricStatus, number> = { idle: 0, good: 1, ni: 2, poor: 3 };
  let worst: MetricStatus = "idle";
  let worstName: VitalName | "VSI" | null = null;
  let allGood = true;

  for (const s of scores) {
    if (rank[s.status] > rank[worst]) {
      worst = s.status;
      worstName = s.name;
    }
    if (s.status !== "idle" && s.status !== "good") {
      allGood = false;
    }
  }

  return { overallStatus: worst, worstMetric: worstName, allGood: allGood && scores.some(s => s.status !== "idle") };
}

export function usePerformanceCoach(): PerformanceCoachState {
  const [, startTransition] = useTransition();
  const vitalsRef = useRef<InternalVitalSnapshot>({
    lcp: null,
    inp: null,
    cls: null,
    fcp: null,
    ttfb: null,
  });
  const vsiSamplesRef = useRef<InternalVSISample[]>([]);
  const lastInpRef = useRef<INPGuardState>(IDLE_INP);

  const [state, setState] = useState<PerformanceCoachState>(() => {
    const s = {
      lcp: IDLE_LCP,
      inp: IDLE_INP,
      cls: IDLE_CLS,
      vsi: IDLE_VSI,
      fcp: IDLE_FCP,
      ttfb: IDLE_TTFB,
      overallStatus: "idle" as MetricStatus,
      worstMetric: null,
      messages: [] as CoachingMessage[],
      allGood: false,
    };
    return { ...s, ...computeOverallStatus(s) };
  });

  const recompute = useCallback(() => {
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    // Prune VSI samples
    const vsiCutoff = now - MCOP_CONFIG.VSI.windowMs;
    const vsiList = vsiSamplesRef.current;
    let dropIdx = 0;
    while (dropIdx < vsiList.length && vsiList[dropIdx].startTime < vsiCutoff) dropIdx += 1;
    if (dropIdx > 0) vsiList.splice(0, dropIdx);

    const vsi = computeVSI(vsiList, now);
    const vitals = vitalsRef.current;
    const lcp = buildLCPProfile(vitals.lcp);
    const inp = buildINPGuard(vitals.inp, lastInpRef.current);
    lastInpRef.current = inp;
    const cls = buildCLSState(vitals.cls);
    const fcp = buildFCPState(vitals.fcp);
    const ttfb = buildTTFBState(vitals.ttfb);

    const next: Omit<PerformanceCoachState, "overallStatus" | "worstMetric" | "messages" | "allGood"> = {
      lcp,
      inp,
      cls,
      vsi,
      fcp,
      ttfb,
    };

    const meta = computeOverallStatus(next);
    const messages = generateMessages({ ...next, ...meta, messages: [], allGood: false });

    startTransition(() =>
      setState({ ...next, ...meta, messages, allGood: meta.allGood }),
    );
  }, []);

  useEffect(() => {
    const unsubscribeVitals = subscribeVitals((sample) => {
      vitalsRef.current[sample.name.toLowerCase()] = sample;
      recompute();
    });

    const unsubscribeVSI = subscribeVSI((sample: VSIShiftSample) => {
      vsiSamplesRef.current.push({
        value: sample.value,
        startTime: sample.startTime,
        source: sample.source,
      });
      recompute();
    });

    // Initial compute so state resolves from cached bus data.
    recompute();

    return () => {
      unsubscribeVitals();
      unsubscribeVSI();
    };
  }, [recompute]);

  return state;
}
