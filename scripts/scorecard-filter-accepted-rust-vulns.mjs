#!/usr/bin/env node
/**
 * Filter OpenSSF Scorecard SARIF for GitHub Code Scanning.
 *
 * Scorecard's Vulnerabilities check queries OSV and flags every RUSTSEC entry
 * in apps/desktop/src-tauri/Cargo.lock — including INFO unmaintained GTK3
 * crates that have no patched versions on crates.io (required by Tauri/wry
 * webkit2gtk). Those IDs are already documented and ignored by cargo-audit in
 * apps/desktop/src-tauri/.cargo/audit.toml.
 *
 * This script rewrites the Scorecard SARIF *before* upload-sarif so:
 *   - accepted-only findings do not re-open code-scanning alert #30
 *   - any NEW RUSTSEC / OSV id not in the allowlist still fails Code Scanning
 *
 * Public scorecard.dev results (publish_results: true) remain the raw Scorecard
 * score; this filter only affects GitHub Code Scanning SARIF.
 *
 * Usage:
 *   node scripts/scorecard-filter-accepted-rust-vulns.mjs scorecard-results.sarif
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditTomlPath = path.join(
  repoRoot,
  'apps/desktop/src-tauri/.cargo/audit.toml',
);

/** @returns {Set<string>} */
function loadAcceptedRustsecIds() {
  let text;
  try {
    text = fs.readFileSync(auditTomlPath, 'utf8');
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === 'ENOENT') {
      throw new Error(`Missing ${auditTomlPath}`);
    }
    throw err;
  }
  const ids = new Set();
  for (const match of text.matchAll(/"(RUSTSEC-\d{4}-\d{4})"/g)) {
    ids.add(match[1]);
  }
  if (ids.size === 0) {
    throw new Error(`No RUSTSEC ids found in ${auditTomlPath}`);
  }
  return ids;
}

/** @param {string} message */
function extractRustsecIds(message) {
  const ids = new Set();
  for (const match of String(message).matchAll(/RUSTSEC-\d{4}-\d{4}/g)) {
    ids.add(match[0]);
  }
  return ids;
}

/**
 * Atomically replace `targetPath` with `content` via temp file + rename.
 * Avoids TOCTOU between existence checks and writes (CodeQL js/file-system-race).
 */
function writeFileAtomic(targetPath, content) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function main() {
  const sarifPath = path.resolve(process.argv[2] || 'scorecard-results.sarif');

  let raw;
  try {
    raw = fs.readFileSync(sarifPath, 'utf8');
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === 'ENOENT') {
      throw new Error(`SARIF file not found: ${sarifPath}`);
    }
    throw err;
  }

  const accepted = loadAcceptedRustsecIds();
  const sarif = JSON.parse(raw);
  let rewritten = 0;
  let removed = 0;

  for (const run of sarif.runs ?? []) {
    if (!Array.isArray(run.results)) continue;
    const next = [];
    for (const result of run.results) {
      const ruleId = result.ruleId || result.rule?.id;
      if (ruleId !== 'VulnerabilitiesID') {
        next.push(result);
        continue;
      }

      const text = result.message?.text || result.message?.markdown || '';
      const found = extractRustsecIds(text);
      if (found.size === 0) {
        // Non-RUSTSEC vulnerability finding — keep as-is.
        next.push(result);
        continue;
      }

      const remaining = [...found].filter((id) => !accepted.has(id)).sort();
      if (remaining.length === 0) {
        // All Scorecard-reported RUSTSECs are in the desktop audit allowlist.
        removed += 1;
        console.log(
          `scorecard-filter: dropped VulnerabilitiesID result covering only accepted RUSTSECs (${[...found].sort().join(', ')})`,
        );
        continue;
      }

      const acceptedHit = [...found].filter((id) => accepted.has(id));
      const msg =
        `score is 0: ${remaining.length} existing vulnerabilities detected:\n` +
        remaining.map((id) => `Warn: Project is vulnerable to: ${id}`).join('\n') +
        (acceptedHit.length
          ? `\n\n(Also noted but accepted for Tauri/wry GTK3 Linux WebView — see apps/desktop/src-tauri/.cargo/audit.toml: ${acceptedHit.sort().join(', ')})`
          : '') +
        `\nClick Remediation section below to solve this issue`;

      result.message = { ...(result.message || {}), text: msg };
      if (result.message.markdown !== undefined) {
        result.message.markdown = msg;
      }
      next.push(result);
      rewritten += 1;
      console.log(
        `scorecard-filter: kept VulnerabilitiesID with non-accepted ids: ${remaining.join(', ')}`,
      );
    }
    run.results = next;
  }

  writeFileAtomic(sarifPath, `${JSON.stringify(sarif, null, 2)}\n`);
  console.log(
    `scorecard-filter: wrote ${sarifPath} (removed=${removed}, rewritten=${rewritten})`,
  );
}

main();
