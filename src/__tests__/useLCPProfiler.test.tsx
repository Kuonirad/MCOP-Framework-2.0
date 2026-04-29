/**
 * @fileoverview Comprehensive unit tests for the `useLCPProfiler` hook.
 * @description Covers helper functions (classifyLCP, buildRecommendation),
 * PerformanceObserver callback paths, state transitions, and cleanup.
 */

import React, { act } from "react";
import { render, screen } from "@testing-library/react";

import {
  classifyLCP,
  buildRecommendation,
  useLCPProfiler,
} from "../components/useLCPProfiler";

function Probe() {
  const state = useLCPProfiler();
  return (
    <div>
      <div data-testid="status">{state.status}</div>
      <div data-testid="value">{state.value}</div>
      <div data-testid="rec">{state.recommendation}</div>
      <div data-testid="has-attribution">{state.attribution ? "yes" : "no"}</div>
      <div data-testid="tag">{state.attribution?.elementTag ?? "none"}</div>
    </div>
  );
}

function makeEntryList(entries: PerformanceEntry[]): PerformanceObserverEntryList {
  return {
    getEntries: () => entries,
    getEntriesByName: () => [],
    getEntriesByType: () => [],
  };
}

describe("classifyLCP", () => {
  it("classifies ≤ 2500 ms as good", () => {
    expect(classifyLCP(0)).toBe("good");
    expect(classifyLCP(1000)).toBe("good");
    expect(classifyLCP(2500)).toBe("good");
  });

  it("classifies 2500–4000 ms as ni", () => {
    expect(classifyLCP(2501)).toBe("ni");
    expect(classifyLCP(3000)).toBe("ni");
    expect(classifyLCP(4000)).toBe("ni");
  });

  it("classifies > 4000 ms as poor", () => {
    expect(classifyLCP(4001)).toBe("poor");
    expect(classifyLCP(8000)).toBe("poor");
  });
});

describe("buildRecommendation", () => {
  it("returns fallback when tag is null", () => {
    expect(buildRecommendation(null, null)).toMatch(
      /LCP element not yet identified/,
    );
  });

  it("returns img recommendation with url", () => {
    const rec = buildRecommendation("img", "https://example.com/hero.jpg");
    expect(rec).toMatch(/preload/);
    expect(rec).toMatch(/hero\.jpg/);
  });

  it("returns img recommendation without url", () => {
    const rec = buildRecommendation("img", null);
    expect(rec).toMatch(/fetchPriority/);
  });

  it("returns video recommendation", () => {
    const rec = buildRecommendation("video", null);
    expect(rec).toMatch(/poster image/);
  });

  it("returns text recommendation for h1", () => {
    const rec = buildRecommendation("h1", null);
    expect(rec).toMatch(/font-display/);
  });

  it("returns text recommendation for h2", () => {
    const rec = buildRecommendation("h2", null);
    expect(rec).toMatch(/font-display/);
  });

  it("returns text recommendation for p", () => {
    const rec = buildRecommendation("p", null);
    expect(rec).toMatch(/font-display/);
  });

  it("returns container recommendation for div", () => {
    const rec = buildRecommendation("div", null);
    expect(rec).toMatch(/skeleton placeholder/);
  });

  it("returns container recommendation for section", () => {
    const rec = buildRecommendation("section", null);
    expect(rec).toMatch(/skeleton placeholder/);
  });

  it("returns generic recommendation for unknown tags", () => {
    const rec = buildRecommendation("custom-element", null);
    expect(rec).toMatch(/custom-element/);
  });
});

describe("useLCPProfiler", () => {
  let ObserverCtor: typeof PerformanceObserver;
  let instances: Array<{
    callback: PerformanceObserverCallback;
    disconnect: jest.Mock;
    observe: jest.Mock;
  }>;

  beforeEach(() => {
    ObserverCtor = globalThis.PerformanceObserver;
    instances = [];

    globalThis.PerformanceObserver = jest.fn((cb: PerformanceObserverCallback) => {
      const inst = {
        callback: cb,
        disconnect: jest.fn(),
        observe: jest.fn(),
      };
      instances.push(inst);
      return inst as unknown as PerformanceObserver;
    }) as unknown as typeof PerformanceObserver;
  });

  afterEach(() => {
    globalThis.PerformanceObserver = ObserverCtor;
  });

  it("starts in idle state", () => {
    render(<Probe />);
    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByTestId("value").textContent).toBe("0");
    expect(screen.getByTestId("has-attribution").textContent).toBe("no");
  });

  it("transitions to good when PerformanceObserver fires with a low value", () => {
    render(<Probe />);
    expect(instances.length).toBe(1);

    const entry = {
      startTime: 1000,
      element: { tagName: "H1" } as Element,
      url: undefined,
      renderTime: 1000,
      loadTime: 1000,
      size: 42,
    };

    act(() => {
      instances[0].callback(makeEntryList([entry as unknown as PerformanceEntry]), instances[0] as unknown as PerformanceObserver);
    });

    expect(screen.getByTestId("status").textContent).toBe("good");
    expect(screen.getByTestId("value").textContent).toBe("1000");
    expect(screen.getByTestId("tag").textContent).toBe("h1");
    expect(screen.getByTestId("has-attribution").textContent).toBe("yes");
    expect(screen.getByTestId("rec").textContent).toMatch(/font-display/);
  });

  it("transitions to ni and poor at threshold boundaries", () => {
    render(<Probe />);

    act(() => {
      instances[0].callback(makeEntryList([{ startTime: 3000, element: { tagName: "DIV" } as Element } as unknown as PerformanceEntry]), instances[0] as unknown as PerformanceObserver);
    });
    expect(screen.getByTestId("status").textContent).toBe("ni");

    act(() => {
      instances[0].callback(makeEntryList([{ startTime: 4001, element: { tagName: "IMG" } as Element, url: "http://x" } as unknown as PerformanceEntry]), instances[0] as unknown as PerformanceObserver);
    });
    expect(screen.getByTestId("status").textContent).toBe("poor");
  });

  it("ignores entries that do not increase LCP value", () => {
    render(<Probe />);

    act(() => {
      instances[0].callback(makeEntryList([{ startTime: 2000, element: { tagName: "P" } as Element } as unknown as PerformanceEntry]), instances[0] as unknown as PerformanceObserver);
    });
    expect(screen.getByTestId("value").textContent).toBe("2000");

    act(() => {
      instances[0].callback(makeEntryList([{ startTime: 1500, element: { tagName: "H2" } as Element } as unknown as PerformanceEntry]), instances[0] as unknown as PerformanceObserver);
    });
    // Value should stay at 2000 because 1500 ≤ 2000
    expect(screen.getByTestId("value").textContent).toBe("2000");
    expect(screen.getByTestId("tag").textContent).toBe("p"); // still the old tag
  });

  it("handles img with url via observer", () => {
    render(<Probe />);

    act(() => {
      instances[0].callback(makeEntryList([{
        startTime: 1500,
        element: { tagName: "IMG" } as Element,
        url: "https://example.com/hero.png",
        renderTime: 1500,
        loadTime: 1600,
        size: 100,
      } as unknown as PerformanceEntry]), instances[0] as unknown as PerformanceObserver);
    });

    expect(screen.getByTestId("status").textContent).toBe("good");
    expect(screen.getByTestId("rec").textContent).toMatch(/hero\.png/);
  });

  it("handles empty entries array gracefully", () => {
    render(<Probe />);

    act(() => {
      instances[0].callback(makeEntryList([]), instances[0] as unknown as PerformanceObserver);
    });

    expect(screen.getByTestId("status").textContent).toBe("idle");
  });

  it("calls disconnect on unmount", () => {
    const { unmount } = render(<Probe />);
    expect(instances.length).toBe(1);
    expect(instances[0].observe).toHaveBeenCalledTimes(1);

    unmount();
    expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it("gracefully degrades when PerformanceObserver constructor throws", () => {
    globalThis.PerformanceObserver = jest.fn(() => {
      throw new Error("Not supported");
    }) as unknown as typeof PerformanceObserver;

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("status").textContent).toBe("idle");
  });

  it("gracefully degrades when PerformanceObserver is undefined", () => {
    // @ts-expect-error — simulating a browser without PerformanceObserver
    globalThis.PerformanceObserver = undefined;

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("status").textContent).toBe("idle");
  });
});
