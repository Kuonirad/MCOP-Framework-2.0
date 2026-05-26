import { createHash } from 'node:crypto';

import {
  EMPTY_TREE_ROOT,
  hashLeaf,
  hashNode,
  inclusionProof,
  isHexSha256,
  largestPowerOfTwoBelow,
  merkleRoot,
  verifyProof,
  type ProofStep,
} from '../provenance/merkleTree';

const enc = (s: string): Buffer => Buffer.from(s, 'utf8');

describe('merkleTree — leaf/node hashing (RFC 6962 domain separation)', () => {
  it('hashLeaf prefixes 0x00', () => {
    const entry = enc('abc');
    const expected = createHash('sha256').update(Buffer.concat([Buffer.of(0x00), entry])).digest('hex');
    expect(hashLeaf(entry).toString('hex')).toBe(expected);
  });

  it('hashNode prefixes 0x01', () => {
    const l = hashLeaf(enc('a'));
    const r = hashLeaf(enc('b'));
    const expected = createHash('sha256').update(Buffer.concat([Buffer.of(0x01), l, r])).digest('hex');
    expect(hashNode(l, r).toString('hex')).toBe(expected);
  });

  it('leaf and node domains never collide', () => {
    // A leaf whose entry equals (left||right) must not hash like the node.
    const l = hashLeaf(enc('a'));
    const r = hashLeaf(enc('b'));
    const leafOverConcat = hashLeaf(Buffer.concat([l, r]));
    expect(leafOverConcat.equals(hashNode(l, r))).toBe(false);
  });
});

describe('merkleTree — merkleRoot', () => {
  it('empty tree is SHA-256 of empty input', () => {
    expect(merkleRoot([]).equals(EMPTY_TREE_ROOT)).toBe(true);
    expect(EMPTY_TREE_ROOT.toString('hex')).toBe(createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  });

  it('single leaf root is the leaf hash', () => {
    expect(merkleRoot([enc('x')]).equals(hashLeaf(enc('x')))).toBe(true);
  });

  it('two-leaf root is hashNode(leaf0, leaf1)', () => {
    const a = enc('a');
    const b = enc('b');
    expect(merkleRoot([a, b]).equals(hashNode(hashLeaf(a), hashLeaf(b)))).toBe(true);
  });

  it('three-leaf root splits at k=2 (RFC 6962)', () => {
    const [a, b, c] = [enc('a'), enc('b'), enc('c')];
    const left = hashNode(hashLeaf(a), hashLeaf(b));
    const right = hashLeaf(c);
    expect(merkleRoot([a, b, c]).equals(hashNode(left, right))).toBe(true);
  });

  it('is order-sensitive', () => {
    const a = enc('a');
    const b = enc('b');
    expect(merkleRoot([a, b]).equals(merkleRoot([b, a]))).toBe(false);
  });
});

describe('merkleTree — largestPowerOfTwoBelow', () => {
  it('matches the RFC definition for small n', () => {
    expect(largestPowerOfTwoBelow(2)).toBe(1);
    expect(largestPowerOfTwoBelow(3)).toBe(2);
    expect(largestPowerOfTwoBelow(4)).toBe(2);
    expect(largestPowerOfTwoBelow(5)).toBe(4);
    expect(largestPowerOfTwoBelow(8)).toBe(4);
    expect(largestPowerOfTwoBelow(9)).toBe(8);
    expect(largestPowerOfTwoBelow(16)).toBe(8);
    expect(largestPowerOfTwoBelow(17)).toBe(16);
  });

  it('throws for n < 2 or non-integers', () => {
    expect(() => largestPowerOfTwoBelow(1)).toThrow(RangeError);
    expect(() => largestPowerOfTwoBelow(0)).toThrow(RangeError);
    expect(() => largestPowerOfTwoBelow(2.5)).toThrow(RangeError);
  });
});

describe('merkleTree — inclusionProof + verifyProof round trip', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 13, 16, 17]) {
    it(`every leaf of a ${n}-leaf tree proves inclusion`, () => {
      const leaves = Array.from({ length: n }, (_, i) => enc(`leaf-${i}`));
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        const proof = inclusionProof(leaves, i);
        expect(verifyProof(leaves[i], proof, root)).toBe(true);
        // Proof length is ceil(log2(n)) — compact, not the whole leaf set.
        expect(proof.length).toBeLessThanOrEqual(Math.ceil(Math.log2(Math.max(2, n))));
      }
    });
  }

  it('single-leaf proof is empty', () => {
    expect(inclusionProof([enc('only')], 0)).toEqual([]);
  });

  it('throws on empty tree and out-of-range index', () => {
    expect(() => inclusionProof([], 0)).toThrow(RangeError);
    expect(() => inclusionProof([enc('a')], 1)).toThrow(RangeError);
    expect(() => inclusionProof([enc('a')], -1)).toThrow(RangeError);
    expect(() => inclusionProof([enc('a')], 0.5)).toThrow(RangeError);
  });
});

describe('merkleTree — verifyProof rejects tampering', () => {
  const leaves = Array.from({ length: 6 }, (_, i) => enc(`m-${i}`));
  const root = merkleRoot(leaves);
  const index = 2;
  const proof = inclusionProof(leaves, index);

  it('rejects a wrong leaf entry', () => {
    expect(verifyProof(enc('not-the-leaf'), proof, root)).toBe(false);
  });

  it('rejects a tampered sibling', () => {
    const tampered: ProofStep[] = proof.map((s, i) =>
      i === 0 ? { sibling: 'f'.repeat(64), side: s.side } : s,
    );
    expect(verifyProof(leaves[index], tampered, root)).toBe(false);
  });

  it('rejects a flipped side', () => {
    const flipped: ProofStep[] = proof.map((s, i) =>
      i === 0 ? { sibling: s.sibling, side: s.side === 'left' ? 'right' : 'left' } : s,
    );
    // Flipping the side at a level with distinct siblings changes the fold.
    expect(verifyProof(leaves[index], flipped, root)).toBe(false);
  });

  it('rejects malformed sibling hex', () => {
    const bad = [{ sibling: 'xyz', side: 'left' as const }];
    expect(verifyProof(leaves[index], bad, root)).toBe(false);
    const wrongLen = [{ sibling: 'ab', side: 'left' as const }];
    expect(verifyProof(leaves[index], wrongLen, root)).toBe(false);
  });

  it('rejects an unknown side value', () => {
    const weird = [{ sibling: 'a'.repeat(64), side: 'up' as unknown as 'left' }];
    expect(verifyProof(leaves[index], weird, root)).toBe(false);
  });

  it('rejects a root of wrong length', () => {
    const proof0 = inclusionProof(leaves, 0);
    expect(verifyProof(leaves[0], proof0, Buffer.alloc(16))).toBe(false);
  });
});

describe('merkleTree — isHexSha256', () => {
  it('accepts 64-char hex, rejects everything else', () => {
    expect(isHexSha256('a'.repeat(64))).toBe(true);
    expect(isHexSha256('A'.repeat(64))).toBe(true);
    expect(isHexSha256('a'.repeat(63))).toBe(false);
    expect(isHexSha256('g'.repeat(64))).toBe(false);
    expect(isHexSha256(123)).toBe(false);
    expect(isHexSha256(null)).toBe(false);
    expect(isHexSha256(undefined)).toBe(false);
  });
});
