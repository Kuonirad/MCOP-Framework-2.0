/**
 * RFC 6962 binary Merkle tree over raw byte leaves.
 *
 * Cryptographic substrate for the Merkle-rooted model manifest
 * ({@link ./modelManifest}) and Proof-of-Useful-Work receipts
 * ({@link ./pouwReceipt}). It is **byte-identical** to the Python
 * implementation in `mcop_package/mcop/merkle.py`: both operate purely on
 * byte strings, so — unlike {@link ../core/canonicalEncoding} — there is
 * no JSON/float/string-encoding ambiguity to reconcile across runtimes.
 * The pair is locked by the cross-runtime golden test
 * `src/__tests__/merkleTreeParity.test.ts` + `tests/parity/test_merkle_tree_parity.py`.
 *
 * Why RFC 6962 (the Certificate Transparency tree) and not the flat
 * "digest of the sorted leaf list" used by the hosted ledger?
 *
 *   1. **Second-preimage resistance** — leaves are hashed with a `0x00`
 *      prefix and interior nodes with `0x01`, so an interior node can
 *      never be replayed as a leaf.
 *   2. **Compact O(log n) inclusion proofs** — a receipt carries only the
 *      audit path, so a verifier confirms `model_id ∈ manifest` against an
 *      on-chain root without the full leaf set.
 *
 * Specification (RFC 6962 §2.1), with `H = SHA-256`:
 *
 * ```text
 *   MTH({})     = H()                                       // empty tree
 *   MTH({d0})   = H(0x00 || d0)                             // single leaf
 *   MTH(D[0:n]) = H(0x01 || MTH(D[0:k]) || MTH(D[k:n]))     // n > 1
 * ```
 *
 * where `k` is the largest power of two strictly less than `n`.
 */

import { createHash } from 'node:crypto';

/** Domain-separation prefixes (RFC 6962): leaves `0x00`, interior nodes `0x01`. */
export const LEAF_PREFIX = Uint8Array.of(0x00);
export const NODE_PREFIX = Uint8Array.of(0x01);

export type ProofSide = 'left' | 'right';

/**
 * One level of a Merkle audit path. `sibling` is the hex-encoded hash of
 * the sibling subtree; `side` says whether that sibling sits to the
 * `left` or `right` of the running hash during verification.
 */
export interface ProofStep {
  readonly sibling: string; // hex-encoded SHA-256
  readonly side: ProofSide;
}

function sha256(...chunks: ReadonlyArray<Uint8Array>): Buffer {
  const hash = createHash('sha256');
  for (const chunk of chunks) hash.update(chunk);
  return hash.digest();
}

/** `H(0x00 || entry)` — the Merkle hash of a single leaf. */
export function hashLeaf(entry: Uint8Array): Buffer {
  return sha256(LEAF_PREFIX, entry);
}

/** `H(0x01 || left || right)` — the hash of an interior node. */
export function hashNode(left: Uint8Array, right: Uint8Array): Buffer {
  return sha256(NODE_PREFIX, left, right);
}

/** Root of the empty tree, `H()` (RFC 6962 §2.1). */
export const EMPTY_TREE_ROOT: Buffer = sha256();

/** Largest power of two strictly less than `n` (`n >= 2`). */
export function largestPowerOfTwoBelow(n: number): number {
  if (!Number.isInteger(n) || n < 2) {
    throw new RangeError('largestPowerOfTwoBelow requires an integer n >= 2');
  }
  let k = 1;
  while (k << 1 < n) k <<= 1;
  return k;
}

/**
 * Compute the RFC 6962 Merkle tree head over `leaves`. The leaves are raw
 * entries (e.g. 32-byte `model_id` values), **not** pre-hashed.
 */
export function merkleRoot(leaves: ReadonlyArray<Uint8Array>): Buffer {
  const n = leaves.length;
  if (n === 0) return EMPTY_TREE_ROOT;
  if (n === 1) return hashLeaf(leaves[0]);
  const k = largestPowerOfTwoBelow(n);
  return hashNode(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/**
 * Build the audit path proving `leaves[index]` is in the tree. The
 * returned list is ordered from the leaf level upward, exactly as
 * {@link verifyProof} consumes it.
 */
export function inclusionProof(leaves: ReadonlyArray<Uint8Array>, index: number): ProofStep[] {
  const n = leaves.length;
  if (n === 0) throw new RangeError('inclusionProof on empty tree');
  if (!Number.isInteger(index) || index < 0 || index >= n) {
    throw new RangeError(`leaf index ${index} out of range for ${n} leaves`);
  }
  if (n === 1) return [];
  const k = largestPowerOfTwoBelow(n);
  if (index < k) {
    const sub = inclusionProof(leaves.slice(0, k), index);
    sub.push({ sibling: merkleRoot(leaves.slice(k)).toString('hex'), side: 'right' });
    return sub;
  }
  const sub = inclusionProof(leaves.slice(k), index - k);
  sub.push({ sibling: merkleRoot(leaves.slice(0, k)).toString('hex'), side: 'left' });
  return sub;
}

/**
 * Return `true` iff `entry` is provably a leaf under `root`. `entry` is
 * the raw leaf entry (hashed internally with the leaf prefix). Any
 * malformed proof step makes the proof invalid rather than throwing.
 */
export function verifyProof(
  entry: Uint8Array,
  proof: ReadonlyArray<ProofStep>,
  root: Uint8Array,
): boolean {
  let h: Buffer = hashLeaf(entry);
  for (const step of proof) {
    if (!isHexSha256(step.sibling)) return false;
    const sibling = Buffer.from(step.sibling, 'hex');
    if (step.side === 'left') {
      h = hashNode(sibling, h);
    } else if (step.side === 'right') {
      h = hashNode(h, sibling);
    } else {
      return false;
    }
  }
  return timingSafeEqualBytes(h, root);
}

/** Whether `value` is a lowercase-or-uppercase 64-char hex SHA-256 string. */
export function isHexSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
