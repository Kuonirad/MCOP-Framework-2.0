/**
 * @fileoverview Targeted branch-coverage tests for the four files called
 * out as branch-coverage gaps in the post-#541 audit roadmap (Phase 2 ①):
 *
 *   - src/benchmarks/promptingModes.ts
 *   - src/components/usePerformanceCoach.ts
 *   - src/components/useVSIPredictor.ts
 *   - src/app/dialectical/_components/DialecticalStudio.tsx
 *
 * Each test addresses a specific uncovered branch identified via the
 * coverage-final.json report. Branches that are only reachable in real
 * browsers (e.g. `Worker` defined, `navigator.clipboard`, secure-context
 * `performance.now`) are tagged with `istanbul ignore next` in the
 * source rather than tested here, since jsdom can't reach them — those
 * justifications live alongside the code.
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { runPromptingBenchmark } from "../benchmarks/promptingModes";
import { useVSIPredictor } from "../components/useVSIPredictor";
import { usePerformanceCoach } from "../components/usePerformanceCoach";
import { DialecticalStudio } from "../app/dialectical/_components/DialecticalStudio";
import {
  __emitForTests as __emitVitals,
  __resetForTests as __resetVitals,
} from "@/app/_components/vitalsBus";
import {
  __emitShiftForTests,
  __resetVSIForTests,
  type VSIShiftSample,
} from "@/app/_components/vsiBus";

/* ------------------------------------------------------------------ */
/* promptingModes.ts                                                    */
/* ------------------------------------------------------------------ */

describe("runPromptingBenchmark — branch-gap coverage", () => {
  it("returns a well-formed report with empty summary rows when tasks is empty (avg([]) → 0)", async () => {
    const report = await runPromptingBenchmark({
      tasks: [],
      capturedAt: "2026-04-30T00:00:00.000Z",
    });
    // No tasks → no runs, but the summary still emits one row per mode
    // with all zero averages (exercises the `values.length === 0` early
    // return inside the private `avg` helper).
    expect(report.runs).toHaveLength(0);
    expect(report.summary).toHaveLength(3);
    for (const row of report.summary) {
      expect(row.tasks).toBe(0);
      expect(row.avgInputTokens).toBe(0);
      expect(row.avgOutputTokens).toBe(0);
      expect(row.avgTotalTokens).toBe(0);
      expect(row.avgGoalCoverage).toBe(0);
      expect(row.auditableRuns).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* useVSIPredictor.ts                                                   */
/* ------------------------------------------------------------------ */

function shift(partial: Partial<VSIShiftSample> & Pick<VSIShiftSample, "value">): VSIShiftSample {
  return {
    value: partial.value,
    startTime: partial.startTime ?? performance.now(),
    ts: partial.ts ?? Date.now(),
    source: partial.source ?? null,
  };
}

function VSIProbe({ pollMs = 0 }: { pollMs?: number }) {
  const state = useVSIPredictor({ pollMs, windowMs: 5_000, recentMs: 1_000 });
  return (
    <div>
      <div data-testid="vsi-count">{state.shiftCount}</div>
      <div data-testid="vsi-status">{state.status}</div>
    </div>
  );
}

describe("useVSIPredictor — branch-gap coverage", () => {
  afterEach(() => __resetVSIForTests());

  it("prunes aged-out samples once the window slides past them (dropIdx > 0)", async () => {
    render(<VSIProbe />);
    const now = performance.now();

    // Two ancient shifts that should drop on the next emission.
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.05, startTime: now - 30_000 }));
      __emitShiftForTests(shift({ value: 0.05, startTime: now - 20_000 }));
    });

    // After this fresh shift, the subscribe-side prune (line 169) and
    // the recompute-side prune (line 119) both run with dropIdx > 0.
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.05, startTime: now }));
    });

    // Only the fresh shift should remain inside the 5s window.
    expect(screen.getByTestId("vsi-count").textContent).toBe("1");
  });

  it("clears the pending recompute timer on unmount when one is in flight", async () => {
    const { unmount } = render(<VSIProbe pollMs={5_000} />);
    // Force a sample with a fresh startTime so `recompute` runs once
    // (consuming the pollMs window) and the next subscribed shift
    // hits the `else` branch in `schedule()`, scheduling a setTimeout.
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.01, startTime: performance.now() }));
    });
    // A second emission inside the same poll window queues a timer.
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.01, startTime: performance.now() }));
    });
    // Unmount with the timer still pending — exercises the cleanup
    // branch `if (pendingRef.current) clearTimeout(...)`. If the branch
    // were absent, jest would log "open handles" warnings.
    expect(() => unmount()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* usePerformanceCoach.ts                                               */
/* ------------------------------------------------------------------ */

function emitVital(name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB", value: number) {
  __emitVitals({ name, value, ts: Date.now() });
}

function emitShift(value: number, startTime?: number) {
  __emitShiftForTests({
    value,
    startTime: startTime ?? performance.now(),
    ts: Date.now(),
    source: null,
  });
}

function CoachProbe() {
  const state = usePerformanceCoach();
  return (
    <div>
      <div data-testid="lcp-status">{state.lcp.status}</div>
      <div data-testid="lcp-rec">{state.lcp.recommendation}</div>
      <div data-testid="cls-status">{state.cls.status}</div>
      <div data-testid="vsi-status">{state.vsi.status}</div>
      <div data-testid="vsi-trend">{state.vsi.trend}</div>
      <div data-testid="vsi-prediction-ms">
        {state.vsi.predictionMs ?? "null"}
      </div>
      <div data-testid="ttfb-status">{state.ttfb.status}</div>
      <div data-testid="fcp-status">{state.fcp.status}</div>
      <div data-testid="msg-count">{state.messages.length}</div>
      <ul>
        {state.messages.map((m, i) => (
          <li key={i} data-testid={`msg-${i}`}>
            {m.metric}: {m.title} | {m.body}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("usePerformanceCoach — branch-gap coverage", () => {
  beforeEach(() => {
    __resetVitals();
    __resetVSIForTests();
  });
  afterEach(() => {
    __resetVitals();
    __resetVSIForTests();
  });

  it("classifies LCP=3000 as `ni` and surfaces the warn-tier recommendation", async () => {
    render(<CoachProbe />);
    await act(async () => {
      emitVital("LCP", 3000);
    });
    expect(screen.getByTestId("lcp-status").textContent).toBe("ni");
    expect(screen.getByTestId("lcp-rec").textContent).toMatch(/preload/i);
    expect(screen.getByTestId("msg-0").textContent).toMatch(/LCP needs improvement/i);
  });

  it("classifies CLS=0.3 as `poor` and surfaces the critical-tier message", async () => {
    render(<CoachProbe />);
    await act(async () => {
      emitVital("CLS", 0.3);
    });
    expect(screen.getByTestId("cls-status").textContent).toBe("poor");
    expect(screen.getByTestId("msg-0").textContent).toMatch(/Layout extremely unstable/i);
  });

  it("classifies CLS=0.15 as `ni` and surfaces the warn-tier message", async () => {
    render(<CoachProbe />);
    await act(async () => {
      emitVital("CLS", 0.15);
    });
    expect(screen.getByTestId("cls-status").textContent).toBe("ni");
    expect(screen.getByTestId("msg-0").textContent).toMatch(/Layout shifting/i);
  });

  it("classifies TTFB=2000 as `poor` and emits a coaching message", async () => {
    render(<CoachProbe />);
    await act(async () => {
      emitVital("TTFB", 2000);
    });
    expect(screen.getByTestId("ttfb-status").textContent).toBe("poor");
    expect(screen.getByTestId("msg-0").textContent).toMatch(/Server response slow/i);
  });

  it("classifies FCP=4000 as `poor` (exercises the > poor threshold branch)", async () => {
    render(<CoachProbe />);
    await act(async () => {
      emitVital("FCP", 4000);
    });
    expect(screen.getByTestId("fcp-status").textContent).toBe("poor");
  });

  it("classifies FCP=2200 as `ni` (exercises the middle threshold branch)", async () => {
    render(<CoachProbe />);
    await act(async () => {
      emitVital("FCP", 2200);
    });
    expect(screen.getByTestId("fcp-status").textContent).toBe("ni");
  });

  it("reports VSI trend `improving` when only older shifts exist", async () => {
    render(<CoachProbe />);
    const now = performance.now();
    // Older slice has shifts; recent slice (last 1s) is empty.
    await act(async () => {
      emitShift(0.05, now - 4_000);
    });
    expect(screen.getByTestId("vsi-trend").textContent).toBe("improving");
  });

  it("emits the VSI degrading-warn message with finite predictionMs (predictionMs != null branch)", async () => {
    render(<CoachProbe />);
    const now = performance.now();
    // Build up VSI into the `ni` band (>0.1, ≤0.25) with a degrading
    // recent slice so predictionMs is non-null.
    await act(async () => {
      emitShift(0.02, now - 4_000);
    });
    await act(async () => {
      emitShift(0.06, now - 100);
      emitShift(0.06, now - 50);
    });
    expect(screen.getByTestId("vsi-status").textContent).toBe("ni");
    expect(screen.getByTestId("vsi-trend").textContent).toBe("degrading");
    const niMsg = screen
      .getAllByTestId(/^msg-\d+$/)
      .find((el) => el.textContent?.includes("VSI: Visual stability degrading"));
    expect(niMsg).toBeDefined();
    expect(niMsg!.textContent).toMatch(/Predicted poor in/);
  });
});

/* ------------------------------------------------------------------ */
/* DialecticalStudio.tsx                                                */
/* ------------------------------------------------------------------ */

describe("DialecticalStudio — branch-gap coverage", () => {
  it("returns the empty snapshot when the thesis is whitespace-only", async () => {
    render(<DialecticalStudio />);
    const input = screen.getByTestId("dialectical-thesis-input");
    fireEvent.change(input, { target: { value: "   \n\t  " } });

    // Whitespace-only thesis triggers `emptySnapshot` (line 188), which
    // means the "Awaiting a non-empty thesis" placeholder renders instead
    // of either a synthesis string or the veto banner.
    await waitFor(() => {
      expect(screen.getByText(/awaiting a non-empty thesis/i)).toBeInTheDocument();
    });
  });

  it("commit handler is a no-op when the tensor hash is the empty sentinel", async () => {
    render(<DialecticalStudio />);
    const input = screen.getByTestId("dialectical-thesis-input");
    fireEvent.change(input, { target: { value: "" } });

    // Initial committedTraceCount is 0; clicking commit on empty input
    // must NOT increment it (early return at line 250).
    await waitFor(() => {
      expect(screen.getByText(/awaiting a non-empty thesis/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("dialectical-commit"));
    expect(screen.getByTestId("dialectical-copy-state").textContent).toMatch(
      /^0 traces etched\.$/,
    );
  });

  it("copy-synthesis handler is a no-op when there is no synthesis (early return at line 263)", async () => {
    render(<DialecticalStudio />);
    const input = screen.getByTestId("dialectical-thesis-input");
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByText(/awaiting a non-empty thesis/i)).toBeInTheDocument();
    });

    // The Copy synthesis button is disabled in this state, but clicking
    // through (jsdom allows it on disabled buttons) still hits the
    // handler which short-circuits when `snapshot.synthesis === null`.
    const btn = screen.getByTestId("dialectical-copy-synthesis");
    fireEvent.click(btn);
    // Copy state should remain idle (no "Copied." or "Copy failed.").
    expect(screen.getByTestId("dialectical-copy-state").textContent).not.toMatch(
      /^Copied\.$/,
    );
    expect(screen.getByTestId("dialectical-copy-state").textContent).not.toMatch(
      /^Copy failed/,
    );
  });
});
