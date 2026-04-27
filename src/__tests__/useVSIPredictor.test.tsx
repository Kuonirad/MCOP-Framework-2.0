/**
 * @fileoverview Unit tests for the predictive VSI hook.
 * @description Drives the hook through the shared `vsiBus` (the same
 * path real layout-shift entries take in production).  Each test
 * exercises a specific dimension of the prediction state machine.
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { useVSIPredictor } from '../components/useVSIPredictor';
import {
  __emitShiftForTests,
  __resetVSIForTests,
  type VSIShiftSample,
} from '@/app/_components/vsiBus';

function shift(partial: Partial<VSIShiftSample> & Pick<VSIShiftSample, 'value'>): VSIShiftSample {
  return {
    value: partial.value,
    startTime: partial.startTime ?? performance.now(),
    ts: partial.ts ?? Date.now(),
    source: partial.source ?? null,
  };
}

function Probe() {
  const state = useVSIPredictor({ pollMs: 0, windowMs: 10_000, recentMs: 2_000 });
  return (
    <div>
      <div data-testid="vsi">{state.vsi.toFixed(3)}</div>
      <div data-testid="status">{state.status}</div>
      <div data-testid="trend">{state.trend}</div>
      <div data-testid="count">{state.shiftCount}</div>
      <div data-testid="root">{state.rootCause?.selector ?? 'none'}</div>
      <div data-testid="prediction">
        {state.predictionMs == null ? 'null' : String(state.predictionMs)}
      </div>
      <div data-testid="prediction-target">
        {state.predictionTarget ?? 'null'}
      </div>
    </div>
  );
}

describe('useVSIPredictor', () => {
  afterEach(() => __resetVSIForTests());

  it('starts in idle with no shifts', () => {
    render(<Probe />);
    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('accumulates VSI from emitted shifts and classifies as good', async () => {
    render(<Probe />);
    const t = performance.now();
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.04, startTime: t }));
    });
    expect(screen.getByTestId('status').textContent).toBe('good');
    expect(parseFloat(screen.getByTestId('vsi').textContent ?? '0')).toBeCloseTo(0.04, 3);
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('classifies large cumulative VSI as poor', async () => {
    render(<Probe />);
    const t = performance.now();
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.2, startTime: t }));
      __emitShiftForTests(shift({ value: 0.2, startTime: t }));
    });
    expect(screen.getByTestId('status').textContent).toBe('poor');
  });

  it('surfaces the most-recent largest source as rootCause', async () => {
    render(<Probe />);
    const t = performance.now();
    await act(async () => {
      __emitShiftForTests(
        shift({
          value: 0.05,
          startTime: t,
          source: { tagName: 'img', selector: 'img.hero', heightPx: 400 },
        }),
      );
    });
    expect(screen.getByTestId('root').textContent).toBe('img.hero');
  });

  it('detects a degrading trend and emits a finite prediction', async () => {
    render(<Probe />);
    const now = performance.now();
    // Older shifts (outside the 2s recent window): tiny.
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.005, startTime: now - 5_000 }));
    });
    // Recent shifts: a much higher rate.
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.04, startTime: now - 500 }));
      __emitShiftForTests(shift({ value: 0.04, startTime: now - 100 }));
    });
    expect(screen.getByTestId('trend').textContent).toBe('degrading');
    expect(screen.getByTestId('prediction').textContent).not.toBe('null');
    expect(parseInt(screen.getByTestId('prediction').textContent ?? '0', 10)).toBeGreaterThan(0);
  });

  it('reports stable trend and null prediction when window is empty', () => {
    render(<Probe />);
    expect(screen.getByTestId('trend').textContent).toBe('stable');
    expect(screen.getByTestId('prediction').textContent).toBe('null');
    expect(screen.getByTestId('prediction-target').textContent).toBe('null');
  });

  it('targets the next tier (ni) when degrading from good', async () => {
    render(<Probe />);
    const now = performance.now();
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.005, startTime: now - 5_000 }));
    });
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.04, startTime: now - 500 }));
      __emitShiftForTests(shift({ value: 0.04, startTime: now - 100 }));
    });
    expect(screen.getByTestId('status').textContent).toBe('good');
    expect(screen.getByTestId('prediction-target').textContent).toBe('ni');
    expect(screen.getByTestId('prediction').textContent).not.toBe('null');
  });

  it('targets the next tier (poor) when degrading from ni', async () => {
    // Build up vsi into the ni band (~0.15) with a degrading recent rate
    // so the predictor extrapolates toward the 0.25 poor threshold.
    render(<Probe />);
    const now = performance.now();
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.02, startTime: now - 5_000 }));
    });
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.07, startTime: now - 500 }));
      __emitShiftForTests(shift({ value: 0.07, startTime: now - 100 }));
    });
    expect(screen.getByTestId('status').textContent).toBe('ni');
    expect(screen.getByTestId('trend').textContent).toBe('degrading');
    expect(screen.getByTestId('prediction-target').textContent).toBe('poor');
    expect(parseInt(screen.getByTestId('prediction').textContent ?? '0', 10)).toBeGreaterThan(0);
  });

  it('returns null prediction target once the session is already poor', async () => {
    render(<Probe />);
    const now = performance.now();
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.2, startTime: now - 200 }));
      __emitShiftForTests(shift({ value: 0.2, startTime: now - 100 }));
    });
    expect(screen.getByTestId('status').textContent).toBe('poor');
    expect(screen.getByTestId('prediction-target').textContent).toBe('null');
    expect(screen.getByTestId('prediction').textContent).toBe('null');
  });
});
