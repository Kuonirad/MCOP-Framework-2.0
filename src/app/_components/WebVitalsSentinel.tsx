"use client";

import { useEffect } from "react";
import { subscribeVitals, type VitalSample } from "./vitalsBus";

/**
 * Core Web Vitals Sentinel — real-user monitoring that streams LCP, CLS, INP,
 * FCP, and TTFB events to `/api/vitals` using `navigator.sendBeacon` so the
 * report survives page unload.  Subscribes to the shared `vitalsBus` so the
 * sentinel and the live HUD share a single `PerformanceObserver` set —
 * adding the HUD costs nothing on the observation path.
 */
export default function WebVitalsSentinel() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const device =
      (navigator as Navigator & { connection?: { effectiveType?: string } })
        .connection?.effectiveType ?? "unknown";

    const report = (sample: VitalSample) => {
      const body = JSON.stringify({
        name: sample.name,
        value: sample.value,
        device,
        url: location.pathname,
        ts: sample.ts,
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

    return subscribeVitals(report);
  }, []);

  return null;
}
