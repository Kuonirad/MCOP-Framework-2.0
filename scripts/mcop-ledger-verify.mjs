#!/usr/bin/env node
/**
 * `mcop-ledger verify` — stateless verification of a Hosted
 * Provenance Ledger export bundle.
 *
 * Usage:
 *
 *     node scripts/mcop-ledger-verify.mjs --bundle ./export.json
 *
 * Exit status:
 *   0 — bundle verifies (forest root matches sealed leaves +
 *       parent-hash chain is intact)
 *   1 — bundle is invalid (with a human-readable reason on stderr)
 *   2 — usage error
 *
 * The script reads only the bundle file; it does not call out to any
 * remote ledger. This makes it suitable for air-gapped audit reviews
 * — drop the export into a clean machine, run the script, and you've
 * cryptographically reconfirmed every leaf belongs to the sealed
 * forest root.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import canonicalize from 'canonicalize';

function canonicalDigest(payload) {
  const raw = canonicalize(payload) ?? '{}';
  return createHash('sha256').update(raw).digest('hex');
}

function fail(reason, code = 1) {
  process.stderr.write(`mcop-ledger verify: ${reason}\n`);
  process.exit(code);
}

const args = process.argv.slice(2);
let bundlePath = '';
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--bundle' || a === '-b') {
    bundlePath = args[i + 1] ?? '';
    i += 1;
  } else if (a === '-h' || a === '--help') {
    process.stdout.write(
      'Usage: mcop-ledger-verify --bundle <path-to-export.json>\n',
    );
    process.exit(0);
  } else {
    fail(`unknown argument: ${a}`, 2);
  }
}

if (!bundlePath) fail('missing --bundle <path>', 2);

let bundle;
try {
  const raw = readFileSync(bundlePath, 'utf-8');
  bundle = JSON.parse(raw);
} catch (err) {
  fail(`could not read bundle: ${err.message ?? err}`, 2);
}

if (!bundle || typeof bundle !== 'object') fail('bundle is not a JSON object');
if (bundle.version !== 'mcop-ledger-export/1.0') {
  fail(`unsupported bundle version: ${bundle.version}`);
}
if (!Array.isArray(bundle.leaves)) fail('bundle.leaves is not an array');

// Re-verify forest root.
const expectedRoot = canonicalDigest({
  type: 'MCOP_LEDGER_FOREST',
  tenantId: bundle.tenantId,
  leafHashes: bundle.leaves.map((l) => l.leafHash),
});
if (expectedRoot !== bundle.forestRoot) {
  fail(
    `forest root mismatch — expected ${expectedRoot} but bundle claims ${bundle.forestRoot}`,
  );
}

// Re-verify parent-hash chain.
let prev;
for (const leaf of bundle.leaves) {
  if (leaf.parentHash !== prev) {
    fail(
      `parent-hash chain broken at leaf ${leaf.id ?? '<unknown>'} ` +
        `(expected parentHash=${prev ?? '<root>'}, got ${leaf.parentHash})`,
    );
  }
  prev = leaf.leafHash;
}

process.stdout.write(
  `mcop-ledger verify: OK — tenant=${bundle.tenantId} leaves=${bundle.leaves.length} root=${bundle.forestRoot}\n`,
);
process.exit(0);
