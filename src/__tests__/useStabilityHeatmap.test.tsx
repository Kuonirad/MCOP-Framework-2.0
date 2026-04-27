/**
 * @fileoverview Unit tests for the `useStabilityHeatmap` hook.
 * @description Verifies that the heatmap aggregates layout-shift samples
 * by selector, ranks offenders by accumulated value with deterministic
 * tie-breaking, drops aged-out samples, and skips unattributed shifts
 * (the engineering contract is "things you can fix").
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  __aggregateForTests,
  useStabilityHeatmap,
  type HeatmapEntry,
} from '../components/useStabilityHeatmap';
import {
  __emitShiftForTests,
  __resetVSIForTests,
  type VSIShiftSample,
} from '@/app/_components/vsiBus';

function shift(
  value: number,
  selector: string | null,
  opts?: { tagName?: string | null; heightPx?: number; startTime?: number },
): VSIShiftSample {
  return {
    value,
    startTime: opts?.startTime ?? performance.now(),
    ts: Date.now(),
    source: selector
      ? {
          tagName: opts?.tagName ?? null,
          selector,
          heightPx: opts?.heightPx ?? 100,
        }
      : null,
  };
}

function Probe({ topN }: { topN?: number }) {
  const heatmap = useStabilityHeatmap({ pollMs: 0, windowMs: 10_000, topN });
  return (
    <ul>
      {heatmap.map((e, i) => (
        <li
          key={e.selector}
          data-testid={`row-${i}`}
          data-selector={e.selector}
          data-value={e.value.toFixed(4)}
          data-count={e.count}
        >
          {e.selector}
        </li>
      ))}
    </ul>
  );
}

describe('useStabilityHeatmap', () => {
  afterEach(() => __resetVSIForTests());

  it('starts empty when no shifts have been observed', () => {
    render(<Probe />);
    expect(screen.queryByTestId('row-0')).not.toBeInTheDocument();
  });

  it('aggregates same-selector shifts into a single ranked entry', async () => {
    render(<Probe />);
    await act(async () => {
      __emitShiftForTests(shift(0.05, 'img.hero', { tagName: 'img' }));
      __emitShiftForTests(shift(0.07, 'img.hero', { tagName: 'img' }));
    });
    const row = await screen.findByTestId('row-0');
    expect(row.dataset.selector).toBe('img.hero');
    expect(parseFloat(row.dataset.value ?? '0')).toBeCloseTo(0.12, 4);
    expect(row.dataset.count).toBe('2');
  });

  it('ranks offenders by accumulated shift value, descending', async () => {
    render(<Probe />);
    await act(async () => {
      __emitShiftForTests(shift(0.02, 'div.banner'));
      __emitShiftForTests(shift(0.30, 'iframe.advert', { tagName: 'iframe' }));
      __emitShiftForTests(shift(0.05, 'div.banner'));
      __emitShiftForTests(shift(0.10, 'img.thumb', { tagName: 'img' }));
    });
    expect((await screen.findByTestId('row-0')).dataset.selector).toBe(
      'iframe.advert',
    );
    expect(screen.getByTestId('row-1').dataset.selector).toBe('img.thumb');
    expect(screen.getByTestId('row-2').dataset.selector).toBe('div.banner');
  });

  it('clamps the result to topN', async () => {
    render(<Probe topN={2} />);
    await act(async () => {
      __emitShiftForTests(shift(0.30, 'iframe.advert'));
      __emitShiftForTests(shift(0.10, 'img.thumb'));
      __emitShiftForTests(shift(0.05, 'div.banner'));
    });
    await screen.findByTestId('row-0');
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();
  });

  it('skips unattributed shifts because they are not actionable', async () => {
    render(<Probe />);
    await act(async () => {
      __emitShiftForTests(shift(0.40, null));
    });
    expect(screen.queryByTestId('row-0')).not.toBeInTheDocument();
  });

  it('does not retain shifts that aged out of the rolling window', async () => {
    render(<Probe />);
    const now = performance.now();
    // Old shift well outside windowMs (10s) — should never enter the
    // ranked output.  We follow it with a recent shift to force a
    // recompute and verify the pruning happened.
    await act(async () => {
      __emitShiftForTests(
        shift(0.40, 'iframe.old', {
          tagName: 'iframe',
          startTime: now - 60_000,
        }),
      );
      __emitShiftForTests(shift(0.05, 'img.recent', { tagName: 'img' }));
    });
    const row0 = await screen.findByTestId('row-0');
    expect(row0.dataset.selector).toBe('img.recent');
    expect(screen.queryByText('iframe.old')).not.toBeInTheDocument();
  });

  it('breaks ties with count then selector for deterministic ordering', () => {
    const ranked: ReadonlyArray<HeatmapEntry> = __aggregateForTests(
      [
        { selector: 'b', tagName: null, heightPx: 0, value: 0.1, startTime: 1 },
        { selector: 'a', tagName: null, heightPx: 0, value: 0.05, startTime: 2 },
        { selector: 'a', tagName: null, heightPx: 0, value: 0.05, startTime: 3 },
      ],
      3,
    );
    // 'a' wins on count tie-break (2 vs 1) once values match (both 0.10).
    expect(ranked[0].selector).toBe('a');
    expect(ranked[1].selector).toBe('b');
  });
});
