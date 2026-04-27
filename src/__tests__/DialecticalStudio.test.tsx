/**
 * @fileoverview Tests for the Visual Dialectical Studio.
 * @description Asserts that the Thesis/Antithesis/Synthesis panes
 * render the live signal triple and route human feedback (rewrite,
 * notes, veto) through the underlying DialecticalSynthesizer.
 */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';

import { DialecticalStudio } from '../app/dialectical/_components/DialecticalStudio';

function setTextarea(testId: string, value: string) {
  const el = screen.getByTestId(testId) as HTMLTextAreaElement | HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}

describe('DialecticalStudio', () => {
  it('renders the Thesis · Antithesis · Synthesis triad headers', () => {
    render(<DialecticalStudio />);
    expect(
      screen.getByRole('heading', { name: /thesis · antithesis · synthesis/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dialectical-thesis')).toBeInTheDocument();
    expect(screen.getByTestId('dialectical-antithesis')).toBeInTheDocument();
    expect(screen.getByTestId('dialectical-synthesis')).toBeInTheDocument();
  });

  it('emits a synthesis containing the trimmed thesis', async () => {
    render(<DialecticalStudio />);
    setTextarea('dialectical-thesis-input', '   render a sunlit aurora ');
    await waitFor(() =>
      expect(
        screen.getByTestId('dialectical-synthesis-output'),
      ).toHaveTextContent('render a sunlit aurora'),
    );
  });

  it('appends operator notes verbatim onto the synthesis', async () => {
    render(<DialecticalStudio />);
    setTextarea('dialectical-thesis-input', 'compose a hero shot');
    setTextarea('dialectical-notes-input', 'keep brand pastel');
    await waitFor(() =>
      expect(
        screen.getByTestId('dialectical-synthesis-output'),
      ).toHaveTextContent(/\[operator-notes\] keep brand pastel/),
    );
  });

  it('replaces the thesis with the rewrite when the operator supplies one', async () => {
    render(<DialecticalStudio />);
    setTextarea('dialectical-thesis-input', 'compose a hero shot');
    setTextarea('dialectical-rewrite-input', 'instead: a quiet courtyard');
    await waitFor(() =>
      expect(
        screen.getByTestId('dialectical-synthesis-output'),
      ).toHaveTextContent('instead: a quiet courtyard'),
    );
    expect(
      screen.getByTestId('dialectical-synthesis-output'),
    ).not.toHaveTextContent('compose a hero shot');
  });

  it('shows the veto banner and disables synthesis copy when the operator vetoes', async () => {
    render(<DialecticalStudio />);
    setTextarea('dialectical-thesis-input', 'sensitive prompt');
    fireEvent.click(screen.getByTestId('dialectical-veto-toggle'));
    await waitFor(() =>
      expect(
        screen.getByTestId('dialectical-veto-banner'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId('dialectical-copy-synthesis')).toBeDisabled();
  });

  it('reports a non-zero entropy for non-trivial input', async () => {
    render(<DialecticalStudio />);
    setTextarea(
      'dialectical-thesis-input',
      'a longer, more diverse prompt with several distinct tokens',
    );
    await waitFor(() => {
      const entropyRow = screen.getByTestId('signal-entropy');
      const value = entropyRow.textContent ?? '';
      const match = value.match(/0\.\d{3}/);
      expect(match).not.toBeNull();
      const numeric = match ? parseFloat(match[0]) : 0;
      expect(numeric).toBeGreaterThan(0);
    });
  });

  it('etches a trace and increments the trace counter on commit', async () => {
    render(<DialecticalStudio />);
    setTextarea('dialectical-thesis-input', 'a unique prompt');
    const status = screen.getByTestId('dialectical-copy-state');
    expect(status).toHaveTextContent(/0 traces etched\./);
    await act(async () => {
      fireEvent.click(screen.getByTestId('dialectical-commit'));
    });
    await waitFor(() =>
      expect(status).toHaveTextContent(/1 trace etched\./),
    );
  });

  it('seeds the resonance store from seedPrompts so resonance can fire on repeats', async () => {
    render(<DialecticalStudio seedPrompts={['exact match prompt']} />);
    setTextarea('dialectical-thesis-input', 'exact match prompt');
    await waitFor(() => {
      const resonance = screen.getByTestId('signal-resonance');
      const match = resonance.textContent?.match(/[01]\.\d{3}/);
      const numeric = match ? parseFloat(match[0]) : 0;
      // Resonance should be non-trivial for an exact replay.
      expect(numeric).toBeGreaterThan(0.5);
    });
  });

  it('exposes a working clipboard action for the synthesis', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<DialecticalStudio />);
    setTextarea('dialectical-thesis-input', 'copyable thesis');
    await waitFor(() =>
      expect(
        screen.getByTestId('dialectical-synthesis-output'),
      ).toHaveTextContent('copyable thesis'),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('dialectical-copy-synthesis'));
    });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('copyable thesis');
  });

  it('exports a versioned mcop.dialectical.studio/v1 provenance bundle', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<DialecticalStudio />);
    setTextarea('dialectical-thesis-input', 'provenance check');
    await waitFor(() =>
      expect(
        screen.getByTestId('dialectical-synthesis-output'),
      ).toHaveTextContent('provenance check'),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('dialectical-copy-provenance'));
    });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(payload.schema).toBe('mcop.dialectical.studio/v1');
    expect(payload.thesis).toBe('provenance check');
    expect(payload.synthesis).toContain('provenance check');
    expect(payload.signals).toHaveProperty('entropy');
    expect(payload.signals).toHaveProperty('resonance');
    expect(payload.signals.tensorHash).toMatch(/^[0-9a-f]+$/);
  });
});
