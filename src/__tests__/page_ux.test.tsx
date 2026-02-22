import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page UX Enhancements', () => {
  /**
   * Test Case: Directional Link Focus State
   * Ground Truth: Links with hover transitions on arrows must have matching focus transitions
   * Failure Witness: Arrow span missing group-focus-visible:translate-x-1 class
   */
  it('directional arrows have consistent focus-visible states', () => {
    render(<Home />);

    // Find all arrow spans using a custom matcher to be robust
    const arrowSpans = screen.getAllByText((content, element) => {
      return element?.tagName === 'SPAN' && content.includes('→');
    });

    // We expect at least 2 arrows (Docs link and Next.js link)
    expect(arrowSpans.length).toBeGreaterThanOrEqual(2);

    arrowSpans.forEach((span, index) => {
      // Check for the focus-visible class
      // We use checking for class list or className string
      expect(span).toHaveClass('group-focus-visible:translate-x-1');
    });
  });
});
