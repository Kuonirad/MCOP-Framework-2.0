/**
 * @fileoverview Tests for useReducedMotion hook.
 * @description Mirrors the CSS prefers-reduced-motion query via
 * useSyncExternalStore. Tests matchMedia integration, SSR safety, and
 * legacy Safari fallback.
 */

import React, { act } from "react";
import { render, screen } from "@testing-library/react";

import { useReducedMotion } from "../components/useReducedMotion";

function Probe() {
  const reduced = useReducedMotion();
  return <div data-testid="reduced">{reduced ? "true" : "false"}</div>;
}

describe("useReducedMotion", () => {
  let matchMediaMocks: Array<() => void> = [];

  afterEach(() => {
    matchMediaMocks.forEach((restore) => restore());
    matchMediaMocks = [];
  });

  function mockMatchMedia(initialMatches: boolean) {
    const original = window.matchMedia;
    let currentMatches = initialMatches;
    const listeners = new Set<() => void>();

    const mqList = {
      get matches() {
        return currentMatches;
      },
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: (_event: string, cb: () => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_event: string, cb: () => void) => {
        listeners.delete(cb);
      },
      dispatchEvent: () => true,
      onchange: null,
    };

    window.matchMedia = jest.fn((query: string) => {
      if (query === "(prefers-reduced-motion: reduce)") {
        return mqList as unknown as MediaQueryList;
      }
      return original(query);
    }) as unknown as typeof window.matchMedia;

    matchMediaMocks.push(() => {
      window.matchMedia = original;
    });

    return {
      setMatches: (v: boolean) => {
        currentMatches = v;
      },
      notify: () => {
        listeners.forEach((cb) => cb());
      },
    };
  }

  function mockLegacyMatchMedia(initialMatches: boolean) {
    const original = window.matchMedia;
    let currentMatches = initialMatches;
    const listeners = new Set<() => void>();

    const mqList = {
      get matches() {
        return currentMatches;
      },
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: undefined,
      removeEventListener: undefined,
      addListener: (cb: () => void) => listeners.add(cb),
      removeListener: (cb: () => void) => listeners.delete(cb),
      dispatchEvent: () => true,
      onchange: null,
    };

    window.matchMedia = jest.fn((query: string) => {
      if (query === "(prefers-reduced-motion: reduce)") {
        return mqList as unknown as MediaQueryList;
      }
      return original(query);
    }) as unknown as typeof window.matchMedia;

    matchMediaMocks.push(() => {
      window.matchMedia = original;
    });

    return {
      setMatches: (v: boolean) => {
        currentMatches = v;
      },
      notify: () => {
        listeners.forEach((cb) => cb());
      },
    };
  }

  it("returns false when the user prefers normal motion", () => {
    mockMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("false");
  });

  it("returns true when the user prefers reduced motion", () => {
    mockMatchMedia(true);
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("true");
  });

  it("reacts to matchMedia change events", () => {
    const { setMatches, notify } = mockMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("false");

    setMatches(true);
    act(() => notify());
    expect(screen.getByTestId("reduced").textContent).toBe("true");
  });

  it("falls back to legacy addListener / removeListener on older Safari", () => {
    const { setMatches, notify } = mockLegacyMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("false");

    setMatches(true);
    act(() => notify());
    expect(screen.getByTestId("reduced").textContent).toBe("true");
  });

  it("is SSR-safe (returns false without window)", () => {
    const originalWindow = global.window;
    // @ts-expect-error — simulating SSR by deleting window
    delete global.window;
    render(<Probe />);
    // In jsdom window is restored after the render, but the hook's
    // server snapshot should have returned false during SSR.
    expect(screen.getByTestId("reduced").textContent).toBe("false");
    global.window = originalWindow;
  });
});
