/**
 * @fileoverview Unit tests for the `useTaskChunker` utility.
 * @description Verifies task chunking, cancellation, progress callbacks,
 * and graceful degradation to setTimeout when scheduler.yield is absent.
 *
 * NOTE (2026-05-01): The timing-sensitive tests (budget exhaustion and
 * abort mid-flight) mock `performance.now()` / `Date.now()` to eliminate
 * Node-version-specific timing flakes that previously caused CI failures
 * on Node 20.x (especially in jsdom environments with low timer resolution).
 */

import { renderHook } from "@testing-library/react";

import { useTaskChunker } from "../components/useTaskChunker";

describe("useTaskChunker", () => {
  /* ------------------------------------------------------------------ */
  /*  Timing mocks — stabilise budget-exhaustion and abort tests         */
  /* ------------------------------------------------------------------ */
  let perfNowSpy: jest.SpyInstance | undefined;
  let dateNowSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    // Mock performance.now() if available (jsdom may not provide it)
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      let t = 0;
      perfNowSpy = jest.spyOn(performance, "now").mockImplementation(() => {
        t += 2; // Advance 2 ms on each call — deterministic
        return t;
      });
    }
    // Fallback mock for Date.now() when performance.now is absent
    let d = 0;
    dateNowSpy = jest.spyOn(Date, "now").mockImplementation(() => {
      d += 2;
      return d;
    });
  });

  afterEach(() => {
    perfNowSpy?.mockRestore();
    dateNowSpy?.mockRestore();
  });

  /* ------------------------------------------------------------------ */

  it("processes all items and returns results in order", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const items = [1, 2, 3, 4, 5];
    const processed = await result.current(items, (item) => item * 2);
    expect(processed).toEqual([2, 4, 6, 8, 10]);
  });

  it("supports async processors", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const items = ["a", "b", "c"];
    const processed = await result.current(items, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return item.toUpperCase();
    });
    expect(processed).toEqual(["A", "B", "C"]);
  });

  it("calls onProgress as chunks complete", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const progress: number[] = [];
    const items = Array.from({ length: 50 }, (_, i) => i);
    await result.current(
      items,
      (item) => {
        // Simulate a tiny amount of work
        let sum = 0;
        for (let i = 0; i < 10; i++) sum += item;
        return sum;
      },
      {
        budgetMs: 5, // 5 ms budget with 2 ms per mock tick → 2 items per chunk
        onProgress: (p) => progress.push(p),
      },
    );
    expect(progress.length).toBeGreaterThan(1);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it("throws when the abort signal is triggered mid-flight", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const controller = new AbortController();
    const items = Array.from({ length: 100 }, (_, i) => i);

    // Abort at a deterministic index (after first few items)
    let callCount = 0;
    const promise = result.current(
      items,
      (item) => {
        callCount++;
        if (callCount === 3) controller.abort();
        return item;
      },
      { signal: controller.signal },
    );

    await expect(promise).rejects.toThrow("Chunked task aborted");
  });

  it("returns an empty array for empty input", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const processed = await result.current([], (item) => item);
    expect(processed).toEqual([]);
  });

  it("processes large arrays without hanging", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const items = Array.from({ length: 500 }, (_, i) => i);
    const processed = await result.current(items, (item) => item * 2, {
      budgetMs: 5,
    });
    expect(processed.length).toBe(500);
    expect(processed[499]).toBe(998);
  });

  it("honours pre-aborted signals immediately", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const controller = new AbortController();
    controller.abort();
    await expect(
      result.current([1, 2, 3], (item) => item, { signal: controller.signal }),
    ).rejects.toThrow("Chunked task aborted");
  });
});
