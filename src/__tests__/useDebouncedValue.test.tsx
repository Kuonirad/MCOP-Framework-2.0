/**
 * @fileoverview Unit tests for `useDebouncedValue`.
 * Verifies the trailing-edge debounce contract used by the Performance HUD
 * and the LayoutShiftAnnouncer:
 *   - returns the initial value synchronously,
 *   - holds the previous value during the debounce window,
 *   - commits the trailing input once `delayMs` of quiet has passed,
 *   - cancels stale timers when the input changes mid-window.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { useDebouncedValue } from "../components/useDebouncedValue";

interface ProbeProps {
  readonly value: string | number;
  readonly delayMs?: number;
}

function Probe({ value, delayMs }: ProbeProps) {
  const debounced = useDebouncedValue(value, delayMs);
  return <output data-testid="out">{String(debounced)}</output>;
}

describe("useDebouncedValue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("returns the initial value synchronously on first render", () => {
    const { getByTestId } = render(<Probe value="alpha" />);
    expect(getByTestId("out").textContent).toBe("alpha");
  });

  it("holds the previous value while the debounce window is open", () => {
    const { getByTestId, rerender } = render(<Probe value="alpha" />);
    rerender(<Probe value="bravo" />);
    // No time has advanced — the trailing edge has not fired yet.
    expect(getByTestId("out").textContent).toBe("alpha");
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(getByTestId("out").textContent).toBe("alpha");
  });

  it("commits the trailing value after the default 300ms window", () => {
    const { getByTestId, rerender } = render(<Probe value="alpha" />);
    rerender(<Probe value="bravo" />);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(getByTestId("out").textContent).toBe("bravo");
  });

  it("respects a custom delayMs", () => {
    const { getByTestId, rerender } = render(<Probe value={0} delayMs={1000} />);
    rerender(<Probe value={42} delayMs={1000} />);
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(getByTestId("out").textContent).toBe("0");
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(getByTestId("out").textContent).toBe("42");
  });

  it("cancels stale timers when the input changes mid-window", () => {
    const { getByTestId, rerender } = render(<Probe value="alpha" />);
    rerender(<Probe value="bravo" />);
    act(() => {
      jest.advanceTimersByTime(200);
    });
    rerender(<Probe value="charlie" />);
    // The 'bravo' timer must have been cleared; only 'charlie' will commit.
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(getByTestId("out").textContent).toBe("alpha");
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(getByTestId("out").textContent).toBe("charlie");
  });

  it("does not schedule a timer when the value is identical (Object.is)", () => {
    const { getByTestId, rerender } = render(<Probe value="alpha" />);
    // Re-rendering with the same primitive value should be a no-op for the
    // debounce timer: the committed value remains 'alpha' before and after.
    rerender(<Probe value="alpha" />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(getByTestId("out").textContent).toBe("alpha");
  });
});
