/**
 * @fileoverview MCOP Framework performance configuration.
 * @description Centralised, immutable thresholds and tunables for
 * Core Web Vitals, VSI, and performance coaching. Teams can override
 * values at build time by importing and spreading their own config,
 * but the defaults follow the official web.dev rubrics (Nov 2024).
 *
 * All values are `Object.freeze`d so accidental mutation at runtime
 * is impossible.
 */

export interface MetricThreshold {
  readonly good: number;
  readonly poor: number;
}

export interface VSIOptions {
  readonly windowMs: number;
  readonly recentMs: number;
  readonly pollMs: number;
  readonly sparklineCap: number;
}

export interface MCOPPerformanceConfig {
  readonly LCP: MetricThreshold;
  readonly INP: MetricThreshold;
  readonly CLS: MetricThreshold;
  readonly FCP: MetricThreshold;
  readonly TTFB: MetricThreshold;
  readonly VSI: MetricThreshold & VSIOptions;
}

export const MCOP_CONFIG: MCOPPerformanceConfig = Object.freeze({
  LCP: Object.freeze({ good: 2500, poor: 4000 }),
  INP: Object.freeze({ good: 200, poor: 500 }),
  CLS: Object.freeze({ good: 0.1, poor: 0.25 }),
  FCP: Object.freeze({ good: 1800, poor: 3000 }),
  TTFB: Object.freeze({ good: 800, poor: 1800 }),
  VSI: Object.freeze({
    good: 0.1,
    poor: 0.25,
    windowMs: 10_000,
    recentMs: 2_000,
    pollMs: 250,
    sparklineCap: 32,
  }),
});

export function classifyMetric(
  name: keyof Omit<MCOPPerformanceConfig, "VSI">,
  value: number,
): "good" | "ni" | "poor" {
  const t = MCOP_CONFIG[name];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "ni";
  return "poor";
}

export function classifyVSI(value: number, count: number): "good" | "ni" | "poor" | "idle" {
  if (count === 0) return "idle";
  if (value <= MCOP_CONFIG.VSI.good) return "good";
  if (value <= MCOP_CONFIG.VSI.poor) return "ni";
  return "poor";
}
