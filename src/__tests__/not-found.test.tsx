import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotFound from '../app/not-found';

describe('NotFound Page', () => {
  it('renders the 404 heading', () => {
    render(<NotFound />);
    const heading = screen.getByRole('heading', { level: 1, name: /404/i });
    expect(heading).toBeInTheDocument();
  });

  it('renders the thematic error message', () => {
    render(<NotFound />);
    expect(screen.getByText(/The trace you are following has dissolved/i)).toBeInTheDocument();
  });

  it('contains a link to return home with correct aria-label', () => {
    render(<NotFound />);
    const homeLink = screen.getByRole('link', { name: /Return to Source \(Home\)/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('has a main element with id main-content for accessibility', () => {
    render(<NotFound />);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
  });
});
