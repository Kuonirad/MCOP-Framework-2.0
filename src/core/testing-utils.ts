/**
 * @fileoverview Reusable testing utilities for SSR / LCP invariants.
 *
 * The MCOP audit accepts a documented testing constraint: live-Chrome
 * hydration is currently blocked by the Next.js 16 + Turbopack runtime
 * chunk on the Devin VMs (see `.agents/skills/testing-frontend/SKILL.md`).
 * The project's accepted substitute for headless-browser testing is a
 * combination of jsdom unit tests and SSR HTML inspection. These
 * utilities are the canonical, framework-agnostic helpers for the
 * latter — both for jest specs (jsdom-rendered fragments) and for the
 * standalone SSR validation script invoked from CI.
 *
 * The functions are pure and operate on a string of HTML so they can
 * be called from:
 *   - jest specs that have already produced markup via `react-dom/server`
 *   - the `scripts/verify-ssr-lcp.mjs` SSR validation script
 *   - any future end-to-end probe that captures `curl http://localhost:3000`
 *
 * They deliberately avoid a DOM dependency so the same code runs in
 * Node (no jsdom) without paying for a full DOM parse.
 */

/**
 * Strict result of an LCP/preload invariant check.
 *
 * `passed` is the only field a test should assert on; the remaining
 * fields exist so failures produce actionable diagnostics in CI logs
 * without requiring the caller to re-grep the HTML.
 */
export interface LCPPreloadVerification {
  readonly passed: boolean;
  readonly fetchPriorityHighCount: number;
  readonly preloadLinkCount: number;
  readonly imageWithFetchPriorityHigh: boolean;
  readonly preloadLinkWithFetchPriorityHigh: boolean;
  readonly hrefMatched: boolean;
  readonly diagnostics: ReadonlyArray<string>;
}

export interface VerifyLCPPreloadOptions {
  /**
   * Substring that must appear in the `href` of the preload link
   * AND the `src` of the LCP `<img>`. Defaults to `/og-image.svg`,
   * which is the framework's hero accent asset.
   */
  readonly href?: string;
  /**
   * Expected total occurrences of `fetchPriority="high"` (or the
   * lowercase `fetchpriority="high"` that React 19 serialises). The
   * MCOP audit fixes this at 2: one for the `<img>`, one for the
   * `<link rel="preload">`. Override only if a future page legitimately
   * carries an additional high-priority asset (rare).
   */
  readonly expectedFetchPriorityHighCount?: number;
}

/**
 * React 19 lowercases JSX boolean/string props when it serialises to
 * HTML, so SSR markup emits `fetchpriority="high"` even though authors
 * write `fetchPriority="high"`. We accept either casing so the helper
 * is symmetric across SSR-emitted and hand-authored HTML.
 */
const FETCH_PRIORITY_HIGH = /fetch[Pp]riority\s*=\s*"high"/g;

/**
 * Match a `<link rel="preload" ... fetchpriority="high" ...>` tag in
 * any attribute order. `[\s\S]` (rather than `.`) tolerates line
 * breaks inside the tag — Next.js 16's SSR output occasionally wraps
 * long attribute lists across multiple lines.
 */
const PRELOAD_LINK_TAG = /<link\b[^>]*\brel\s*=\s*"preload"[^>]*>/gi;

/**
 * Match a self-closing or unclosed `<img>` tag. `<img>` is a void
 * element so the closing slash is optional in HTML5; we accept both
 * forms for robustness against the renderer's chosen serialisation.
 */
const IMG_TAG = /<img\b[^>]*>/gi;

function countMatches(html: string, pattern: RegExp): number {
  // Cloning the regex isolates `lastIndex` between calls — important
  // because the module-level patterns are `g`-flagged and shared.
  const re = new RegExp(pattern.source, pattern.flags);
  let count = 0;
  while (re.exec(html) !== null) count += 1;
  return count;
}

function tagHasFetchPriorityHigh(tag: string): boolean {
  return /fetch[Pp]riority\s*=\s*"high"/.test(tag);
}

function tagHrefIncludes(tag: string, needle: string): boolean {
  const match = tag.match(/\bhref\s*=\s*"([^"]*)"/);
  return match !== null && match[1].includes(needle);
}

function tagSrcIncludes(tag: string, needle: string): boolean {
  const match = tag.match(/\bsrc\s*=\s*"([^"]*)"/);
  return match !== null && match[1].includes(needle);
}

/**
 * Verifies that an HTML document (typically the SSR output of the
 * landing page) implements the LCP preload contract:
 *
 *   1. `fetchPriority="high"` appears exactly `expectedFetchPriorityHighCount`
 *      times (default 2).
 *   2. There is a `<link rel="preload">` carrying `fetchPriority="high"`
 *      whose `href` includes the expected asset path.
 *   3. There is an `<img>` carrying `fetchPriority="high"` whose `src`
 *      includes the same expected asset path.
 *
 * Returns a structured result rather than throwing so callers can
 * decide whether to assert (jest), log + exit non-zero (CI script),
 * or surface diagnostics in a UI.
 *
 * @example
 *   const html = renderToString(<Layout><Page /></Layout>);
 *   const result = verifyLCPPreload(html);
 *   expect(result.passed).toBe(true);
 *
 * @example
 *   // CI script
 *   const html = await fetch('http://localhost:3000/').then(r => r.text());
 *   const result = verifyLCPPreload(html);
 *   if (!result.passed) {
 *     console.error(result.diagnostics.join('\n'));
 *     process.exit(1);
 *   }
 */
export function verifyLCPPreload(
  html: string,
  options: VerifyLCPPreloadOptions = {},
): LCPPreloadVerification {
  const href = options.href ?? "/og-image.svg";
  const expectedFetchPriorityHighCount =
    options.expectedFetchPriorityHighCount ?? 2;

  const fetchPriorityHighCount = countMatches(html, FETCH_PRIORITY_HIGH);

  const preloadLinks = html.match(PRELOAD_LINK_TAG) ?? [];
  const imgTags = html.match(IMG_TAG) ?? [];

  const matchingPreloadLink = preloadLinks.find(
    (tag) => tagHasFetchPriorityHigh(tag) && tagHrefIncludes(tag, href),
  );
  const matchingImg = imgTags.find(
    (tag) => tagHasFetchPriorityHigh(tag) && tagSrcIncludes(tag, href),
  );

  const preloadLinkWithFetchPriorityHigh = matchingPreloadLink !== undefined;
  const imageWithFetchPriorityHigh = matchingImg !== undefined;
  const hrefMatched =
    preloadLinkWithFetchPriorityHigh && imageWithFetchPriorityHigh;

  const diagnostics: string[] = [];
  if (fetchPriorityHighCount !== expectedFetchPriorityHighCount) {
    diagnostics.push(
      `Expected fetchPriority="high" to appear ${expectedFetchPriorityHighCount} times, found ${fetchPriorityHighCount}.`,
    );
  }
  if (!preloadLinkWithFetchPriorityHigh) {
    diagnostics.push(
      `No <link rel="preload" fetchPriority="high" href*="${href}"> found in SSR HTML.`,
    );
  }
  if (!imageWithFetchPriorityHigh) {
    diagnostics.push(
      `No <img fetchPriority="high" src*="${href}"> found in SSR HTML.`,
    );
  }

  const passed =
    fetchPriorityHighCount === expectedFetchPriorityHighCount &&
    preloadLinkWithFetchPriorityHigh &&
    imageWithFetchPriorityHigh;

  return {
    passed,
    fetchPriorityHighCount,
    preloadLinkCount: preloadLinks.length,
    imageWithFetchPriorityHigh,
    preloadLinkWithFetchPriorityHigh,
    hrefMatched,
    diagnostics,
  };
}

/**
 * Convenience wrapper that throws `Error` with the joined diagnostics
 * instead of returning a result. Useful for jest specs where the test
 * body should read as a single line.
 */
export function assertLCPPreload(
  html: string,
  options: VerifyLCPPreloadOptions = {},
): void {
  const result = verifyLCPPreload(html, options);
  if (!result.passed) {
    throw new Error(
      `verifyLCPPreload failed:\n  ${result.diagnostics.join("\n  ")}`,
    );
  }
}
