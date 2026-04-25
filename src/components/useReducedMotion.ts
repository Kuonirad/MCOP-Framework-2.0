"use client";

import { useSyncExternalStore } from "react";

/**
 * `useReducedMotion` — reusable utility hook that returns `true` when the
 * user has expressed a preference for reduced motion via the OS or
 * browser.  Mirrors the CSS `prefers-reduced-motion: reduce` query so
 * components can throttle animation, decoration, and live-region
 * announcement frequency in lockstep with the CSS layer.
 *
 * Implemented on top of `useSyncExternalStore` so the value is read
 * directly from the live `MediaQueryList` instead of being mirrored
 * through React state.  This avoids both:
 *   - the cascading-render hazard of `setState` inside `useEffect`, and
 *   - the SSR / hydration mismatch that a `useState` mirror would produce
 *     when the server snapshot disagrees with the client query.
 *
 * SSR snapshot: the server-rendered value is `false` (no motion
 * preference assumed) so the markup hydrates stably; the client takes
 * over with the real preference on its first commit.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(notify: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const mq = window.matchMedia(QUERY);
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", notify);
    return () => mq.removeEventListener("change", notify);
  }
  // Older Safari variants only expose addListener / removeListener.  Use
  // whichever exists so the hook works across the long tail of browsers.
  const legacy = mq as MediaQueryList & {
    addListener?: (cb: () => void) => void;
    removeListener?: (cb: () => void) => void;
  };
  legacy.addListener?.(notify);
  return () => legacy.removeListener?.(notify);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
