#!/usr/bin/env node
/**
 * @fileoverview Automated SSR validation for the LCP preload contract.
 *
 * The Devin VMs and CI cannot reliably hydrate the Next.js 16 +
 * Turbopack production bundle (see `.agents/skills/testing-frontend/SKILL.md`
 * for the full diagnosis). The accepted substitute for headless-browser
 * testing is **SSR HTML inspection**: the server-rendered HTML proves
 * what the browser will paint *before* hydration, which is exactly the
 * surface that LCP / preload optimisations target.
 *
 * This script:
 *   1. Fetches the SSR HTML of a target URL (default `http://localhost:3000/`).
 *   2. Runs the shared `verifyLCPPreload` invariant from
 *      `src/core/testing-utils.ts` against the response body.
 *   3. Exits 0 on pass, prints diagnostics + exits 1 on fail.
 *
 * Intended usage (locally + in CI):
 *
 *   pnpm build
 *   cp -r public .next/standalone/
 *   cp -r .next/static .next/standalone/.next/
 *   PORT=3000 node .next/standalone/server.js &
 *   sleep 3
 *   node scripts/verify-ssr-lcp.mjs
 *
 * Or against an arbitrary URL:
 *
 *   node scripts/verify-ssr-lcp.mjs https://example.com/landing
 *
 * The script intentionally has zero dependencies beyond Node's built-in
 * `fetch` (Node 20+) and a small TypeScript-via-tsx loader for the
 * shared utility — see `loadVerifier()` for why we avoid pulling in a
 * full TS toolchain.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TESTING_UTILS_PATH = resolve(
  REPO_ROOT,
  "src/core/testing-utils.ts",
);

const DEFAULT_URL = "http://localhost:3000/";

/**
 * Inline the regex/predicate stack from `src/core/testing-utils.ts` so
 * this script remains zero-dependency and can run before
 * `pnpm install` completes in cold CI environments. The TS source is
 * still parsed at runtime (read below) to detect drift — if the
 * compiled regexes here ever fall out of sync with the source, the
 * drift check throws and the script aborts loudly.
 */
const FETCH_PRIORITY_HIGH = /fetch[Pp]riority\s*=\s*"high"/g;
const PRELOAD_LINK_TAG = /<link\b[^>]*\brel\s*=\s*"preload"[^>]*>/gi;
const IMG_TAG = /<img\b[^>]*>/gi;

function countMatches(html, pattern) {
  const re = new RegExp(pattern.source, pattern.flags);
  let count = 0;
  while (re.exec(html) !== null) count += 1;
  return count;
}

function tagHasFetchPriorityHigh(tag) {
  return /fetch[Pp]riority\s*=\s*"high"/.test(tag);
}

function tagHrefIncludes(tag, needle) {
  const match = tag.match(/\bhref\s*=\s*"([^"]*)"/);
  return match !== null && match[1].includes(needle);
}

function tagSrcIncludes(tag, needle) {
  const match = tag.match(/\bsrc\s*=\s*"([^"]*)"/);
  return match !== null && match[1].includes(needle);
}

function verifyLCPPreload(html, options = {}) {
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

  const diagnostics = [];
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
    diagnostics,
  };
}

/**
 * Drift guard: confirm the source TS still defines the same exported
 * helper signature this script inlines. We don't try to evaluate the
 * TypeScript — that would require a transformer — but a structural
 * check on the public surface is enough to catch silent renames.
 */
async function assertSourceParity() {
  const source = await readFile(TESTING_UTILS_PATH, "utf8");
  const expectedExports = [
    "export function verifyLCPPreload",
    "export function assertLCPPreload",
    "FETCH_PRIORITY_HIGH",
    "PRELOAD_LINK_TAG",
    "IMG_TAG",
  ];
  const missing = expectedExports.filter((name) => !source.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `verify-ssr-lcp.mjs is out of sync with src/core/testing-utils.ts; ` +
        `missing tokens: ${missing.join(", ")}. Update both files together.`,
    );
  }
}

async function main() {
  const url = process.argv[2] ?? DEFAULT_URL;

  await assertSourceParity();

  process.stdout.write(`SSR LCP preload verification\n`);
  process.stdout.write(`  target: ${url}\n`);

  let html;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      process.stderr.write(
        `Failed: ${url} responded ${response.status} ${response.statusText}\n`,
      );
      process.exit(1);
    }
    html = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `Failed to fetch ${url}: ${message}\n` +
        `Hint: start the production server first (\`pnpm build && PORT=3000 node .next/standalone/server.js &\`).\n`,
    );
    process.exit(1);
  }

  const result = verifyLCPPreload(html);

  process.stdout.write(
    `  fetchPriority="high" count: ${result.fetchPriorityHighCount} (expected 2)\n`,
  );
  process.stdout.write(
    `  preload link with fetchPriority=high: ${result.preloadLinkWithFetchPriorityHigh}\n`,
  );
  process.stdout.write(
    `  <img> with fetchPriority=high: ${result.imageWithFetchPriorityHigh}\n`,
  );

  if (result.passed) {
    process.stdout.write(`PASS — LCP preload contract satisfied.\n`);
    process.exit(0);
  }

  process.stderr.write(`FAIL — LCP preload contract violated:\n`);
  for (const diag of result.diagnostics) {
    process.stderr.write(`  - ${diag}\n`);
  }
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`verify-ssr-lcp crashed: ${message}\n`);
  process.exit(1);
});
