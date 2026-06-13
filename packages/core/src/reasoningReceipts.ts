// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Verifiable reasoning receipts — an append-only Merkle Mountain Range (MMR)
 * over a reasoning session, where every claim carries a few-kilobyte receipt
 * that a reader's browser can verify locally against a published root.
 *
 * Why an MMR instead of the linear hash chain
 * -------------------------------------------
 * The classic provenance chain (`provenanceTracer.ts`) links each event to the
 * previous one by `parentHash`. Proving that one specific event belongs to the
 * chain means *replaying every event up to it* — O(n) work and O(n) data. An
 * MMR is an append-only accumulator: appending a claim is O(log n), and an
 * inclusion proof is a single O(log n) audit path. The reader downloads a few
 * kilobytes, not the whole transcript, and confirms `claim ∈ session` against
 * one published root.
 *
 * Substrate (shared, byte-identical across runtimes)
 * --------------------------------------------------
 *   - **Claim → leaf entry:** RFC 8785 canonical JSON, SHA-256. Identical to
 *     {@link ./canonicalEncoding}.canonicalDigest, but computed through the
 *     portable SHA-256 ({@link ./universalCrypto}) so it runs in a browser with
 *     no Node globals — the same NovaNeoWeb substrate the encoder already uses.
 *   - **Tree:** RFC 6962 leaf/interior hashing with `0x00`/`0x01` domain
 *     separation, identical to {@link ../provenance/merkleTree} and
 *     `mcop_package/mcop/merkle.py`. Interior nodes can never be replayed as
 *     leaves (second-preimage resistance).
 *
 * Because an MMR whose leaf count is a power of two collapses to a single peak,
 * its root is *bit-for-bit identical* to the RFC 6962 `merkleRoot` over the same
 * leaves — so this module inherits the existing cross-runtime Merkle parity
 * guarantees for those sizes, and its inclusion proofs are the same
 * self-describing `{sibling, side}` audit paths that the parity-locked
 * `verifyProof` already consumes.
 *
 * Trust boundary (read this before quoting a receipt)
 * ---------------------------------------------------
 * A valid receipt proves exactly one thing: *this claim was committed to a
 * session whose root is R, and the session has not been altered since.* It does
 * **not** prove the claim is true, that the reasoning was sound, or that R is
 * the root you should trust — that last step requires independently anchoring R
 * (a published root, a signature, a transparency log). Determinism makes the
 * computation replayable; it does not make it wise. Any prose built on these
 * receipts must say so or it overclaims.
 *
 * @see docs/VERIFIABLE_RECEIPTS.md for the full derivation, the bagging
 *      convention, and the reader-as-verifier artifact.
 */

import canonicalize from 'canonicalize';
import { sha256Bytes, bytesToHex } from './universalCrypto';

/** Receipt envelope version. Bump on any wire-format change. */
export const REASONING_RECEIPT_VERSION = 'mcop-reasoning-receipt/1.0' as const;

/**
 * Hashing epoch — a self-describing marker of the accumulator construction.
 * Receipts and sessions carry it so a future migration (e.g. a different tree
 * shape or hash) is detectable rather than silent: a verifier that does not
 * recognise the epoch must refuse rather than guess. This is the migration
 * guard the linear chain lacked.
 */
export const REASONING_RECEIPT_EPOCH = 'mmr-rfc6962-sha256/1' as const;

/** Domain-separation prefixes (RFC 6962): leaves `0x00`, interior nodes `0x01`. */
const LEAF_PREFIX = Uint8Array.of(0x00);
const NODE_PREFIX = Uint8Array.of(0x01);

export type ProofSide = 'left' | 'right';

/**
 * One level of an inclusion proof. `sibling` is the hex-encoded SHA-256 of the
 * sibling subtree; `side` says whether it sits to the `left` or `right` of the
 * running hash while folding the proof from the leaf upward.
 */
export interface ProofStep {
  readonly sibling: string;
  readonly side: ProofSide;
}

/**
 * A verifiable reasoning receipt. Self-contained: a reader needs only the
 * receipt and the published root to confirm `claim ∈ session`.
 */
export interface ReasoningReceipt {
  readonly version: typeof REASONING_RECEIPT_VERSION;
  readonly epoch: typeof REASONING_RECEIPT_EPOCH;
  /** The reasoning claim, exactly as committed. */
  readonly claim: unknown;
  /** RFC 8785 canonical digest of `claim` — the tree leaf entry (64 hex). */
  readonly leafEntry: string;
  /** Zero-based position of this claim in the append-only session. */
  readonly leafIndex: number;
  /** Number of leaves in the session the proof is anchored to. */
  readonly size: number;
  /** Audit path, leaf → root. */
  readonly proof: ReadonlyArray<ProofStep>;
  /** Bagged MMR root the proof reconstructs (64 hex). */
  readonly root: string;
  /** Canonical digest of the receipt body — tamper-evidence on the receipt. */
  readonly receiptId: string;
}

/** A published reasoning session: every claim plus its receipt and the root. */
export interface ReasoningSessionBundle {
  readonly version: typeof REASONING_RECEIPT_VERSION;
  readonly epoch: typeof REASONING_RECEIPT_EPOCH;
  readonly title?: string;
  readonly root: string;
  readonly size: number;
  readonly claims: ReadonlyArray<unknown>;
  readonly receipts: ReadonlyArray<ReasoningReceipt>;
}

/** Outcome of verifying a receipt. `reason` is present only when invalid. */
export interface ReceiptVerification {
  readonly valid: boolean;
  readonly reason?:
    | 'unknown-epoch'
    | 'claim-leaf-mismatch'
    | 'receipt-id-mismatch'
    | 'proof-invalid'
    | 'malformed';
}

/* ----------------------------------------------------------------------- *
 * Portable hashing primitives (browser + node + edge)
 * ----------------------------------------------------------------------- */

function concatBytes(...chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** Whether `value` is a 64-char hex SHA-256 string. */
export function isHexSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

/** `H(0x00 || entry)` over a 32-byte hex leaf entry → 64-hex node hash. */
function hashLeafHex(entryHex: string): string {
  return bytesToHex(sha256Bytes(concatBytes(LEAF_PREFIX, hexToBytes(entryHex))));
}

/** `H(0x01 || left || right)` over two 64-hex child hashes → 64-hex node hash. */
function hashNodeHex(leftHex: string, rightHex: string): string {
  return bytesToHex(sha256Bytes(concatBytes(NODE_PREFIX, hexToBytes(leftHex), hexToBytes(rightHex))));
}

/** Root of the empty tree, `H()` (RFC 6962 §2.1). */
export const EMPTY_SESSION_ROOT = bytesToHex(sha256Bytes(new Uint8Array(0)));

/**
 * RFC 8785 canonical digest computed through the portable SHA-256 — the leaf
 * entry for a claim. Byte-identical to `canonicalEncoding.canonicalDigest`
 * (both SHA-256 the same canonical UTF-8 string) but with no Node dependency,
 * so it runs unchanged in a browser. A parity test pins the equality.
 */
export function leafEntryForClaim(claim: unknown): string {
  const raw = canonicalize(claim) ?? '{}';
  return bytesToHex(sha256Bytes(raw));
}

/**
 * Bag a non-empty, left-to-right (height-descending) peak list into the MMR
 * root by a right fold:
 *
 *     bag([p0, p1, ..., pk]) = H(p0, H(p1, ... H(p_{k-1}, pk)))
 *
 * A single peak bags to itself, so a power-of-two session's root equals the
 * RFC 6962 `merkleRoot` over the same leaves.
 */
function bagPeaks(peakHashes: ReadonlyArray<string>): string {
  if (peakHashes.length === 0) return EMPTY_SESSION_ROOT;
  let acc = peakHashes[peakHashes.length - 1];
  for (let i = peakHashes.length - 2; i >= 0; i--) {
    acc = hashNodeHex(peakHashes[i], acc);
  }
  return acc;
}

/* ----------------------------------------------------------------------- *
 * Merkle Mountain Range
 * ----------------------------------------------------------------------- */

interface MmrNode {
  readonly hash: string;
  readonly height: number;
  /** Number of leaves under this node (a power of two). */
  readonly size: number;
  readonly left?: MmrNode;
  readonly right?: MmrNode;
}

/**
 * Append-only Merkle Mountain Range. Retains the node objects so inclusion
 * proofs for any past leaf can be generated in O(log n) without the leaf set.
 * Memory is O(n) — appropriate for a reasoning session (thousands of claims),
 * not a chain of millions.
 */
export class MerkleMountainRange {
  /** Peaks, left → right, strictly descending height. */
  private peaks: MmrNode[] = [];
  private leafCount = 0;

  /** Append a 32-byte hex leaf entry; returns its zero-based leaf index. */
  append(leafEntryHex: string): number {
    if (!isHexSha256(leafEntryHex)) {
      throw new Error(`MerkleMountainRange.append: expected 64-hex leaf entry, got ${String(leafEntryHex)}`);
    }
    const index = this.leafCount;
    this.leafCount += 1;

    let node: MmrNode = { hash: hashLeafHex(leafEntryHex), height: 0, size: 1 };
    // Merge equal-height peaks (carry propagation, like binary increment).
    while (this.peaks.length > 0 && this.peaks[this.peaks.length - 1].height === node.height) {
      const left = this.peaks.pop() as MmrNode;
      node = {
        hash: hashNodeHex(left.hash, node.hash),
        height: left.height + 1,
        size: left.size + node.size,
        left,
        right: node,
      };
    }
    this.peaks.push(node);
    return index;
  }

  get size(): number {
    return this.leafCount;
  }

  /** Peak hashes, left → right. */
  peakHashes(): string[] {
    return this.peaks.map((p) => p.hash);
  }

  /** Current bagged root. */
  root(): string {
    return bagPeaks(this.peakHashes());
  }

  /**
   * Build the inclusion proof (leaf → root) for `leafIndex`: the audit path
   * within the leaf's mountain, then the steps that bag the remaining peaks.
   */
  proof(leafIndex: number): ProofStep[] {
    if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= this.leafCount) {
      throw new RangeError(`leaf index ${leafIndex} out of range for ${this.leafCount} leaves`);
    }

    // 1. Locate the peak whose mountain contains this leaf.
    let offset = 0;
    let peakIdx = -1;
    for (let i = 0; i < this.peaks.length; i++) {
      if (leafIndex < offset + this.peaks[i].size) {
        peakIdx = i;
        break;
      }
      offset += this.peaks[i].size;
    }
    const peak = this.peaks[peakIdx];

    // 2. Walk down the mountain to the leaf, collecting siblings (top → down),
    //    then reverse to leaf → up.
    const downward: ProofStep[] = [];
    let node = peak;
    let localIndex = leafIndex - offset; // index within this perfect subtree
    while (node.height > 0) {
      const left = node.left as MmrNode;
      const right = node.right as MmrNode;
      if (localIndex < left.size) {
        downward.push({ sibling: right.hash, side: 'right' });
        node = left;
      } else {
        downward.push({ sibling: left.hash, side: 'left' });
        node = right;
        localIndex -= left.size;
      }
    }
    const steps: ProofStep[] = downward.reverse();

    // 3. Bag the remaining peaks. The bagging spine is a right fold, so the
    //    peaks to the right of ours collapse into one sibling on the right,
    //    and each peak to the left is a sibling on the left.
    const peakHashes = this.peakHashes();
    if (peakIdx < peakHashes.length - 1) {
      const rightBag = bagPeaks(peakHashes.slice(peakIdx + 1));
      steps.push({ sibling: rightBag, side: 'right' });
    }
    for (let i = peakIdx - 1; i >= 0; i--) {
      steps.push({ sibling: peakHashes[i], side: 'left' });
    }
    return steps;
  }
}

/* ----------------------------------------------------------------------- *
 * Verification (pure, browser-local)
 * ----------------------------------------------------------------------- */

/**
 * Fold an inclusion proof from `leafEntryHex` and return whether it
 * reconstructs `rootHex`. A malformed step makes the proof invalid rather than
 * throwing. This is the entire trust-critical surface a reader runs locally.
 */
export function verifyInclusionProof(
  leafEntryHex: string,
  proof: ReadonlyArray<ProofStep>,
  rootHex: string,
): boolean {
  if (!isHexSha256(leafEntryHex) || !isHexSha256(rootHex)) return false;
  let h = hashLeafHex(leafEntryHex);
  for (const step of proof) {
    if (!isHexSha256(step.sibling)) return false;
    if (step.side === 'left') {
      h = hashNodeHex(step.sibling, h);
    } else if (step.side === 'right') {
      h = hashNodeHex(h, step.sibling);
    } else {
      return false;
    }
  }
  return constantTimeHexEqual(h, rootHex);
}

/**
 * Verify a receipt end to end: the claim hashes to the recorded leaf, the
 * receipt body is untampered, and the proof reconstructs the root. Returns
 * `{ valid: true }` or `{ valid: false, reason }`.
 *
 * This proves `claim ∈ session(root)`. To trust that root, compare it to an
 * independently published one with {@link receiptMatchesAnchor}.
 */
export function verifyReceipt(receipt: ReasoningReceipt): ReceiptVerification {
  if (
    !receipt ||
    receipt.version !== REASONING_RECEIPT_VERSION ||
    typeof receipt.leafEntry !== 'string' ||
    typeof receipt.root !== 'string' ||
    !Array.isArray(receipt.proof)
  ) {
    return { valid: false, reason: 'malformed' };
  }
  if (receipt.epoch !== REASONING_RECEIPT_EPOCH) {
    return { valid: false, reason: 'unknown-epoch' };
  }
  if (leafEntryForClaim(receipt.claim) !== receipt.leafEntry) {
    return { valid: false, reason: 'claim-leaf-mismatch' };
  }
  if (receiptIdFor(receipt) !== receipt.receiptId) {
    return { valid: false, reason: 'receipt-id-mismatch' };
  }
  if (!verifyInclusionProof(receipt.leafEntry, receipt.proof, receipt.root)) {
    return { valid: false, reason: 'proof-invalid' };
  }
  return { valid: true };
}

/**
 * Whether a receipt's root matches an independently published/anchored root.
 * This is the step that turns "internally consistent" into "trustworthy".
 */
export function receiptMatchesAnchor(receipt: ReasoningReceipt, anchoredRoot: string): boolean {
  return isHexSha256(anchoredRoot) && constantTimeHexEqual(receipt.root, anchoredRoot);
}

/** Canonical digest of a receipt body (everything except `receiptId`). */
function receiptIdFor(receipt: ReasoningReceipt): string {
  const body = {
    version: receipt.version,
    epoch: receipt.epoch,
    claim: receipt.claim,
    leafEntry: receipt.leafEntry,
    leafIndex: receipt.leafIndex,
    size: receipt.size,
    proof: receipt.proof.map((s) => ({ sibling: s.sibling, side: s.side })),
    root: receipt.root,
  };
  return leafEntryForClaim(body);
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ----------------------------------------------------------------------- *
 * Reasoning session
 * ----------------------------------------------------------------------- */

/**
 * A reasoning session: append claims, then issue a verifiable receipt for each.
 * The accumulator is append-only, so receipts are anchored to the session size
 * at issue time. Issue receipts after the claims they should witness are in.
 */
export class ReasoningSession {
  private readonly mmr = new MerkleMountainRange();
  private readonly claims: unknown[] = [];

  constructor(private readonly title?: string) {}

  /** Append a claim; returns its leaf index. */
  addClaim(claim: unknown): number {
    this.claims.push(claim);
    return this.mmr.append(leafEntryForClaim(claim));
  }

  get size(): number {
    return this.mmr.size;
  }

  /** Current root over all appended claims. */
  root(): string {
    return this.mmr.root();
  }

  /** Issue a verifiable receipt for the claim at `leafIndex`. */
  receiptFor(leafIndex: number): ReasoningReceipt {
    if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= this.claims.length) {
      throw new RangeError(`leaf index ${leafIndex} out of range for ${this.claims.length} claims`);
    }
    const claim = this.claims[leafIndex];
    const leafEntry = leafEntryForClaim(claim);
    const proof = this.mmr.proof(leafIndex);
    const root = this.mmr.root();
    const base = {
      version: REASONING_RECEIPT_VERSION,
      epoch: REASONING_RECEIPT_EPOCH,
      claim,
      leafEntry,
      leafIndex,
      size: this.mmr.size,
      proof,
      root,
    } as const;
    return { ...base, receiptId: receiptIdFor({ ...base, receiptId: '' }) };
  }

  /** Export the whole session — claims, receipts, and root — as a bundle. */
  export(): ReasoningSessionBundle {
    const receipts: ReasoningReceipt[] = [];
    for (let i = 0; i < this.claims.length; i++) receipts.push(this.receiptFor(i));
    return {
      version: REASONING_RECEIPT_VERSION,
      epoch: REASONING_RECEIPT_EPOCH,
      ...(this.title !== undefined ? { title: this.title } : {}),
      root: this.mmr.root(),
      size: this.mmr.size,
      claims: this.claims.slice(),
      receipts,
    };
  }
}

/**
 * Verify an entire exported bundle: every receipt is internally valid and every
 * receipt's root equals the bundle root. Returns per-claim results plus an
 * `allValid` summary. This is what the reader-as-verifier page runs.
 */
export function verifyBundle(bundle: ReasoningSessionBundle): {
  allValid: boolean;
  results: Array<{ leafIndex: number; valid: boolean; reason?: ReceiptVerification['reason'] }>;
} {
  const results = bundle.receipts.map((receipt) => {
    const v = verifyReceipt(receipt);
    if (v.valid && !receiptMatchesAnchor(receipt, bundle.root)) {
      return { leafIndex: receipt.leafIndex, valid: false, reason: 'proof-invalid' as const };
    }
    return { leafIndex: receipt.leafIndex, valid: v.valid, reason: v.reason };
  });
  return { allValid: results.every((r) => r.valid), results };
}
