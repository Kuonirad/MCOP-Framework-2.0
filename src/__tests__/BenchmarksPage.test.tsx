import { render, screen } from '@testing-library/react';

import BenchmarksPage from '../app/benchmarks/page';

describe('BenchmarksPage', () => {
  it('renders the summary table for all three modes', () => {
    render(<BenchmarksPage />);
    expect(
      screen.getByRole('heading', { name: /human vs pure-ai vs mcop-mediated/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/human-only/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pure-ai rewrite/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mcop-mediated/i).length).toBeGreaterThan(0);
  });

  it('quotes the relative-cost headline', () => {
    render(<BenchmarksPage />);
    const headline = screen.getByTestId('benchmark-headline');
    expect(headline.textContent).toMatch(/more tokens than human-only/);
    expect(headline.textContent).toMatch(/Merkle-rooted provenance/);
    expect(headline.textContent).toMatch(/human Likert/);
    expect(headline.textContent).toMatch(/latency/);
  });

  it('links to the methodology and playbook docs', () => {
    render(<BenchmarksPage />);
    const methodology = screen.getByRole('link', {
      name: /docs\/benchmarks\/methodology\.md/i,
    });
    expect(methodology).toHaveAttribute(
      'href',
      expect.stringContaining('docs/benchmarks/methodology.md'),
    );
    const playbook = screen.getByRole('link', {
      name: /docs\/benchmarks\/playbook\.md/i,
    });
    expect(playbook).toHaveAttribute(
      'href',
      expect.stringContaining('docs/benchmarks/playbook.md'),
    );
  });

  it('renders the task uploader section', () => {
    render(<BenchmarksPage />);
    expect(
      screen.getByRole('heading', { name: /upload custom tasks/i }),
    ).toBeInTheDocument();
  });

  it('renders the live merkle explorer', () => {
    render(<BenchmarksPage />);
    expect(
      screen.getByRole('heading', { name: /live merkle explorer/i }),
    ).toBeInTheDocument();
    // Should have buttons for each auditable run (5 canonical tasks)
    const merkleButtons = screen.getAllByRole('button');
    expect(merkleButtons.length).toBeGreaterThanOrEqual(5);
  });

  it('renders per-task detail with quality and latency columns', () => {
    render(<BenchmarksPage />);
    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map((h) => h.textContent ?? '');
    expect(headerTexts.some((t) => /likert/i.test(t))).toBe(true);
    expect(headerTexts.some((t) => /auto/i.test(t))).toBe(true);
    expect(headerTexts.some((t) => /latency/i.test(t))).toBe(true);
  });
});
