import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DesktopShell } from '@/app/desktop/DesktopShell';

describe('MCOP Desktop product shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/desktop');
    delete window.__TAURI__;
  });

  it('opens with the offline-first onboarding instead of a terminal surface', async () => {
    render(<DesktopShell />);

    expect(await screen.findByRole('heading', { name: 'Your local field is ready.' })).toBeInTheDocument();
    expect(screen.getByText(/No system Node, pnpm, Python, or terminal required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run offline triad demo/i })).toBeInTheDocument();
  });

  it('promotes Dialectical Studio as the offline workspace', async () => {
    render(<DesktopShell />);
    fireEvent.click(await screen.findByRole('button', { name: /Run offline triad demo/i }));

    await waitFor(() => {
      expect(screen.getByTitle('Dialectical Studio')).toHaveAttribute('src', '/dialectical');
    });
    expect(window.localStorage.getItem('mcop.desktop.onboarding.v1')).toBe('complete');
  });

  it('keeps the cinematic surfaces one click away', async () => {
    window.localStorage.setItem('mcop.desktop.onboarding.v1', 'complete');
    render(<DesktopShell />);

    fireEvent.click(screen.getByRole('button', { name: 'Showcase' }));
    await waitFor(() => {
      expect(screen.getByTitle('Showcase')).toHaveAttribute('src', '/showcase/index.html');
    });
  });
});
