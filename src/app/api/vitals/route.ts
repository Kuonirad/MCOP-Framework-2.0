import { NextRequest, NextResponse } from "next/server";
import logger from "@/utils/logger";

/**
 * Core Web Vitals ingestion endpoint. Values are redacted-safe; payloads are
 * structured-logged so downstream pipelines (Loki/Datadog/etc.) can segment
 * by metric name, device class, and URL. Returns 204 No Content so beacons
 * are cheap.
 */
const ALLOWED_METRICS = new Set(["LCP", "FCP", "CLS", "INP", "TTFB"]);
const MAX_BODY_BYTES = 2048;

interface VitalsPayload {
  name?: unknown;
  value?: unknown;
  device?: unknown;
  url?: unknown;
  ts?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
    const payload = JSON.parse(text) as VitalsPayload;
    const name = typeof payload.name === "string" ? payload.name : "";
    if (!ALLOWED_METRICS.has(name)) {
      return new NextResponse(null, { status: 400 });
    }
    const value = typeof payload.value === "number" ? payload.value : NaN;
    if (!Number.isFinite(value)) {
      return new NextResponse(null, { status: 400 });
    }
    logger.info({
      msg: "web-vital",
      metric: name,
      value,
      device: typeof payload.device === "string" ? payload.device : "unknown",
      url: typeof payload.url === "string" ? payload.url.slice(0, 200) : "",
      ts: typeof payload.ts === "number" ? payload.ts : Date.now(),
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
