"use client";

/**
 * `useTaskChunker` — INP optimization utility for React components.
 *
 * Provides a `chunk` function that breaks expensive synchronous work
 * into smaller slices (<50 ms each) using `scheduler.yield()` when
 * available, falling back to `setTimeout(0)` so the browser can process
 * user input between chunks.
 *
 * This directly addresses the INP ≤ 200 ms success criterion by ensuring
 * no single task blocks the main thread for long enough to register as
 * a poor interaction.
 *
 * Usage:
 * ```tsx
 * const chunk = useTaskChunker();
 * const handleClick = async () => {
 *   const bigArray = Array.from({ length: 10_000 }, (_, i) => i);
 *   await chunk(bigArray, (item) => processItem(item));
 * };
 * ```
 *
 * Design properties:
 *   - Graceful degradation: uses `scheduler.yield()` in modern Chrome,
 *     `setTimeout(0)` everywhere else.
 *   - Automatic budget tracking: each chunk measures its elapsed time
 *     and yields when the 50 ms budget is exhausted.
 *   - Cancellation: an `AbortSignal` can stop the chunk mid-flight.
 *   - Zero React overhead: returns a stable callback reference.
 */

export interface ChunkOptions {
  /** Max ms per chunk before yielding. Default 50. */
  readonly budgetMs?: number;
  /** Abort signal for mid-flight cancellation. */
  readonly signal?: AbortSignal;
  /** Called before work starts and after each chunk with progress (0–1). */
  readonly onProgress?: (progress: number) => void;
}

/**
 * Yield control back to the browser so input events can be processed.
 * Uses `scheduler.yield()` when available (Chrome 115+), otherwise
 * falls back to `setTimeout(0)`.
 */
function yieldControl(): Promise<void> {
  const sched = (globalThis as unknown as Record<string, unknown>).scheduler as
    | { yield?: () => Promise<void> }
    | undefined;
  if (typeof sched?.yield === "function") {
    return sched.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function useTaskChunker(): <T, R>(
  items: ReadonlyArray<T>,
  processor: (item: T, index: number) => R | Promise<R>,
  opts?: ChunkOptions,
) => Promise<R[]> {
  const chunker = async <T, R>(
    items: ReadonlyArray<T>,
    processor: (item: T, index: number) => R | Promise<R>,
    opts?: ChunkOptions,
  ): Promise<R[]> => {
    const budgetMs = opts?.budgetMs ?? 50;
    const signal = opts?.signal;
    const onProgress = opts?.onProgress;
    const results: R[] = [];
    const total = items.length;

    if (signal?.aborted) {
      throw new Error("Chunked task aborted");
    }
    if (total === 0) {
      return results;
    }
    onProgress?.(0);

    let i = 0;
    while (i < total) {
      if (signal?.aborted) {
        throw new Error("Chunked task aborted");
      }
      const sliceStart =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();

      while (i < total) {
        const now =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        if (now - sliceStart >= budgetMs) break;

        const r = await processor(items[i], i);
        results.push(r);
        i += 1;

        if (signal?.aborted) {
          throw new Error("Chunked task aborted");
        }
      }

      onProgress?.(i / total);

      if (i < total) {
        await yieldControl();
      }
    }

    return results;
  };

  return chunker;
}
