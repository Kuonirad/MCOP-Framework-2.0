import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX Enhancements', () => {
  it('renders directional arrows with keyboard focus styles', () => {
    render(<Home />);

    // Find all arrow elements
    const arrows = screen.getAllByText('→');

    // Filter for the ones that are likely our directional arrows (have transition-transform)
    const directionalArrows = arrows.filter(arrow =>
      arrow.classList.contains('transition-transform')
    );

    expect(directionalArrows.length).toBeGreaterThan(0);

    directionalArrows.forEach(arrow => {
      // Check for hover state (existing)
      expect(arrow).toHaveClass('group-hover:translate-x-1');

      // Check for focus visible state (new requirement)
      expect(arrow).toHaveClass('group-focus-visible:translate-x-1');
    });
  });
});
