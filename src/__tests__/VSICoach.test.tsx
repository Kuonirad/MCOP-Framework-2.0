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

  it('renders the top-offenders list once attributed shifts arrive', async () => {
    render(<VSICoach open />);
    expect(screen.queryByTestId('vsi-offenders')).not.toBeInTheDocument();
    await act(async () => {
      emit(0.05, { tagName: 'img', selector: 'img.hero', heightPx: 400 });
      emit(0.07, { tagName: 'iframe', selector: 'iframe.advert', heightPx: 250 });
    });
    // The heatmap hook coalesces bursts with a 250ms trailing-edge poll,
    // so flush the timer to let the second-emission recompute land.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(screen.getByTestId('vsi-offenders')).toBeInTheDocument();
    const rows = screen.getAllByTestId('vsi-offender-row');
    // Highest accumulated shift first.
    expect(rows[0].dataset.selector).toBe('iframe.advert');
    expect(rows[1].dataset.selector).toBe('img.hero');
  });

  it('does not render the offenders list for unattributed shift storms', async () => {
    render(<VSICoach open />);
    await act(async () => {
      emit(0.5);
    });
    // VSI is poor, but no source → nothing to fix-rank.
    expect(screen.getByTestId('vsi-coach')).toHaveAttribute(
      'data-vsi-status',
      'poor',
    );
    expect(screen.queryByTestId('vsi-offenders')).not.toBeInTheDocument();
  });

  it('exposes a Copy diagnostics button that emits a structured JSON report', async () => {
    const writeText = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'img', selector: 'img.hero', heightPx: 400 });
    });
    // Allow the heatmap's trailing-edge recompute (250ms) to flush so
    // the diagnostics payload includes the offender row.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    const button = screen.getByTestId('vsi-copy-diagnostics');
    expect(button).toHaveAttribute(
      'aria-label',
      'Copy VSI diagnostics report to clipboard',
    );
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeText.mock.calls[0]?.[0] ?? '{}');
    expect(payload.schema).toBe('mcop.vsi.diagnostics/v1');
    expect(payload.vsi.status).toBe('good');
    expect(Array.isArray(payload.offenders)).toBe(true);
    expect(payload.offenders[0].selector).toBe('img.hero');
    expect(payload.offenders[0].count).toBe(1);
    expect(payload.suggestedFix.snippet).toMatch(/img\.hero/);
  });

  /* ── Branch coverage extensions ── */

  it('announces a predictive breach when trend is degrading and window is short', async () => {
    render(<VSICoach open />);
    // Emit multiple degrading shifts rapidly to trigger predictionMs <= 5000
    await act(async () => {
      emit(0.08, { tagName: 'div', selector: 'div.banner', heightPx: 200 });
      emit(0.08, { tagName: 'div', selector: 'div.banner', heightPx: 200 });
      emit(0.08, { tagName: 'div', selector: 'div.banner', heightPx: 200 });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    const announcer = screen.getByTestId('vsi-announcer');
    // Should contain the breach phrase mentioning predicted status
    expect(announcer.textContent).toMatch(/Predicted/);
  });

  it('uses the document.execCommand clipboard fallback when navigator.clipboard is unavailable', async () => {
    const execCommand = jest.fn(() => true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
      writable: true,
    });
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'div', selector: 'div.banner' });
    });
    const button = screen.getByTestId('vsi-copy-fix');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('swallows clipboard errors without crashing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn(() => Promise.reject(new Error('denied'))) },
    });
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'div', selector: 'div.banner' });
    });
    const button = screen.getByTestId('vsi-copy-fix');
    await act(async () => {
      fireEvent.click(button);
    });
    // If we reach here without throwing, the catch swallowed the error.
    expect(screen.getByTestId('vsi-coach')).toBeInTheDocument();
  });

  it('swallows diagnostics clipboard errors without crashing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn(() => Promise.reject(new Error('denied'))) },
    });
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'div', selector: 'div.banner' });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    const button = screen.getByTestId('vsi-copy-diagnostics');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByTestId('vsi-coach')).toBeInTheDocument();
  });

  it('applies and reverts a preview fix on the root-cause element', async () => {
    const el = document.createElement('div');
    el.className = 'banner';
    document.body.appendChild(el);

    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'div', selector: 'div.banner', heightPx: 120 });
    });

    const previewBtn = screen.getByTestId('vsi-preview-fix');
    await act(async () => {
      fireEvent.click(previewBtn);
    });
    expect(el.style.getPropertyValue('contain')).toBe('layout');
    expect(screen.getByTestId('vsi-preview-active')).toBeInTheDocument();

    const revertBtn = screen.getByTestId('vsi-revert-fix');
    await act(async () => {
      fireEvent.click(revertBtn);
    });
    expect(el.style.getPropertyValue('contain')).toBe('');

    document.body.removeChild(el);
  });

  it('auto-reverts preview when root-cause selector changes', async () => {
    const elA = document.createElement('div');
    elA.className = 'banner';
    document.body.appendChild(elA);

    render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'div', selector: 'div.banner', heightPx: 120 });
    });

    const previewBtn = screen.getByTestId('vsi-preview-fix');
    await act(async () => {
      fireEvent.click(previewBtn);
    });
    expect(elA.style.getPropertyValue('contain')).toBe('layout');

    // Change root cause
    const elB = document.createElement('img');
    elB.className = 'hero';
    document.body.appendChild(elB);
    await act(async () => {
      emit(0.06, { tagName: 'img', selector: 'img.hero', heightPx: 300 });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(elA.style.getPropertyValue('contain')).toBe('');

    document.body.removeChild(elA);
    document.body.removeChild(elB);
  });

  it('reverts preview on unmount', async () => {
    const el = document.createElement('div');
    el.className = 'banner';
    document.body.appendChild(el);

    const { unmount } = render(<VSICoach open />);
    await act(async () => {
      emit(0.05, { tagName: 'div', selector: 'div.banner', heightPx: 120 });
    });

    const previewBtn = screen.getByTestId('vsi-preview-fix');
    await act(async () => {
      fireEvent.click(previewBtn);
    });
    expect(el.style.getPropertyValue('contain')).toBe('layout');

    unmount();
    expect(el.style.getPropertyValue('contain')).toBe('');

    document.body.removeChild(el);
  });

  it('shows singular "shift" when count is 1', async () => {
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05);
    });
    expect(screen.getByText(/1 shift$/)).toBeInTheDocument();
  });

  it('shows plural "shifts" when count is >1', async () => {
    render(<VSICoach open />);
    await act(async () => {
      emit(0.05);
      emit(0.06);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    const headingArea = screen.getByRole('heading', { name: /visual stability/i }).parentElement;
    expect(headingArea?.textContent).toMatch(/2 shifts/);
  });

  it('renders an empty sparkline placeholder when no sparkline values exist', () => {
    render(<VSICoach open />);
    // In idle state the sparkline receives an empty array and renders a placeholder gradient
    expect(screen.getByTestId('vsi-coach').querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
