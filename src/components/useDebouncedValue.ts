"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * `useDebouncedValue` — coalesces a high-frequency stream of value
 * updates into a single trailing-edge commit after `delayMs` of quiet.
 *
 * Why this hook exists:
 *   - Core Web Vitals (CLS in particular) and the VSI predictor can fire
 *     dozens of updates per second during a layout-shift storm. Even a
 *     `useTransition`-wrapped `setState` per emission still spends main
 *     thread time on reconcile + style/paint.
 *   - The Performance HUD (and any future user-controlled inputs such as
 *     a "filter logs by tag" search box) only needs the *trailing* value
 *     for display — the intermediate frames are visual noise.
 *
 * Implementation choices:
 *   - The committed state lives behind `useTransition` so the trailing
 *     reconcile is interruptible. This keeps INP under 200ms even when
 *     the trailing edge of a shift storm coincides with a click.
 *   - We use `setTimeout` rather than `requestAnimationFrame` because we
 *     deliberately want to *miss* paint ticks during the debounce window
 *     — committing on every rAF would defeat the purpose.
 *   - SSR-safe: the timer is only scheduled inside `useEffect` so the
 *     server snapshot returns the initial value verbatim and hydration
 *     is stable.
 *
 * @param value     The latest, possibly-noisy input value.
 * @param delayMs   Debounce window in milliseconds. Defaults to 300ms,
 *                  matching the rule-of-thumb for "feels instantaneous"
 *                  text-input debouncing.
 * @returns         The most recently committed value after the input
 *                  has been stable for `delayMs`.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [committed, setCommitted] = useState<T>(value);
  const [, startTransition] = useTransition();
  // Track the last value we committed so we can short-circuit when the
  // debounced edge resolves to the same identity we already display —
  // saves a speculative reconcile per quiet window.
  const lastCommittedRef = useRef<T>(value);

  useEffect(() => {
    if (Object.is(value, lastCommittedRef.current)) return undefined;
    const handle = setTimeout(() => {
      lastCommittedRef.current = value;
      startTransition(() => setCommitted(value));
    }, Math.max(0, delayMs));
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return committed;
}
