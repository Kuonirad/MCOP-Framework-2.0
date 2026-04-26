/**
 * Cross-Runtime Canonical-Merkle Parity Guardian — TypeScript side.
 *
 * Reads the shared fixture set and asserts that
 * ``canonicalDigest(fixture)`` produces the exact hex string locked in
 * ``tests/parity/canonicalMerkleParity.golden.json`` for every entry.
 *
 * The Python counterpart
 * (``mcop_package/tests/parity/test_canonical_merkle_parity.py``) hashes
 * the same fixtures against the same golden file. Drift in either
 * runtime — a change to ``canonicalize``, a future Node version that
 * tweaks ``Number.prototype.toString``, a regression in ``rfc8785`` — is
 * caught by this pair, making cross-runtime determinism mechanically
 * verifiable instead of rhetorical.
 *
 * To regenerate the fixtures and golden roots after intentionally
 * adding new edge cases, run::
 *
 *     python3 tests/parity/generate_fixtures.py
 *
 * Both languages must agree after regeneration; if they diverge the
 * cross-runtime determinism guarantee is broken and the divergence
 * itself is the bug to fix.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { canonicalDigest } from '../core/canonicalEncoding';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_PATH = path.join(
  REPO_ROOT,
  'tests',
  'parity',
  'canonicalMerkleParity.fixtures.json',
);
const GOLDEN_PATH = path.join(
  REPO_ROOT,
  'tests',
  'parity',
  'canonicalMerkleParity.golden.json',
);

describe('Cross-Runtime Canonical-Merkle Parity (TS)', () => {
  const fixtures: unknown[] = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const golden: string[] = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

  it('fixtures and golden roots have the same length', () => {
    expect(fixtures.length).toBe(golden.length);
    expect(fixtures.length).toBeGreaterThanOrEqual(1000);
  });

  it('every golden entry is a 64-char hex SHA-256', () => {
    for (const hex of golden) {
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('canonicalDigest matches the Python-produced golden roots for every fixture', () => {
    const mismatches: { index: number; got: string; want: string }[] = [];
    for (let i = 0; i < fixtures.length; i++) {
      const got = canonicalDigest(fixtures[i]);
      if (got !== golden[i]) {
        mismatches.push({ index: i, got, want: golden[i] });
        if (mismatches.length >= 5) break;
      }
    }
    expect(mismatches).toEqual([]);
  });
});
