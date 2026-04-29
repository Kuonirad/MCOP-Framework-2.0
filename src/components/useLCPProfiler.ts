"use client";

import { MCOP_CONFIG } from "@/config/mcop.config";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * `useLCPProfiler` — LCP attribution and optimization hook.
 *
 * Uses the `PerformanceObserver` with `type: 'largest-contentful-paint'`
 * to capture the LCP element, its URL (for images), render time, and
 * load time. Surfaces actionable recommendations based on element type.
 *
 * This is a positive creation that directly addresses the LCP ≤ 2.5 s
 * success criterion by telling developers *exactly* which element is
 * the LCP target and how to optimize it.
 *
 * Design properties:
 *   - Single observer, auto-detached on unmount.
 *   - `useTransition` for state commits (INP-safe).
 *   - SSR-safe: observer only attaches in the browser.
 *   - Falls back gracefully when the browser doesn't support LCP
 *     attribution (Safari < 16, etc.).
 */

export interface LCPAttribution {
  readonly elementTag: string | null;
  readonly elementUrl: string | null;
  readonly renderTime: number;
  readonly loadTime: number;
  readonly size: number;
}

export interface LCPProfilerState {
  readonly value: number;
  readonly status: "good" | "ni" | "poor" | "idle";
  readonly attribution: LCPAttribution | null;
  readonly recommendation: string;
}

const IDLE_STATE: LCPProfilerState = Object.freeze({
  value: 0,
  status: "idle",
  attribution: null,
  recommendation: "Waiting for Largest Contentful Paint…",
});

function classifyLCP(value: number): "good" | "ni" | "poor" {
  if (value <= MCOP_CONFIG.LCP.good) return "good";
  if (value <= MCOP_CONFIG.LCP.poor) return "ni";
  return "poor";
}

function buildRecommendation(tag: string | null, url: string | null): string {
  if (!tag) return "LCP element not yet identified. Ensure your hero content is visible above the fold.";
  if (tag === "img") {
    if (url) {
      return `LCP is an image (${url}). Preload it with \`<link rel="preload" as="image" href="${url}\">\`, compress it (WebP/AVIF), and set explicit width/height to avoid CLS.`;
    }
    return "LCP is an image without a src. Set fetchPriority='high', use loading='eager', and compress the asset.";
  }
  if (tag === "video") {
    return "LCP is a video. Add a poster image, preload poster with fetchPriority='high', and avoid autoplaying heavy assets.";
  }
  if (tag === "h1" || tag === "h2" || tag === "p") {
    return "LCP is text. Ensure web fonts load quickly (font-display: swap), inline critical font CSS, and minimise render-blocking resources.";
  }
  if (tag === "div" || tag === "section") {
    return "LCP is a block-level container. Split it into a skeleton placeholder + async content to get paint earlier.";
  }
  return `LCP is \`${tag}\`. Review its render-blocking dependencies and consider preloading critical resources.`;
}

export function useLCPProfiler(): LCPProfilerState {
  const [, startTransition] = useTransition();
  const [state, setState] = useState<LCPProfilerState>(IDLE_STATE);
  const lastValueRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof PerformanceObserver === "undefined") return;

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length === 0) return;
        const last = entries[entries.length - 1] as PerformanceEntry & {
          element?: Element;
          url?: string;
          renderTime?: number;
          loadTime?: number;
          size?: number;
          startTime: number;
        };

        const value = last.startTime;
        // Only update if LCP changed (it can fire multiple times as
        // larger elements paint).
        if (value <= lastValueRef.current) return;
        lastValueRef.current = value;

        const tag = last.element?.tagName?.toLowerCase() ?? null;
        const url = last.url ?? null;
        const renderTime = last.renderTime ?? value;
        const loadTime = last.loadTime ?? value;
        const size = last.size ?? 0;

        const status = classifyLCP(value);
        const recommendation = buildRecommendation(tag, url);

        startTransition(() =>
          setState({
            value,
            status,
            attribution: { elementTag: tag, elementUrl: url, renderTime, loadTime, size },
            recommendation,
          }),
        );
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* Browser doesn't support LCP attribution — silently degrade */
    }

    return () => {
      observer?.disconnect();
    };
  }, []);

  return state;
}
