import { fireEvent, render, screen } from '@testing-library/react';

import BenchmarksPage from '../app/benchmarks/page';
import TaskUploader from '../app/benchmarks/BenchmarksClient';

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

describe('TaskUploader', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the preview page with encoded task JSON', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const task = {
      id: 'custom-task',
      domain: 'generic',
      humanPrompt: 'Summarize the launch plan.',
      goalKeywords: ['launch', 'summary'],
    };

    render(<TaskUploader />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: JSON.stringify([task]) },
    });
    fireEvent.click(screen.getByRole('button', { name: /preview scoring/i }));

    expect(alert).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/benchmarks/preview?tasks='),
      '_blank',
    );
    const [url] = open.mock.calls[0] as [string, string];
    const encodedTasks = new URL(`http://localhost${url}`).searchParams.get('tasks');
    expect(JSON.parse(encodedTasks ?? 'null')).toEqual([task]);
  });

  it('shows an alert instead of navigating for invalid JSON', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});

    render(<TaskUploader />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '{"not": "an array"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /preview scoring/i }));

    expect(open).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Expected an array'));
  });
});
