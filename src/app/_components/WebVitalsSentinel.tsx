"use client";

import { useEffect } from "react";

/**
 * Core Web Vitals Sentinel — real-user monitoring that streams LCP, CLS, INP,
 * FCP, and TTFB events to `/api/vitals` using `navigator.sendBeacon` so the
 * report survives page unload. Uses the browser-native `PerformanceObserver`
 * to avoid pulling in a third-party runtime dependency.
 */
export default function WebVitalsSentinel() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("PerformanceObserver" in window)) return;

    const device =
      (navigator as Navigator & { connection?: { effectiveType?: string } })
        .connection?.effectiveType ?? "unknown";

    const report = (metric: { name: string; value: number; id?: string }) => {
      const body = JSON.stringify({
        ...metric,
        device,
        url: location.pathname,
        ts: Date.now(),
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/vitals", body);
        } else {
          fetch("/api/vitals", {
            method: "POST",
            body,
            keepalive: true,
            headers: { "Content-Type": "application/json" },
          }).catch(() => {
            /* no-op: vitals are best-effort telemetry */
          });
        }
      } catch {
        /* swallow: telemetry must never break UX */
      }
    };

    const observers: PerformanceObserver[] = [];

    const observe = (type: string, handler: (entry: PerformanceEntry) => void) => {
      try {
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) handler(entry);
        });
        po.observe({ type, buffered: true } as PerformanceObserverInit);
        observers.push(po);
      } catch {
        /* unsupported entry type in this browser */
      }
    };

    observe("largest-contentful-paint", (entry) => {
      report({ name: "LCP", value: entry.startTime });
    });

    observe("paint", (entry) => {
      if (entry.name === "first-contentful-paint") {
        report({ name: "FCP", value: entry.startTime });
      }
    });

    let clsValue = 0;
    observe("layout-shift", (entry) => {
      const layoutShift = entry as PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      };
      if (!layoutShift.hadRecentInput) {
        clsValue += layoutShift.value;
        report({ name: "CLS", value: clsValue });
      }
    });

    observe("event", (entry) => {
      const eventEntry = entry as PerformanceEntry & {
        interactionId?: number;
        duration: number;
      };
      if (eventEntry.interactionId) {
        report({ name: "INP", value: eventEntry.duration });
      }
    });

    const navEntries = performance.getEntriesByType("navigation");
    const nav = navEntries[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      report({ name: "TTFB", value: nav.responseStart });
    }

    return () => {
      for (const po of observers) po.disconnect();
    };
  }, []);

  return null;
}
