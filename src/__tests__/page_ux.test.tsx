import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX Improvements', () => {
  it('renders arrow indicators with keyboard focus feedback', () => {
    render(<Home />);

    // Find all spans containing the arrow
    const arrows = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content.includes('→');
    });

    expect(arrows.length).toBeGreaterThan(0);

    arrows.forEach(arrow => {
      // Check for the focus-visible translation class
      // This ensures keyboard users get the same visual feedback as hover users
      expect(arrow).toHaveClass('group-focus-visible:translate-x-1');
    });
  });
});
