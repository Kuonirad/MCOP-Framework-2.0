/**
 * Tests for the AI-crawler direct-answer block + the top-level Person
 * JSON-LD added at the layout level. These are the public contract
 * surfaces generative-search systems index against, so a regression
 * here silently degrades MCOP's discoverability.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('AI-crawler direct-answer block', () => {
  it('renders a labeled `data-llm-answer` block with TL;DR copy', () => {
    render(<Home />);
    const block = document.querySelector('[data-llm-answer="mcop-framework-tldr"]');
    expect(block).toBeInTheDocument();
    expect(block?.textContent).toMatch(/MCOP Framework 2\.0/);
    expect(block?.textContent).toMatch(/Universal Adapter Protocol v2\.1/);
  });

  it('exposes the TL;DR with an aria-labelledby heading for AT', () => {
    render(<Home />);
    const block = document.querySelector('[data-llm-answer="mcop-framework-tldr"]');
    const labelledBy = block?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy as string);
    expect(heading).toBeInTheDocument();
    expect(heading?.textContent).toMatch(/TL;DR/i);
  });

  it('annotates the answer with schema.org Answer microdata', () => {
    render(<Home />);
    const block = document.querySelector('[data-llm-answer="mcop-framework-tldr"]');
    expect(block?.getAttribute('itemtype')).toBe('https://schema.org/Answer');
    const answerProp = block?.querySelector('[itemprop="text"]');
    expect(answerProp).toBeInTheDocument();
  });
});

describe('Page JSON-LD', () => {
  it('emits SoftwareApplication and TechArticle JSON-LD scripts on the page', () => {
    render(<Home />);
    const scripts = document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    );
    const blobs = Array.from(scripts).map((s) => s.textContent ?? '');
    expect(blobs.some((b) => b.includes('"SoftwareApplication"'))).toBe(true);
    expect(blobs.some((b) => b.includes('"TechArticle"'))).toBe(true);
  });
});
