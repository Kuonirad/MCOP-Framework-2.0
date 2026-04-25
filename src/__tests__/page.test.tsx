/**
 * @fileoverview Unit tests for the MCOP Framework 2.0 landing page.
 * @description Validates the replacement of the Create Next App starter
 * with the MCOP Framework Visualizer: semantic structure, accessibility,
 * link hardening, and CSP-safe markup.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('MCOP Framework Visualizer (Home)', () => {
  it('renders without crashing', () => {
    expect(() => render(<Home />)).not.toThrow();
  });

  it('renders a visible level-1 heading for the framework', () => {
    render(<Home />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toMatch(/MCOP Framework/i);
  });

  it('renders a main content area and primary navigation', () => {
    render(<Home />);
    expect(document.querySelector('main#main-content')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  });

  it('renders all three kernel cards', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /NOVA-NEO Encoder/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Stigmergy v5/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Holographic Etch/i })).toBeInTheDocument();
  });

  it('renders an accessible triad visualization', () => {
    render(<Home />);
    expect(screen.getByRole('img', { name: /triad/i })).toBeInTheDocument();
  });

  it('all external links open in a new tab with noopener and noreferrer', () => {
    render(<Home />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('href');
      expect(link.getAttribute('rel') ?? '').toContain('noopener');
      expect(link.getAttribute('rel') ?? '').toContain('noreferrer');
    });
  });

  it('exposes an internal link to the health endpoint', () => {
    render(<Home />);
    const health = screen.getByRole('link', { name: /health endpoint/i });
    expect(health).toHaveAttribute('href', '/api/health');
  });

  it('does not inject any script tags into the main content area', () => {
    render(<Home />);
    const scripts = document.querySelector('main')?.querySelectorAll('script') ?? [];
    expect(scripts.length).toBe(0);
  });
});
