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
      <div data-testid="smoothed">{(state.smoothedVsi ?? 0).toFixed(4)}</div>
      <div data-testid="slope">{String(state.slopePerSec ?? 0)}</div>
      <div data-testid="pattern">{state.pattern ?? 'unknown'}</div>
      <div data-testid="coaching">{state.coachingAction ?? ''}</div>
      <div data-testid="confidence">{String(state.confidence ?? 0)}</div>
      <div data-testid="horizons-len">{String((state.horizons ?? []).length)}</div>
      <div data-testid="horizon-0">
        {String(state.horizons?.[0]?.horizonMs ?? 0)}
      </div>
      <div data-testid="horizon-2">
        {String(state.horizons?.[2]?.horizonMs ?? 0)}
      </div>
      <div data-testid="prob-2">
        {String(state.horizons?.[2]?.probPoor ?? 0)}
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

  it('exposes a Kalman-smoothed VSI distinct from the raw vsi', async () => {
    render(<Probe />);
    const t = performance.now();
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.1, startTime: t }));
    });
    const raw = parseFloat(screen.getByTestId('vsi').textContent ?? '0');
    const smoothed = parseFloat(screen.getByTestId('smoothed').textContent ?? '0');
    expect(raw).toBeCloseTo(0.1, 3);
    // Kalman with Q=0.001, R=0.1 gives K ≈ 0.0091 on first step → ~0.0009.
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(raw);
  });

  it('classifies an img-without-dimensions root cause as img-no-dim and emits a fix string', async () => {
    render(<Probe />);
    const t = performance.now();
    await act(async () => {
      __emitShiftForTests(
        shift({
          value: 0.05,
          startTime: t,
          source: { tagName: 'img', selector: 'img.hero', heightPx: 0 },
        }),
      );
    });
    expect(screen.getByTestId('pattern').textContent).toBe('img-no-dim');
    expect(screen.getByTestId('coaching').textContent).toMatch(/width\/height/i);
    expect(screen.getByTestId('coaching').textContent).toMatch(/img\.hero/);
  });

  it('falls back to the unknown pattern with a stable coaching message when idle', () => {
    render(<Probe />);
    expect(screen.getByTestId('pattern').textContent).toBe('unknown');
    expect(screen.getByTestId('coaching').textContent).toMatch(/stable/i);
  });

  it('returns three monotonically-increasing prediction horizons (5s, 15s, 30s)', () => {
    render(<Probe />);
    expect(screen.getByTestId('horizons-len').textContent).toBe('3');
    expect(screen.getByTestId('horizon-0').textContent).toBe('5000');
    expect(screen.getByTestId('horizon-2').textContent).toBe('30000');
  });

  it('reports a confidence score within [0, 1] that grows with sample count', async () => {
    render(<Probe />);
    const c0 = parseFloat(screen.getByTestId('confidence').textContent ?? '0');
    expect(c0).toBeGreaterThanOrEqual(0);
    expect(c0).toBeLessThanOrEqual(1);
    const t = performance.now();
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        __emitShiftForTests(shift({ value: 0.001, startTime: t + i }));
      }
    });
    const c1 = parseFloat(screen.getByTestId('confidence').textContent ?? '0');
    expect(c1).toBeGreaterThan(c0);
    expect(c1).toBeLessThanOrEqual(0.95);
  });

  it('escalates the 30s horizon probPoor when VSI is already in the ni band', async () => {
    render(<Probe />);
    const t = performance.now();
    await act(async () => {
      __emitShiftForTests(shift({ value: 0.08, startTime: t - 200 }));
      __emitShiftForTests(shift({ value: 0.08, startTime: t - 100 }));
    });
    const prob30s = parseFloat(screen.getByTestId('prob-2').textContent ?? '0');
    expect(prob30s).toBeGreaterThan(0);
    expect(prob30s).toBeLessThanOrEqual(1);
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
