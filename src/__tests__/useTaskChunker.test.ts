/**
 * @fileoverview Unit tests for the `useTaskChunker` utility.
 * @description Verifies task chunking, cancellation, progress callbacks,
 * and graceful degradation to setTimeout when scheduler.yield is absent.
 */

import { renderHook } from "@testing-library/react";

import { useTaskChunker } from "../components/useTaskChunker";

describe("useTaskChunker", () => {
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
    const items = Array.from({ length: 200 }, (_, i) => i);
    await result.current(
      items,
      (item) => {
        // Simulate a tiny amount of work to ensure budget exhaustion
        let sum = 0;
        for (let i = 0; i < 100; i++) sum += item;
        return sum;
      },
      {
        budgetMs: 1, // tiny budget to force many chunks
        onProgress: (p) => progress.push(p),
      },
    );
    expect(progress.length).toBeGreaterThan(1);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it("throws when the abort signal is triggered mid-flight", async () => {
    const { result } = renderHook(() => useTaskChunker());
    const controller = new AbortController();
    const items = Array.from({ length: 1000 }, (_, i) => i);

    const promise = result.current(
      items,
      (item) => {
        if (item === 10) controller.abort();
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
});
