/**
 * @fileoverview Unit tests for MCOP Framework 2.0 Home Page
 * @description Tests ensure correct rendering and security properties
 * 
 * Bug ID: upstream/security-hardening-001
 * Test Strategy: Verify component renders correctly and contains expected content
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home Page Component', () => {
  /**
   * Test Case: Basic Rendering
   * Ground Truth: Component should render without throwing errors
   * Failure Witness: Component throws on render
   */
  it('renders without crashing', () => {
    expect(() => render(<Home />)).not.toThrow();
  });

  /**
   * Test Case: Main Content Presence
   * Ground Truth: Page should contain main content area
   * Failure Witness: Main element not found
   */
  it('renders main content area', () => {
    render(<Home />);
    const mainElement = document.querySelector('main');
    expect(mainElement).toBeInTheDocument();
  });

  /**
   * Test Case: Next.js Logo Presence
   * Ground Truth: Logo should be present with correct alt text
   * Failure Witness: Image with alt "Next.js logo" not found
   */
  it('renders Next.js logo with accessible alt text', () => {
    render(<Home />);
    const logo = screen.getByAltText('Next.js logo');
    expect(logo).toBeInTheDocument();
  });

  /**
   * Test Case: Footer Links Accessibility
   * Ground Truth: Footer links should have accessible text
   * Failure Witness: Links missing href or accessible content
   */
  it('renders footer with accessible links', () => {
    render(<Home />);
    const footer = document.querySelector('footer');
    expect(footer).toBeInTheDocument();
    
    const links = footer?.querySelectorAll('a');
    expect(links?.length).toBeGreaterThan(0);
    
    links?.forEach(link => {
      expect(link).toHaveAttribute('href');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });
  });

  /**
   * Test Case: Security - No Script Injection
   * Ground Truth: User-facing content should not contain script tags
   * Failure Witness: Script tag found in rendered content
   */
  it('does not render any script tags in content', () => {
    render(<Home />);
    // Only Next.js internal scripts should exist, not in the component content
    const mainContent = document.querySelector('main');
    const scriptsInMain = mainContent?.querySelectorAll('script');
    expect(scriptsInMain?.length || 0).toBe(0);
  });

  /**
   * Test Case: External Links Security
   * Ground Truth: All external links should have rel="noopener noreferrer"
   * Failure Witness: External link missing security attributes
   */
  it('external links have proper security attributes', () => {
    render(<Home />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    
    externalLinks.forEach(link => {
      const rel = link.getAttribute('rel');
      expect(rel).toContain('noopener');
    });
  });
});

describe('Accessibility Tests', () => {
  /**
   * Test Case: Directional Link Micro-interactions
   * Ground Truth: Directional arrows and associated text should have focus-visible styles paired with hover styles
   * Failure Witness: Missing group-focus-visible classes on directional elements
   */
  it('directional links pair hover states with focus-visible states', () => {
    render(<Home />);

    // Test the "Read our docs" arrow span
    const docsArrowSpan = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content === '→';
    })[0];

    expect(docsArrowSpan).toHaveClass('group-hover:translate-x-1');
    expect(docsArrowSpan).toHaveClass('group-focus-visible:translate-x-1');

    // Test the "Go to nextjs.org" text and arrow span
    const nextjsTextSpan = screen.getByText('Go to nextjs.org');
    expect(nextjsTextSpan).toHaveClass('group-hover:underline');
    expect(nextjsTextSpan).toHaveClass('group-focus-visible:underline');

    const nextjsArrowSpan = screen.getAllByText((content, element) => {
      return element?.tagName.toLowerCase() === 'span' && content === '→';
    })[1];
    expect(nextjsArrowSpan).toHaveClass('group-hover:translate-x-1');
    expect(nextjsArrowSpan).toHaveClass('group-focus-visible:translate-x-1');
  });

  /**
   * Test Case: Images have alt text
   * Ground Truth: All images should have alt attributes
   * Failure Witness: Image found without alt attribute
   */
  it('all images have alt attributes', () => {
    render(<Home />);
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
      expect(img).toHaveAttribute('alt');
    });
  });

  /**
   * Test Case: Ordered list semantics
   * Ground Truth: Instructions should use semantic list elements
   * Failure Witness: Instructions not in ordered list
   */
  it('uses semantic ordered list for instructions', () => {
    render(<Home />);
    const orderedList = document.querySelector('ol');
    expect(orderedList).toBeInTheDocument();
    
    const listItems = orderedList?.querySelectorAll('li');
    expect(listItems?.length).toBeGreaterThan(0);
  });
});
