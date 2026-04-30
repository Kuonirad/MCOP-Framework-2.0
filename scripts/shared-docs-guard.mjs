#!/usr/bin/env node
/**
 * Shared-docs guardian.
 *
 * Verifies that legal / governance files which MUST stay byte-identical
 * across the monorepo actually do. Currently policed:
 *
 *   - LICENSE              (BUSL 1.1 root text — identical in all sibling
 *                           publishables)
 *
 * Files that intentionally diverge per-package (NOTICE.md and
 * LICENSE-MIT-LEGACY name the package they ship with) are reported as
 * INFO so drift is at least visible — not failures.
 *
 * Exit codes:
 *   0  — drift-free for all required-identical files
 *   1  — drift detected in a required-identical file
 *
 * Wire into CI alongside `parity:check` to surface monorepo doc hygiene
 * the same way cross-language behavior is policed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** Files that must be byte-identical across these locations. */
const STRICT = [
  {
    name: 'LICENSE',
    paths: [
      'LICENSE',
      'packages/core/LICENSE',
      'mcop_package/LICENSE',
    ],
  },
];

/** Files that may legitimately diverge — reported informationally only. */
const ADVISORY = [
  {
    name: 'NOTICE.md',
    paths: ['NOTICE.md', 'packages/core/NOTICE.md', 'mcop_package/NOTICE.md'],
  },
  {
    name: 'LICENSE-MIT-LEGACY',
    paths: [
      'LICENSE-MIT-LEGACY',
      'packages/core/LICENSE-MIT-LEGACY',
      'mcop_package/LICENSE-MIT-LEGACY',
    ],
  },
];

function sha256OfFile(absPath) {
  if (!existsSync(absPath)) return null;
  const buf = readFileSync(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

function checkGroup(group, { strict }) {
  const hashes = group.paths.map((rel) => {
    const abs = resolve(repoRoot, rel);
    return { rel, hash: sha256OfFile(abs) };
  });

  const missing = hashes.filter((h) => h.hash === null);
  if (missing.length) {
    return {
      ok: false,
      msg: `[${group.name}] missing files: ${missing.map((m) => m.rel).join(', ')}`,
    };
  }

  const distinct = new Set(hashes.map((h) => h.hash));
  if (distinct.size === 1) {
    return { ok: true, msg: `[${group.name}] OK — ${hashes.length} copies identical` };
  }

  const detail = hashes.map((h) => `  ${h.rel}: ${h.hash.slice(0, 12)}…`).join('\n');
  return {
    ok: false,
    msg:
      `[${group.name}] DRIFT — ${distinct.size} distinct hashes across ${hashes.length} copies:\n${detail}` +
      (strict ? '' : '\n  (advisory: per-package divergence may be intentional)'),
  };
}

let hardFail = false;

console.log('--- Shared-docs guardian ---');
for (const group of STRICT) {
  const r = checkGroup(group, { strict: true });
  console.log((r.ok ? 'PASS ' : 'FAIL ') + r.msg);
  if (!r.ok) hardFail = true;
}
for (const group of ADVISORY) {
  const r = checkGroup(group, { strict: false });
  console.log((r.ok ? 'PASS ' : 'INFO ') + r.msg);
}
console.log('---');

if (hardFail) {
  console.error(
    'shared-docs-guard: at least one strict-identical doc has drifted. ' +
      'Re-sync from the canonical root copy.'
  );
  process.exit(1);
}
process.exit(0);
