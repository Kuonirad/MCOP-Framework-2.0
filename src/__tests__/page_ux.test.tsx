/**
 * @fileoverview UX and Accessibility unit tests for MCOP Framework 2.0 Home Page
 * @description Tests ensure equitable micro-interactions for mouse and keyboard users
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page Micro-UX', () => {
  /**
   * Test Case: Directional Arrow Interactions
   * Ground Truth: Directional arrows should provide equal affordance to mouse and keyboard users
   * Failure Witness: Arrow span missing group-hover or group-focus-visible translate classes
   */
  it('directional arrows implement equitable hover and focus-visible states', () => {
    render(<Home />);

    // Find all spans containing the arrow character '→'
    const arrowSpans = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content.trim() === '→';
    });

    // We expect to find at least two arrows based on the design
    expect(arrowSpans.length).toBeGreaterThanOrEqual(2);

    arrowSpans.forEach(span => {
      expect(span).toHaveClass('group-hover:translate-x-1');
      expect(span).toHaveClass('group-focus-visible:translate-x-1');
      expect(span).toHaveClass('motion-reduce:transform-none');
    });
  });

  /**
   * Test Case: Go to Next.js text interactions
   * Ground Truth: Text inside complex link should provide equal affordance
   * Failure Witness: Text span missing group-focus-visible underline classes
   */
  it('Go to nextjs.org text implements equitable hover and focus-visible underline states', () => {
    render(<Home />);

    // Find the specific text span
    const textSpan = screen.getByText('Go to nextjs.org');

    expect(textSpan).toHaveClass('group-hover:underline');
    expect(textSpan).toHaveClass('group-hover:underline-offset-4');
    expect(textSpan).toHaveClass('group-focus-visible:underline');
    expect(textSpan).toHaveClass('group-focus-visible:underline-offset-4');
  });
});
