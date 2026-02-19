/**
 * @fileoverview Unit tests for MCOP Framework 2.0 Home Page UX
 * @description Tests specific UX enhancements like focus states and transitions
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX', () => {
  /**
   * Test Case: Arrow Focus Animation
   * Ground Truth: Arrows in links should translate on focus-visible for keyboard users
   * Failure Witness: Arrow span missing 'group-focus-visible:translate-x-1' class
   */
  it('arrows have focus-visible translation for accessibility', () => {
    render(<Home />);

    // Find all elements containing the arrow character
    // We use a function matcher because the arrow might be surrounded by whitespace
    const arrows = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content.includes('→');
    });

    expect(arrows.length).toBeGreaterThan(0);

    arrows.forEach(arrow => {
      // Check for the class that handles focus-visible translation
      expect(arrow).toHaveClass('group-focus-visible:translate-x-1');
    });
  });
});
