/**
 * @fileoverview Unit tests for Micro-UX enhancements on the Home Page
 * @description Validates accessibility and micro-interaction additions.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page Micro-UX', () => {
  /**
   * Test Case: Directional Arrow Interactions
   * Ground Truth: Directional links with arrows ('→') should animate on both hover and focus-visible.
   * Failure Witness: Spans containing '→' lack 'group-focus-visible:translate-x-1' class.
   */
  it('directional arrows animate on focus-visible for keyboard users', () => {
    render(<Home />);

    // Find all spans that contain exactly '→'
    const arrowSpans = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content === '→';
    });

    expect(arrowSpans.length).toBeGreaterThan(0);

    arrowSpans.forEach(span => {
      expect(span).toHaveClass('group-focus-visible:translate-x-1');
      expect(span).toHaveClass('group-hover:translate-x-1');
      expect(span).toHaveClass('transition-transform');
    });
  });
});
