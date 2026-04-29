/**
 * @fileoverview Unit tests for the flagship `usePerformanceCoach` hook.
 * @description Verifies the unified performance intelligence surface:
 *   - aggregates vitals and VSI into a single coherent state,
 *   - classifies metrics correctly against thresholds,
 *   - generates actionable coaching messages,
 *   - detects INP spikes and LCP regressions,
 *   - computes overall status and worst-metric attribution.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  classifyMetric,
  usePerformanceCoach,
} from "../components/usePerformanceCoach";
import {
  __emitForTests as __emitVitals,
  __resetForTests as __resetVitals,
} from "@/app/_components/vitalsBus";
import {
  __emitShiftForTests as __emitShift,
  __resetVSIForTests as __resetVSI,
} from "@/app/_components/vsiBus";

function emitVital(name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB", value: number) {
  __emitVitals({ name, value, ts: Date.now() });
}

function emitShift(value: number) {
  __emitShift({
    value,
    startTime: performance.now(),
    ts: Date.now(),
    source: null,
  });
}

function Probe() {
  const state = usePerformanceCoach();
  return (
    <div>
      <div data-testid="lcp-status">{state.lcp.status}</div>
      <div data-testid="lcp-value">{state.lcp.lastValue}</div>
      <div data-testid="inp-status">{state.inp.status}</div>
      <div data-testid="inp-value">{state.inp.lastValue}</div>
      <div data-testid="inp-spike">{state.inp.spikeDetected ? "yes" : "no"}</div>
      <div data-testid="cls-status">{state.cls.status}</div>
      <div data-testid="vsi-status">{state.vsi.status}</div>
      <div data-testid="vsi-trend">{state.vsi.trend}</div>
      <div data-testid="overall">{state.overallStatus}</div>
      <div data-testid="worst">{state.worstMetric ?? "none"}</div>
      <div data-testid="all-good">{state.allGood ? "yes" : "no"}</div>
      <div data-testid="msg-count">{state.messages.length}</div>
      <ul>
        {state.messages.map((m, i) => (
          <li key={i} data-testid={`msg-${i}`}>
            {m.metric}: {m.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("classifyMetric", () => {
  it("classifies LCP correctly", () => {
    expect(classifyMetric("LCP", 2000)).toBe("good");
    expect(classifyMetric("LCP", 2500)).toBe("good");
    expect(classifyMetric("LCP", 3000)).toBe("ni");
    expect(classifyMetric("LCP", 4000)).toBe("ni");
    expect(classifyMetric("LCP", 4500)).toBe("poor");
  });

  it("classifies INP correctly", () => {
    expect(classifyMetric("INP", 150)).toBe("good");
    expect(classifyMetric("INP", 200)).toBe("good");
    expect(classifyMetric("INP", 300)).toBe("ni");
    expect(classifyMetric("INP", 500)).toBe("ni");
    expect(classifyMetric("INP", 600)).toBe("poor");
  });

  it("classifies CLS correctly", () => {
    expect(classifyMetric("CLS", 0.05)).toBe("good");
    expect(classifyMetric("CLS", 0.1)).toBe("good");
    expect(classifyMetric("CLS", 0.15)).toBe("ni");
    expect(classifyMetric("CLS", 0.25)).toBe("ni");
    expect(classifyMetric("CLS", 0.3)).toBe("poor");
  });
});

describe("usePerformanceCoach", () => {
  beforeEach(() => {
    __resetVitals();
    __resetVSI();
  });

  afterEach(() => {
    __resetVitals();
    __resetVSI();
  });

  it("starts in idle state with no metrics", () => {
    render(<Probe />);
    expect(screen.getByTestId("lcp-status").textContent).toBe("idle");
    expect(screen.getByTestId("inp-status").textContent).toBe("idle");
    expect(screen.getByTestId("cls-status").textContent).toBe("idle");
    expect(screen.getByTestId("vsi-status").textContent).toBe("idle");
    expect(screen.getByTestId("overall").textContent).toBe("idle");
    expect(screen.getByTestId("worst").textContent).toBe("none");
    expect(screen.getByTestId("all-good").textContent).toBe("no");
    expect(screen.getByTestId("msg-count").textContent).toBe("0");
  });

  it("updates LCP status and surfaces a recommendation", async () => {
    render(<Probe />);
    await act(async () => {
      emitVital("LCP", 4200);
    });
    expect(screen.getByTestId("lcp-status").textContent).toBe("poor");
    expect(screen.getByTestId("lcp-value").textContent).toBe("4200");
    expect(screen.getByTestId("msg-count").textContent).toBe("1");
    expect(screen.getByTestId("msg-0").textContent).toMatch(/LCP: LCP critically slow/);
  });

  it("detects an INP spike when crossing from good to ni", async () => {
    render(<Probe />);
    // First, establish a good INP baseline
    await act(async () => {
      emitVital("INP", 150);
    });
    expect(screen.getByTestId("inp-spike").textContent).toBe("no");

    // Then spike it
    await act(async () => {
      emitVital("INP", 350);
    });
    expect(screen.getByTestId("inp-status").textContent).toBe("ni");
    expect(screen.getByTestId("inp-spike").textContent).toBe("yes");
    expect(screen.getByTestId("msg-count").textContent).toBe("1");
    expect(screen.getByTestId("msg-0").textContent).toMatch(/INP: Interaction latency high/);
  });

  it("marks all-good when every metric is green", async () => {
    render(<Probe />);
    await act(async () => {
      emitVital("LCP", 2000);
      emitVital("INP", 150);
      emitVital("CLS", 0.05);
      emitVital("FCP", 1200);
      emitVital("TTFB", 500);
    });
    expect(screen.getByTestId("overall").textContent).toBe("good");
    expect(screen.getByTestId("all-good").textContent).toBe("yes");
    expect(screen.getByTestId("msg-count").textContent).toBe("0");
  });

  it("identifies the worst metric correctly", async () => {
    render(<Probe />);
    await act(async () => {
      emitVital("LCP", 2000); // good
      emitVital("INP", 600); // poor
      emitVital("CLS", 0.05); // good
    });
    expect(screen.getByTestId("worst").textContent).toBe("INP");
    expect(screen.getByTestId("overall").textContent).toBe("poor");
  });

  it("aggregates VSI shifts and generates stability coaching", async () => {
    render(<Probe />);
    await act(async () => {
      emitShift(0.3);
    });
    expect(screen.getByTestId("vsi-status").textContent).toBe("poor");
    expect(screen.getByTestId("vsi-trend").textContent).toBe("degrading");
    expect(screen.getByTestId("msg-count").textContent).toBe("1");
    expect(screen.getByTestId("msg-0").textContent).toMatch(/VSI: Visual stability critical/);
  });

  it("surfaces multiple coaching messages when multiple metrics degrade", async () => {
    render(<Probe />);
    await act(async () => {
      emitVital("LCP", 4500); // poor
      emitVital("INP", 600); // poor
      emitShift(0.35); // poor VSI
    });
    expect(screen.getByTestId("overall").textContent).toBe("poor");
    const msgs = screen.getAllByTestId(/msg-\d+/);
    expect(msgs.length).toBeGreaterThanOrEqual(3);
  });
});
