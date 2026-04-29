"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  subscribeVSI,
  type VSIShiftSample,
  type VSIShiftSource,
} from "@/app/_components/vsiBus";

/**
 * `useStabilityHeatmap` — derives a ranked, attribution-aware heatmap of
 * the page's worst layout-shift offenders inside a rolling time window.
 *
 * Where {@link useVSIPredictor} answers *"how unstable is the page right
 * now?"*, this hook answers the engineering follow-up: *"which elements
 * are responsible, and by how much?"*  The output is a stable, ranked
 * list of `(selector, accumulated-shift, count, last-known-height)`
 * entries the UI can render directly — top-N pre-filtered, no extra
 * sorting required by the consumer.
 *
 * Design properties matching the rest of the HUD's contracts:
 *
 *   - **Single bus subscription**: piggybacks on the shared `vsiBus`
 *     observer, adding zero new `PerformanceObserver` callbacks to the
 *     main thread.
 *   - **Bounded buffer**: only retains samples inside `windowMs`; older
 *     entries are dropped in O(n) on each recompute, capping memory at
 *     the rate of incoming shifts × window.
 *   - **INP-safe**: every `setState` commit goes through `useTransition`,
 *     so a layout-shift storm cannot starve user interaction.
 *   - **Coalesced**: bursts are merged into one trailing recompute via
 *     the same `pollMs` debounce strategy the predictor uses.
 *   - **SSR / jsdom-safe**: relies on `subscribeVSI`, which stays inert
 *     in environments without `PerformanceObserver`.  Tests can drive
 *     the hook through `__emitShiftForTests`.
 *   - **Attribution-only**: shifts without a source selector
 *     (`source === null`) are intentionally excluded — the heatmap's
 *     contract is "things you can fix", and an unattributed shift has
 *     no actionable target.
 */

export interface HeatmapEntry {
  /** Stable selector string that identifies the offending element. */
  readonly selector: string;
  /** Lower-case tag name when known (`img`, `iframe`, `div`, ...). */
  readonly tagName: string | null;
  /** Sum of layout-shift values attributed to this selector in window. */
  readonly value: number;
  /** Number of distinct shift entries that named this selector. */
  readonly count: number;
  /** Most recently observed bounding-box height for the element. */
  readonly heightPx: number;
}

export interface UseStabilityHeatmapOptions {
  /** Rolling aggregation window in ms.  Default 10000. */
  readonly windowMs?: number;
  /** Min ms between recomputes; coalesces bursts.  Default 250. */
  readonly pollMs?: number;
  /** Number of offenders the heatmap returns (highest cumulative first). */
  readonly topN?: number;
}

const DEFAULT_OPTS: Required<UseStabilityHeatmapOptions> = {
  windowMs: 10_000,
  pollMs: 250,
  topN: 3,
};

interface InternalShift {
  readonly selector: string;
  readonly tagName: string | null;
  readonly heightPx: number;
  readonly value: number;
  readonly startTime: number;
}

function aggregate(
  list: ReadonlyArray<InternalShift>,
  topN: number,
): ReadonlyArray<HeatmapEntry> {
  if (list.length === 0) return [];
  const buckets = new Map<
    string,
    { value: number; count: number; tagName: string | null; heightPx: number }
  >();
  for (const s of list) {
    const existing = buckets.get(s.selector);
    if (existing) {
      existing.value += s.value;
      existing.count += 1;
      // Tag name and height are inherited from the most-recent sighting,
      // since the same selector can resolve to an evolving DOM node.
      existing.tagName = s.tagName ?? existing.tagName;
      existing.heightPx = s.heightPx;
    } else {
      buckets.set(s.selector, {
        value: s.value,
        count: 1,
        tagName: s.tagName,
        heightPx: s.heightPx,
      });
    }
  }
  const ranked: HeatmapEntry[] = [];
  for (const [selector, b] of buckets) {
    ranked.push({
      selector,
      tagName: b.tagName,
      value: b.value,
      count: b.count,
      heightPx: b.heightPx,
    });
  }
  // Highest accumulated shift value first.  Ties broken by count then
  // selector to keep the output deterministic across recomputes.
  ranked.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    if (b.count !== a.count) return b.count - a.count;
    return a.selector.localeCompare(b.selector);
  });
  return ranked.slice(0, topN);
}

/**
 * @internal Exported for unit tests so the aggregation logic can be
 * exercised directly without going through the React/jsdom harness.
 */
export function __aggregateForTests(
  shifts: ReadonlyArray<{
    selector: string;
    tagName: string | null;
    heightPx: number;
    value: number;
    startTime: number;
  }>,
  topN: number,
): ReadonlyArray<HeatmapEntry> {
  return aggregate(shifts, topN);
}

export function useStabilityHeatmap(
  options: UseStabilityHeatmapOptions = {},
): ReadonlyArray<HeatmapEntry> {
  const opts: Required<UseStabilityHeatmapOptions> = {
    ...DEFAULT_OPTS,
    ...options,
  };
  const samplesRef = useRef<InternalShift[]>([]);
  const lastComputeRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [entries, setEntries] = useState<ReadonlyArray<HeatmapEntry>>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const recompute = () => {
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const cutoff = now - opts.windowMs;
      const list = samplesRef.current;
      // Drop aged-out entries in place — the buffer is sorted by arrival
      // order which (modulo replay on subscribe) is also start-time order.
      let dropIdx = 0;
      while (dropIdx < list.length && list[dropIdx].startTime < cutoff) {
        dropIdx += 1;
      }
      if (dropIdx > 0) list.splice(0, dropIdx);
      const ranked = aggregate(list, opts.topN);
      startTransition(() => setEntries(ranked));
    };

    const schedule = () => {
      const nowMs = Date.now();
      const elapsed = nowMs - lastComputeRef.current;
      if (elapsed >= opts.pollMs) {
        lastComputeRef.current = nowMs;
        recompute();
        return;
      }
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        lastComputeRef.current = Date.now();
        recompute();
      }, opts.pollMs - elapsed);
    };

    const ingest = (sample: VSIShiftSample) => {
      const source: VSIShiftSource | null = sample.source;
      // Only attributed shifts can be fixed → skip unattributed entries.
      if (!source || !source.selector) return;
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      // Proactively prune aged-out entries to cap memory during storms.
      const cutoff = now - opts.windowMs;
      const list = samplesRef.current;
      let dropIdx = 0;
      while (dropIdx < list.length && list[dropIdx].startTime < cutoff) dropIdx += 1;
      if (dropIdx > 0) list.splice(0, dropIdx);
      samplesRef.current.push({
        selector: source.selector,
        tagName: source.tagName,
        heightPx: source.heightPx,
        value: sample.value,
        startTime: sample.startTime,
      });
      schedule();
    };

    const unsubscribe = subscribeVSI(ingest);
    // Ensure the first render reflects whatever was already in the bus
    // cache (replay happened synchronously during `subscribeVSI`).
    recompute();

    return () => {
      unsubscribe();
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
    };
    // The options bag is intentionally read once per mount via opts; if
    // a consumer changes window/poll values, they remount the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return entries;
}
