#!/usr/bin/env node
/**
 * Coverage badge generator.
 *
 * Reads `coverage/coverage-summary.json` (produced by Jest with the
 * `json-summary` reporter) and writes a static SVG badge to
 * `docs/badges/coverage.svg` reflecting the lines-covered percentage.
 *
 * The badge is intentionally self-contained — no shields.io, no
 * Codecov, no external service. Refresh it locally with:
 *
 *     pnpm test:coverage -- --coverageReporters=json-summary
 *     pnpm coverage:badge
 *
 * Or in CI before publishing/main-merge.
 *
 * Exit codes:
 *   0  — badge written
 *   1  — coverage summary missing or unreadable
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const summaryPath = resolve(repoRoot, 'coverage/coverage-summary.json');
const outPath = resolve(repoRoot, 'docs/badges/coverage.svg');

if (!existsSync(summaryPath)) {
  console.error(
    `coverage-badge: ${summaryPath} not found. Run \`pnpm test:coverage -- --coverageReporters=json-summary\` first.`
  );
  process.exit(1);
}

const raw = readFileSync(summaryPath, 'utf8');
let summary;
try {
  summary = JSON.parse(raw);
} catch (err) {
  console.error(`coverage-badge: failed to parse coverage summary: ${err}`);
  process.exit(1);
}

const linesPct = summary?.total?.lines?.pct;
if (typeof linesPct !== 'number' || !Number.isFinite(linesPct)) {
  console.error('coverage-badge: total.lines.pct missing from summary');
  process.exit(1);
}

/** Pick a colour matching the shields.io coverage palette. */
function colourFor(pct) {
  if (pct >= 95) return '#4c1'; // brightgreen
  if (pct >= 90) return '#97ca00'; // green
  if (pct >= 80) return '#a4a61d'; // yellowgreen
  if (pct >= 70) return '#dfb317'; // yellow
  if (pct >= 60) return '#fe7d37'; // orange
  return '#e05d44'; // red
}

const pctLabel = `${linesPct.toFixed(2).replace(/\.?0+$/, '')}%`;
const colour = colourFor(linesPct);

// Hand-rolled flat-square shields.io-compatible SVG (no external font).
// Width math: label = "coverage" (~62 px), value = pctLabel (~52 px).
const labelText = 'coverage';
const valueText = pctLabel;
const charW = 6.0;
const labelW = Math.max(40, labelText.length * charW + 10);
const valueW = Math.max(30, valueText.length * charW + 10);
const totalW = labelW + valueW;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${labelText}: ${valueText}">
  <title>${labelText}: ${valueText}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${colour}"/>
    <rect width="${totalW}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${(labelW / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelW - 10) * 10}">${labelText}</text>
    <text x="${(labelW / 2) * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(labelW - 10) * 10}">${labelText}</text>
    <text aria-hidden="true" x="${(labelW + valueW / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(valueW - 10) * 10}">${valueText}</text>
    <text x="${(labelW + valueW / 2) * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(valueW - 10) * 10}">${valueText}</text>
  </g>
</svg>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, svg);

console.log(`coverage-badge: wrote ${outPath} (lines ${pctLabel}, colour ${colour})`);
