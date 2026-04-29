/**
 * @fileoverview Tests for the PerformanceBudgetBar component.
 * @description Verifies colour coding, width calculation, and zero
 * visible-layout contribution.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import PerformanceBudgetBar from "../components/PerformanceBudgetBar";

describe("PerformanceBudgetBar", () => {
  it("renders a green bar when value is within good threshold", () => {
    render(
      <PerformanceBudgetBar
        label="LCP"
        value={1800}
        goodThreshold={2500}
        poorThreshold={4000}
      />,
    );
    const bar = screen.getByTestId("budget-bar-LCP");
    expect(bar).toBeInTheDocument();
    expect(bar.querySelector(".bg-emerald-400")).toBeInTheDocument();
    expect(bar.textContent).toMatch(/45%/); // 1800/4000 ≈ 45%
  });

  it("renders an amber bar in the needs-improvement zone", () => {
    render(
      <PerformanceBudgetBar
        label="INP"
        value={300}
        goodThreshold={200}
        poorThreshold={500}
      />,
    );
    const bar = screen.getByTestId("budget-bar-INP");
    expect(bar.querySelector(".bg-amber-400")).toBeInTheDocument();
    expect(bar.textContent).toMatch(/60%/);
  });

  it("renders a red bar when value exceeds the poor threshold", () => {
    render(
      <PerformanceBudgetBar
        label="CLS"
        value={0.35}
        goodThreshold={0.1}
        poorThreshold={0.25}
      />,
    );
    const bar = screen.getByTestId("budget-bar-CLS");
    expect(bar.querySelector(".bg-rose-400")).toBeInTheDocument();
    expect(bar.textContent).toMatch(/100%/); // clamped at 100%
  });

  it("has aria-hidden so it does not duplicate screen-reader output", () => {
    render(
      <PerformanceBudgetBar
        label="LCP"
        value={1000}
        goodThreshold={2500}
        poorThreshold={4000}
      />,
    );
    expect(screen.getByTestId("budget-bar-LCP")).toHaveAttribute("aria-hidden", "true");
  });

  it("clamps the percentage display to 100%", () => {
    render(
      <PerformanceBudgetBar
        label="INP"
        value={800}
        goodThreshold={200}
        poorThreshold={500}
      />,
    );
    expect(screen.getByTestId("budget-bar-INP").textContent).toMatch(/100%/);
  });
});
