/**
 * @fileoverview Unit tests for the SSR / LCP testing utilities.
 *
 * These tests exercise `verifyLCPPreload` on hand-rolled HTML fixtures
 * so the helper is decoupled from any specific rendering pipeline. The
 * landing page's actual SSR HTML is exercised separately by
 * `scripts/verify-ssr-lcp.mjs`, which is wired into CI.
 */

import {
  assertLCPPreload,
  verifyLCPPreload,
} from "../core/testing-utils";

const PASSING_HTML = `
  <html>
    <head>
      <link rel="preload" as="image" href="/og-image.svg" fetchpriority="high" />
    </head>
    <body>
      <img src="/og-image.svg" alt="" fetchpriority="high" />
    </body>
  </html>
`;

describe("verifyLCPPreload", () => {
  it("passes when SSR HTML carries one preload + one image with fetchPriority=high", () => {
    const result = verifyLCPPreload(PASSING_HTML);
    expect(result.passed).toBe(true);
    expect(result.fetchPriorityHighCount).toBe(2);
    expect(result.preloadLinkWithFetchPriorityHigh).toBe(true);
    expect(result.imageWithFetchPriorityHigh).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails when fetchPriority=high count is wrong", () => {
    const html = `
      <link rel="preload" as="image" href="/og-image.svg" fetchpriority="high" />
      <img src="/og-image.svg" />
    `;
    const result = verifyLCPPreload(html);
    expect(result.passed).toBe(false);
    expect(result.fetchPriorityHighCount).toBe(1);
    expect(result.diagnostics.some((d) => d.includes("Expected"))).toBe(true);
  });

  it("fails when the preload link is missing", () => {
    const html = `
      <img src="/og-image.svg" fetchpriority="high" />
      <img src="/other.svg" fetchpriority="high" />
    `;
    const result = verifyLCPPreload(html);
    expect(result.passed).toBe(false);
    expect(result.preloadLinkWithFetchPriorityHigh).toBe(false);
  });

  it("fails when the LCP image is missing", () => {
    const html = `
      <link rel="preload" as="image" href="/og-image.svg" fetchpriority="high" />
      <link rel="preload" as="image" href="/og-image.svg" fetchpriority="high" />
    `;
    const result = verifyLCPPreload(html);
    expect(result.passed).toBe(false);
    expect(result.imageWithFetchPriorityHigh).toBe(false);
  });

  it("accepts both camelCase (fetchPriority) and lowercase (fetchpriority)", () => {
    const html = `
      <link rel="preload" as="image" href="/og-image.svg" fetchPriority="high" />
      <img src="/og-image.svg" fetchpriority="high" />
    `;
    const result = verifyLCPPreload(html);
    expect(result.passed).toBe(true);
  });

  it("respects a custom expected count", () => {
    const html = `
      <link rel="preload" as="image" href="/og-image.svg" fetchpriority="high" />
      <img src="/og-image.svg" fetchpriority="high" />
      <img src="/og-image.svg" fetchpriority="high" />
    `;
    const result = verifyLCPPreload(html, {
      expectedFetchPriorityHighCount: 3,
    });
    expect(result.passed).toBe(true);
  });

  it("respects a custom href substring", () => {
    const html = `
      <link rel="preload" as="image" href="/hero.png" fetchpriority="high" />
      <img src="/hero.png" fetchpriority="high" />
    `;
    const result = verifyLCPPreload(html, { href: "/hero.png" });
    expect(result.passed).toBe(true);
  });
});

describe("assertLCPPreload", () => {
  it("does not throw on passing HTML", () => {
    expect(() => assertLCPPreload(PASSING_HTML)).not.toThrow();
  });

  it("throws with joined diagnostics on failing HTML", () => {
    expect(() => assertLCPPreload("<html></html>")).toThrow(
      /verifyLCPPreload failed/,
    );
  });
});
