/**
 * Cross-Runtime RFC 6962 Merkle-Tree Parity Guardian — TypeScript side.
 *
 * Reads the shared fixtures and asserts that `merkleRoot` + `inclusionProof`
 * reproduce the exact roots and audit paths locked in
 * `tests/parity/merkleTree.golden.json`. The Python counterpart
 * (`mcop_package/tests/parity/test_merkle_tree_parity.py`) hashes the same
 * fixtures against the same golden file, so any byte-level divergence in
 * either runtime's Merkle math fails the affected side.
 *
 * Regenerate after intentionally adding fixtures:
 *
 *     python3 tests/parity/generate_merkle_fixtures.py
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { inclusionProof, merkleRoot, verifyProof, type ProofStep } from '../provenance/merkleTree';

interface Fixture {
  leaves: string[];
  proofIndex: number | null;
}
interface Golden {
  root: string;
  proof: ProofStep[] | null;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_PATH = path.join(REPO_ROOT, 'tests', 'parity', 'merkleTree.fixtures.json');
const GOLDEN_PATH = path.join(REPO_ROOT, 'tests', 'parity', 'merkleTree.golden.json');

function toLeaves(hexes: string[]): Buffer[] {
  return hexes.map((h) => Buffer.from(h, 'hex'));
}

describe('Cross-Runtime RFC 6962 Merkle Parity (TS)', () => {
  const fixtures: Fixture[] = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const golden: Golden[] = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

  it('fixtures and golden entries have the same, non-trivial length', () => {
    expect(fixtures.length).toBe(golden.length);
    expect(fixtures.length).toBeGreaterThanOrEqual(300);
  });

  it('every golden root is a 64-char hex SHA-256', () => {
    for (const g of golden) expect(g.root).toMatch(/^[0-9a-f]{64}$/);
  });

  it('merkleRoot matches the Python-produced golden root for every fixture', () => {
    const mismatches: { index: number; got: string; want: string }[] = [];
    for (let i = 0; i < fixtures.length; i++) {
      const got = merkleRoot(toLeaves(fixtures[i].leaves)).toString('hex');
      if (got !== golden[i].root) {
        mismatches.push({ index: i, got, want: golden[i].root });
        if (mismatches.length >= 5) break;
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('inclusionProof matches the golden audit path for every fixture', () => {
    const mismatches: number[] = [];
    for (let i = 0; i < fixtures.length; i++) {
      const { proofIndex } = fixtures[i];
      if (proofIndex === null) {
        expect(golden[i].proof).toBeNull();
        continue;
      }
      const got = inclusionProof(toLeaves(fixtures[i].leaves), proofIndex);
      if (JSON.stringify(got) !== JSON.stringify(golden[i].proof)) {
        mismatches.push(i);
        if (mismatches.length >= 5) break;
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('every generated proof verifies against its root', () => {
    for (let i = 0; i < fixtures.length; i++) {
      const { leaves, proofIndex } = fixtures[i];
      if (proofIndex === null) continue;
      const bufs = toLeaves(leaves);
      const proof = inclusionProof(bufs, proofIndex);
      const ok = verifyProof(bufs[proofIndex], proof, merkleRoot(bufs));
      expect(ok).toBe(true);
    }
  });
});
