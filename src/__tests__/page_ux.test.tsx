/**
 * @fileoverview UX verification tests for MCOP Framework 2.0 Home Page
 * @description Validates accessibility enhancements and micro-interactions
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX Enhancements', () => {
  /**
   * Test Case: Directional Link Arrow Accessibility
   * Ground Truth: Directional arrows should move on focus-visible to match hover state
   * Failure Witness: Arrow span missing 'group-focus-visible:translate-x-1' class
   */
  it('applies focus-visible styles to directional arrows for keyboard accessibility', () => {
    render(<Home />);

    // Find all arrow elements containing "→"
    // Using a function matcher to find text content that includes the arrow
    const arrows = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content.includes('→');
    });

    expect(arrows.length).toBeGreaterThan(0);

    arrows.forEach(arrow => {
      // Check for the specific class that enables the accessible interaction
      expect(arrow).toHaveClass('group-focus-visible:translate-x-1');

      // Also verify it has the hover state (sanity check)
      expect(arrow).toHaveClass('group-hover:translate-x-1');

      // And motion reduction support
      expect(arrow).toHaveClass('motion-reduce:transform-none');
    });
  });
});
