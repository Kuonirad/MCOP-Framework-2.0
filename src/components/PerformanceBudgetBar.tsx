"use client";

import { memo } from "react";

/**
 * `PerformanceBudgetBar` — inline visual budget tracker for the HUD.
 *
 * Renders a compact progress bar showing how close a metric is to its
 * "poor" threshold. The bar is colour-coded (green → amber → red) and
 * includes the raw value for at-a-glance reading.
 *
 * Design properties:
 *   - Zero layout contribution: fixed height, no margins that could shift.
 *   - `aria-hidden` on the visual bar; the numeric value is already
 *     voiced by the parent metric row's `aria-label`.
 *   - `prefers-reduced-motion` safe: the width transition is suppressed
 *     when the user opts out of motion.
 */

export interface BudgetBarProps {
  readonly value: number;
  readonly goodThreshold: number;
  readonly poorThreshold: number;
  readonly label: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fraction(value: number, poorThreshold: number): number {
  if (poorThreshold <= 0) return 0;
  return clamp(value / poorThreshold, 0, 1);
}

function tone(value: number, good: number, poor: number): string {
  if (value <= good) return "bg-emerald-400";
  if (value <= poor) return "bg-amber-400";
  return "bg-rose-400";
}

export const PerformanceBudgetBar = memo(function PerformanceBudgetBar({
  value,
  goodThreshold,
  poorThreshold,
  label,
}: BudgetBarProps) {
  const pct = Math.round(fraction(value, poorThreshold) * 100);
  const barTone = tone(value, goodThreshold, poorThreshold);

  return (
    <div
      className="flex items-center gap-2"
      aria-hidden="true"
      data-testid={`budget-bar-${label}`}
    >
      <div className="h-1.5 flex-1 rounded-full bg-slate-700/60">
        <div
          className={`h-1.5 rounded-full transition-[width] duration-300 motion-reduce:transition-none ${barTone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[9px] tabular-nums text-slate-400">
        {pct}%
      </span>
    </div>
  );
});

export default PerformanceBudgetBar;
