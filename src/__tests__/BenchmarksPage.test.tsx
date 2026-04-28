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
  });

  it('links to the methodology and whitepaper docs', () => {
    render(<BenchmarksPage />);
    const methodology = screen.getByRole('link', {
      name: /docs\/benchmarks\/methodology\.md/i,
    });
    expect(methodology).toHaveAttribute(
      'href',
      expect.stringContaining('docs/benchmarks/methodology.md'),
    );
    const whitepaper = screen.getByRole('link', {
      name: /docs\/whitepapers\/Human_vs_PureAI_Prompting\.md/i,
    });
    expect(whitepaper).toHaveAttribute(
      'href',
      expect.stringContaining('docs/whitepapers/Human_vs_PureAI_Prompting.md'),
    );
  });
});
