import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX Enhancements', () => {
  it('renders directional arrows with focus-visible translation for accessibility', () => {
    render(<Home />);

    // Find all elements containing the arrow character
    const arrows = screen.getAllByText('→');

    // There should be at least 2 arrows (Read our docs, Go to nextjs.org)
    expect(arrows.length).toBeGreaterThanOrEqual(2);

    arrows.forEach(arrow => {
      // Check for the class that handles focus visibility translation
      // This class ensures keyboard users get visual feedback when focusing the parent link
      expect(arrow).toHaveClass('group-focus-visible:translate-x-1');
    });
  });
});
