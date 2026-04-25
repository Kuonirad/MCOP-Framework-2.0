/**
 * @fileoverview Tests for the VSI Coach panel embedded in the HUD.
 * @description Verifies the coach renders the predicted state, surfaces
 * a contextual fix, exposes a working clipboard action, and announces
 * status transitions through a polite live region.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import VSICoach from '../components/VSICoach';
import { __emitShiftForTests, __resetVSIForTests } from '@/app/_components/vsiBus';

function emit(value: number, opts?: { tagName?: string | null; selector?: string | null; heightPx?: number }) {
  __emitShiftForTests({
    value,
    startTime: performance.now(),
    ts: Date.now(),
    source:
      opts?.selector || opts?.tagName
        ? {
            tagName: opts?.tagName ?? null,
            selector: opts?.selector ?? null,
            heightPx: opts?.heightPx ?? 100,
          }
        : null,
  });
}

describe('VSICoach', () => {
  afterEach(() => {
    __resetVSIForTests();
  });

  it('renders the heading and an idle status by default', () => {
    render(<VSICoach open />);
    expect(screen.getByRole('heading', { name: /visual stability/i })).toBeInTheDocument();
    const region = screen.getByTestId('vsi-coach');
    expect(region).toHaveAttribute('data-vsi-status', 'idle');
  });

  it('updates status data-attribute as shifts arrive', async () => {
    render(<VSICoach open />);
    await act(async () => {
      emit(0.4); // poor
    });
    expect(screen.getByTestId('vsi-coach')).toHaveAttribute('data-vsi-status', 'poor');
  });

  it('does not render the fix block when there are no shifts', () => {
    render(<VSICoach open />);
    expect(screen.queryByTestId('vsi-copy-fix')).not.toBeInTheDocument();
  });

  it('renders a tailored img fix when the largest source is an image', async () => {
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'img', selector: 'img.hero', heightPx: 400 });
    });
    const fix = screen.getByLabelText(/suggested css fix/i);
    expect(fix.textContent).toMatch(/img\.hero/);
    expect(fix.textContent).toMatch(/aspect-ratio/);
  });

  it('falls back to a generic containment hint when no source is known', async () => {
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05);
    });
    const fix = screen.getByLabelText(/suggested css fix/i);
    expect(fix.textContent).toMatch(/Reserve space|contain: layout/);
  });

  it('copies the fix snippet to the clipboard via navigator.clipboard', async () => {
    const writeText = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'div', selector: 'div.banner' });
    });
    const button = screen.getByTestId('vsi-copy-fix');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const call = writeText.mock.calls[0];
    expect(call?.[0]).toMatch(/div\.banner/);
  });

  it('exposes a polite live region announcer that is empty when idle', () => {
    render(<VSICoach open />);
    const announcer = screen.getByTestId('vsi-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer.textContent).toBe('');
  });

  it('does not announce status transitions while the panel is closed', async () => {
    render(<VSICoach open={false} />);
    await act(async () => {
      emit(0.4);
    });
    const announcer = screen.getByTestId('vsi-announcer');
    expect(announcer.textContent).toBe('');
  });
});
