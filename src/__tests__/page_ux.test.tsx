import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX Enhancements', () => {
  it('arrow icons should move on focus-visible for accessibility', () => {
    render(<Home />);
    // Get all elements containing the arrow character
    const arrows = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content.includes('→');
    });

    // There should be two arrows on the page
    expect(arrows.length).toBeGreaterThanOrEqual(2);

    arrows.forEach(arrow => {
      // Check for the focus-visible translation class
      // This ensures keyboard users get the same visual feedback as mouse users
      expect(arrow).toHaveClass('group-focus-visible:translate-x-1');
    });
  });
});
