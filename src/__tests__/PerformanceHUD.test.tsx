/**
 * @fileoverview Unit tests for the Live Performance HUD overlay.
 * @description Drives the HUD via the shared `vitalsBus` (the same path
 * real PerformanceObserver callbacks take in production) so the tests
 * run cleanly in jsdom without a real observer.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import PerformanceHUD from '../components/PerformanceHUD';
import { __emitForTests, __resetForTests } from '@/app/_components/vitalsBus';
import { __resetVSIForTests } from '@/app/_components/vsiBus';

// The HUD defers its initial mount to requestIdleCallback / setTimeout(0)
// so it cannot compete with first paint. In tests we short-circuit both
// so assertions can run synchronously after a microtask flush.
beforeAll(() => {
  (globalThis as unknown as {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback = (cb: () => void): number => {
    cb();
    return 1;
  };
  (globalThis as unknown as {
    cancelIdleCallback?: (id: number) => void;
  }).cancelIdleCallback = () => undefined;
});

afterEach(() => {
  __resetForTests();
  __resetVSIForTests();
});

describe('PerformanceHUD', () => {
  it('renders the toggle button once idle-mount has resolved', async () => {
    render(<PerformanceHUD />);
    const button = await screen.findByRole('button', { name: /show performance hud/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('panel is hidden by default and opens on toggle', async () => {
    render(<PerformanceHUD />);
    const button = await screen.findByRole('button', { name: /show performance hud/i });

    const panel = screen.getByTestId('performance-hud-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('data-open', 'false');

    act(() => {
      button.click();
    });

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panel).toHaveAttribute('data-open', 'true');
  });

  it('renders dashes for metrics with no samples yet', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });

    // Three metric rows × dash placeholder; aria-live="polite" marks them.
    const emDash = screen.getAllByText('—');
    expect(emDash.length).toBeGreaterThanOrEqual(3);
  });

  it('shows good/green status for in-budget LCP', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });

    act(() => {
      __emitForTests({ name: 'LCP', value: 1800, ts: 1 });
    });

    const lcpCell = await screen.findByLabelText(/LCP 1800 ms good/i);
    expect(lcpCell).toHaveTextContent('1800 ms');
  });

  it('shows needs-improvement status for borderline INP', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });

    act(() => {
      __emitForTests({ name: 'INP', value: 350, ts: 2 });
    });

    const inpCell = await screen.findByLabelText(/INP 350 ms ni/i);
    expect(inpCell).toHaveTextContent('350 ms');
  });

  it('shows poor/red status for a bad CLS score', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });

    act(() => {
      __emitForTests({ name: 'CLS', value: 0.4, ts: 3 });
    });

    const clsCell = await screen.findByLabelText(/CLS 0\.400 poor/i);
    expect(clsCell).toHaveTextContent('0.400');
  });

  it('updates the displayed value as new samples arrive', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });

    act(() => {
      __emitForTests({ name: 'LCP', value: 1000, ts: 10 });
    });
    expect(await screen.findByLabelText(/LCP 1000 ms good/i)).toHaveTextContent('1000 ms');

    act(() => {
      __emitForTests({ name: 'LCP', value: 4200, ts: 11 });
    });
    expect(await screen.findByLabelText(/LCP 4200 ms poor/i)).toHaveTextContent('4200 ms');
  });

  it('only observes one entry in the fixed positioning layer (zero-CLS guarantee)', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });

    const hud = screen.getByTestId('performance-hud');
    // HUD lives in a fixed overlay so it never contributes to document flow.
    expect(hud.className).toMatch(/\bfixed\b/);
    expect(hud.className).toMatch(/pointer-events-none/);
  });

  it('marks the closed panel inert so descendants are not tab-reachable', async () => {
    render(<PerformanceHUD />);
    await screen.findByRole('button', { name: /show performance hud/i });
    const panel = screen.getByTestId('performance-hud-panel');
    // React 19 reflects boolean inert as the empty-string attribute.
    expect(panel.hasAttribute('inert')).toBe(true);
  });

  it('clears inert when the panel opens', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });
    const panel = screen.getByTestId('performance-hud-panel');
    expect(panel.hasAttribute('inert')).toBe(false);
  });

  it('toggles open state on Alt+P from anywhere on the page', async () => {
    render(<PerformanceHUD />);
    const button = await screen.findByRole('button', { name: /show performance hud/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      fireEvent.keyDown(window, { key: 'p', altKey: true });
    });
    expect(button).toHaveAttribute('aria-expanded', 'true');

    act(() => {
      fireEvent.keyDown(window, { key: 'P', altKey: true });
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the panel on Escape when open', async () => {
    render(<PerformanceHUD defaultOpen />);
    const button = await screen.findByRole('button', { name: /hide performance hud/i });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes Alt+P as the shortcut hint via aria-keyshortcuts', async () => {
    render(<PerformanceHUD />);
    const button = await screen.findByRole('button', { name: /show performance hud/i });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Alt+P');
  });

  it('ignores plain P keypresses without Alt modifier', async () => {
    render(<PerformanceHUD />);
    const button = await screen.findByRole('button', { name: /show performance hud/i });
    act(() => {
      fireEvent.keyDown(window, { key: 'p' });
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('embeds the VSI coach inside the open panel', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });
    expect(screen.getByTestId('vsi-coach')).toBeInTheDocument();
  });

  it('renders the Test Mode badge with SSR by default in jsdom (no real PerformanceObserver)', async () => {
    render(<PerformanceHUD defaultOpen />);
    await screen.findByRole('region', { name: /live performance metrics/i });
    const badge = screen.getByTestId('performance-hud-test-mode');
    expect(badge).toHaveAttribute('data-mode', 'ssr');
    expect(badge).toHaveTextContent(/SSR/);
    expect(badge).toHaveAttribute('aria-label', expect.stringMatching(/SSR/));
  });

  it('renders the Test Mode badge as Live when forced via testModeOverride', async () => {
    render(<PerformanceHUD defaultOpen testModeOverride="live" />);
    await screen.findByRole('region', { name: /live performance metrics/i });
    const badge = screen.getByTestId('performance-hud-test-mode');
    expect(badge).toHaveAttribute('data-mode', 'live');
    expect(badge).toHaveTextContent(/Live/);
    expect(badge).toHaveAttribute('aria-label', expect.stringMatching(/Live/));
  });
});
