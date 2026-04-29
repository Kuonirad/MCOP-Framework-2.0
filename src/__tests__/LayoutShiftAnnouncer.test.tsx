/**
 * @fileoverview Tests for the global LayoutShiftAnnouncer.
 * Validates the WCAG 4.1.3 contract:
 *   - the announcer is always mounted and screen-reader-only,
 *   - it only voices when the VSI status crosses a tier threshold,
 *   - it debounces trailing-edge announcements (300ms default),
 *   - it expands the debounce + filters non-poor transitions when the
 *     user prefers reduced motion.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import LayoutShiftAnnouncer from "../components/LayoutShiftAnnouncer";
import {
  __emitShiftForTests,
  __resetVSIForTests,
} from "@/app/_components/vsiBus";

function emitShift(value: number) {
  __emitShiftForTests({
    value,
    startTime: performance.now(),
    ts: Date.now(),
    source: null,
  });
}

describe("LayoutShiftAnnouncer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    __resetVSIForTests();
  });

  it("renders an always-mounted, screen-reader-only polite live region", () => {
    render(<LayoutShiftAnnouncer />);
    const region = screen.getByTestId("layout-shift-announcer");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region.className).toContain("sr-only");
  });

  it("starts silent when the predictor is idle", () => {
    render(<LayoutShiftAnnouncer />);
    const region = screen.getByTestId("layout-shift-announcer");
    expect(region.textContent).toBe("");
    expect(region).toHaveAttribute("data-vsi-status", "idle");
  });

  it("announces a poor-tier transition after the 300ms trailing window", () => {
    render(<LayoutShiftAnnouncer />);

    act(() => {
      emitShift(0.4); // poor
      // The vsiBus poll cadence + transition needs a tick to settle.
      jest.advanceTimersByTime(50);
    });

    const region = screen.getByTestId("layout-shift-announcer");
    // Within the debounce window — the region is still silent.
    expect(region.textContent).toBe("");

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(region).toHaveAttribute("data-vsi-status", "poor");
    expect(region.textContent).toMatch(/unstable/i);
  });

  /* ── Branch coverage extensions ── */

  it("suppresses non-poor transitions when reduced motion is preferred", () => {
    // Mock matchMedia to return reduced-motion preference
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia;

    render(<LayoutShiftAnnouncer />);

    act(() => {
      emitShift(0.05); // good tier
      jest.advanceTimersByTime(50);
    });

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    const region = screen.getByTestId("layout-shift-announcer");
    // Reduced-motion users don't hear good-tier transitions.
    expect(region.textContent).toBe("");

    window.matchMedia = originalMatchMedia;
  });

  it("announces poor-tier transitions even with reduced motion", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia;

    render(<LayoutShiftAnnouncer />);

    act(() => {
      emitShift(0.4); // poor
      jest.advanceTimersByTime(50);
    });

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    const region = screen.getByTestId("layout-shift-announcer");
    expect(region.textContent).toMatch(/unstable/i);

    window.matchMedia = originalMatchMedia;
  });

  it("does not re-announce when status rank stays the same (burst suppression)", () => {
    render(<LayoutShiftAnnouncer />);

    // First poor transition
    act(() => {
      emitShift(0.4);
      jest.advanceTimersByTime(50);
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    const region = screen.getByTestId("layout-shift-announcer");
    expect(region.textContent).toMatch(/unstable/i);
    const firstText = region.textContent;

    // Emit another poor shift — same rank, should not trigger a new announcement
    act(() => {
      emitShift(0.35);
      jest.advanceTimersByTime(50);
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Text should remain the same (no re-announcement for same tier)
    expect(region.textContent).toBe(firstText);
  });

  it("does not escalate latched status when rank is equal", () => {
    render(<LayoutShiftAnnouncer />);

    // Drive to poor first
    act(() => {
      emitShift(0.4);
      jest.advanceTimersByTime(50);
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    const region = screen.getByTestId("layout-shift-announcer");
    expect(region).toHaveAttribute("data-vsi-status", "poor");

    // Emit a shift that keeps poor — same rank, same status
    act(() => {
      emitShift(0.5);
      jest.advanceTimersByTime(50);
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Status should still be poor, no re-transition
    expect(region).toHaveAttribute("data-vsi-status", "poor");
  });
});
