/** @fileoverview Tests for the Dialectical Studio page. */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import DialecticalPage from '../app/dialectical/page';

describe('DialecticalPage', () => {
  it('renders without crashing', () => {
    expect(() => render(<DialecticalPage />)).not.toThrow();
  });

  it('renders a level-1 heading', () => {
    render(<DialecticalPage />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toMatch(/Dialectical Studio/i);
  });

  it('renders the stage badge', () => {
    render(<DialecticalPage />);
    expect(screen.getByText(/Adapter Protocol v2.1 · Triad stage 3/i)).toBeInTheDocument();
  });

  it('renders a back link to the overview', () => {
    render(<DialecticalPage />);
    const link = screen.getByRole('link', { name: /Back to overview/i });
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders the how-it-works section with four ordered steps', () => {
    render(<DialecticalPage />);
    const section = screen.getByRole('region', { name: /How the loop works/i });
    expect(section).toBeInTheDocument();
    const list = section.querySelector('ol');
    expect(list).toBeInTheDocument();
    expect(list?.children.length).toBe(4);
  });

  it('references NovaNeoEncoder in the explanation', () => {
    render(<DialecticalPage />);
    expect(screen.getByText(/NovaNeoEncoder/i)).toBeInTheDocument();
  });

  it('references Stigmergy v5 in the explanation', () => {
    render(<DialecticalPage />);
    expect(screen.getByText(/Stigmergy v5/i)).toBeInTheDocument();
  });

  it('references provenance JSON in the explanation', () => {
    render(<DialecticalPage />);
    expect(screen.getAllByText(/Copy provenance JSON/i).length).toBeGreaterThanOrEqual(1);
  });

  it('has a main content area with correct id', () => {
    render(<DialecticalPage />);
    expect(document.querySelector('main#main-content')).toBeInTheDocument();
  });
});
