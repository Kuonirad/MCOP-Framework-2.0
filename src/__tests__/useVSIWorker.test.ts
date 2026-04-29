/**
 * @fileoverview Tests for useVSIWorker and fallbackCompute.
 */

import { renderHook } from "@testing-library/react";
import { fallbackCompute, useVSIWorker } from "../components/useVSIWorker";

const baseOpts = {
  windowMs: 10_000,
  recentMs: 2_000,
  pollMs: 250,
  sparklineCap: 32,
} as const;

describe("fallbackCompute", () => {
  it("returns idle when no samples", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.status).toBe("idle");
    expect(result.vsi).toBe(0);
    expect(result.shiftCount).toBe(0);
  });

  it("filters out samples older than windowMs", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.5, startTime: 1_000, source: null }, // too old (cutoff=10_000)
        { value: 0.2, startTime: 15_000, source: null }, // within window
      ],
      now: 20_000,
      opts: baseOpts,
    });
    expect(result.vsi).toBe(0.2);
    expect(result.shiftCount).toBe(1);
  });

  it("classifies as good when vsi ≤ 0.1", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [{ value: 0.05, startTime: 9_000, source: null }],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.status).toBe("good");
  });

  it("classifies as ni when 0.1 < vsi ≤ 0.25", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [{ value: 0.15, startTime: 9_000, source: null }],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.status).toBe("ni");
  });

  it("classifies as poor when vsi > 0.25", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [{ value: 0.4, startTime: 9_000, source: null }],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.status).toBe("poor");
  });

  it("computes degrading trend when recent shifts exist and older are zero", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.05, startTime: 9_500, source: null }, // recent
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.trend).toBe("degrading");
  });

  it("computes improving trend when older shifts exist and recent are zero", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.05, startTime: 7_000, source: null }, // older (> 2s ago)
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.trend).toBe("improving");
  });

  it("computes stable trend when both recent and older have shifts but rates are close", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.05, startTime: 9_500, source: null }, // recent
        { value: 0.18, startTime: 7_000, source: null }, // older (3s window, ~0.06/s)
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.trend).toBe("stable");
  });

  it("predicts ni when degrading and current vsi < 0.1", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.02, startTime: 9_500, source: null },
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.trend).toBe("degrading");
    expect(result.predictionTarget).toBe("ni");
    expect(result.predictionMs).not.toBeNull();
    expect(result.predictionMs! >= 0).toBe(true);
  });

  it("predicts poor when degrading and current vsi is between 0.1 and 0.25", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.15, startTime: 9_500, source: null },
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.trend).toBe("degrading");
    expect(result.predictionTarget).toBe("poor");
  });

  it("does not predict when ratePerMs is zero", () => {
    // A single sample in recent window but value is 0
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0, startTime: 9_500, source: null },
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.predictionMs).toBeNull();
    expect(result.predictionTarget).toBeNull();
  });

  it("caps sparkline when it exceeds sparklineCap", () => {
    const samples = Array.from({ length: 40 }, (_, i) => ({
      value: 0.01,
      startTime: 9_000 + i,
      source: null,
    }));
    const result = fallbackCompute({
      type: "compute",
      samples,
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.sparkline.length).toBe(32);
  });

  it("captures the last source as rootCause", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.01, startTime: 9_000, source: { tagName: "div", selector: "div.a", heightPx: 100 } },
        { value: 0.02, startTime: 9_500, source: { tagName: "img", selector: "img.b", heightPx: 200 } },
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.rootCause).toEqual({
      tagName: "img",
      selector: "img.b",
      heightPx: 200,
    });
  });

  it("keeps rootCause null when no samples have sources", () => {
    const result = fallbackCompute({
      type: "compute",
      samples: [
        { value: 0.05, startTime: 9_000, source: null },
      ],
      now: 10_000,
      opts: baseOpts,
    });
    expect(result.rootCause).toBeNull();
  });
});

describe("useVSIWorker hook", () => {
  it("falls back to main-thread compute when Worker is unavailable", async () => {
    const originalWorker = global.Worker;
    // @ts-expect-error — intentionally removing Worker for test
    global.Worker = undefined;

    const { result } = renderHook(() => useVSIWorker());
    const state = await result.current.compute({
      type: "compute",
      samples: [{ value: 0.05, startTime: 9_000, source: null }],
      now: 10_000,
      opts: baseOpts,
    });

    expect(state.status).toBe("good");

    global.Worker = originalWorker;
  });

  it("returns a promise from compute", () => {
    const { result } = renderHook(() => useVSIWorker());
    const promise = result.current.compute({
      type: "compute",
      samples: [],
      now: 10_000,
      opts: baseOpts,
    });
    expect(promise).toBeInstanceOf(Promise);
  });
});
