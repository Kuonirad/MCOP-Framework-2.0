"use client";

import { useEffect, useState, useTransition } from "react";

import { useDebouncedValue } from "./useDebouncedValue";
import { useReducedMotion } from "./useReducedMotion";
import { useVSIPredictor, type VSIStatus } from "./useVSIPredictor";

/**
 * `LayoutShiftAnnouncer` — page-level WCAG-compliant `aria-live` region
 * that voices meaningful Visual Stability Index (VSI) status changes to
 * assistive tech *even when the Performance HUD panel is closed*.
 *
 * Why a separate, always-mounted announcer:
 *   - The in-panel `VSICoach` announcer is gated on the HUD being open
 *     so screen-reader users miss layout-shift regressions if they keep
 *     the HUD collapsed (the default state).
 *   - WCAG 4.1.3 (Status Messages, Level AA) recommends programmatic
 *     status announcements for non-modal status changes — layout shifts
 *     are exactly that: ambient stability changes the user did not
 *     trigger.
 *
 * Implementation choices:
 *   - **Idempotent**: only announces when the *status* tier crosses a
 *     threshold (good→ni, ni→poor, etc.), not on every shift sample.
 *     This prevents announcement spam during a shift storm.
 *   - **Debounced**: the displayed string is run through a 300ms debounce
 *     so the trailing-edge state is voiced once the storm settles, not
 *     mid-storm where the value is still volatile.
 *   - **Reduced-motion aware**: when `prefers-reduced-motion: reduce` is
 *     set, the debounce window expands to 1500ms and only `poor`-tier
 *     transitions are announced. Users who opted out of motion are also
 *     opting out of cognitive-load churn.
 *   - **Visually hidden**: rendered with `sr-only` styles so the
 *     announcer never contributes to LCP, CLS, or any visible layout.
 *   - **SSR-safe**: emits an empty string on the server snapshot so
 *     hydration is stable.
 */

const STATUS_RANK: Record<VSIStatus, number> = {
  idle: 0,
  good: 1,
  ni: 2,
  poor: 3,
};

const STATUS_PHRASE: Record<VSIStatus, string> = {
  idle: "",
  good: "Layout stable.",
  ni: "Layout shifting — visual stability needs improvement.",
  poor: "Layout unstable — significant visual shift detected.",
};

export default function LayoutShiftAnnouncer() {
  const state = useVSIPredictor();
  const reducedMotion = useReducedMotion();
  const [, startTransition] = useTransition();
  const [latched, setLatched] = useState<VSIStatus>("idle");

  // Only escalate the latched status when the rank changes. This is the
  // tier-threshold filter described in the file header.
  useEffect(() => {
    if (state.status === latched) return;
    if (state.status === "idle") return;
    // Reduced-motion users only hear the most urgent tier transitions.
    if (reducedMotion && state.status !== "poor" && latched !== "poor") return;
    if (STATUS_RANK[state.status] === STATUS_RANK[latched]) return;
    startTransition(() => setLatched(state.status));
  }, [state.status, latched, reducedMotion]);

  // 300ms debounce default; reduced-motion users get a calmer 1500ms
  // window so trailing edges only voice once the page has truly settled.
  const announced = useDebouncedValue(latched, reducedMotion ? 1500 : 300);

  // The announcement string is empty on idle so screen readers stay
  // silent until something interesting happens.
  const message =
    announced === "idle" ? "" : STATUS_PHRASE[announced];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="layout-shift-announcer"
      data-vsi-status={announced}
      // sr-only: zero visible footprint. We deliberately do not use
      // `aria-hidden`; that would defeat the announcer's purpose.
      className="sr-only"
    >
      {message}
    </div>
  );
}
