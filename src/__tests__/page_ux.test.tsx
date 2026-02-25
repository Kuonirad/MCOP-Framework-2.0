import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX Enhancements', () => {
  it('adds focus-visible styles to arrow icons for keyboard accessibility', () => {
    render(<Home />);

    // Find all arrow elements
    const arrows = screen.getAllByText('→');

    expect(arrows.length).toBeGreaterThan(0);

    // Check if they have the focus-visible class
    arrows.forEach(arrow => {
      // We expect the class to be present for the UX improvement
      expect(arrow.className).toContain('group-focus-visible:translate-x-1');
    });
  });
});
