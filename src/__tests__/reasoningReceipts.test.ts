// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  EMPTY_SESSION_ROOT,
  leafEntryForClaim,
  MerkleMountainRange,
  REASONING_RECEIPT_EPOCH,
  REASONING_RECEIPT_VERSION,
  ReasoningSession,
  receiptMatchesAnchor,
  verifyBundle,
  verifyInclusionProof,
  verifyReceipt,
  type ReasoningReceipt,
} from '../core/reasoningReceipts';
import { canonicalDigest } from '../core/canonicalEncoding';
import { merkleRoot } from '../provenance/merkleTree';

describe('reasoningReceipts — leaf entry parity', () => {
  test('portable leaf entry is byte-identical to the Node canonicalDigest', () => {
    const claims = [
      'hello',
      { a: 1, b: [2, 3], c: 'τ ≈ 0.7816' },
      { nested: { x: true, y: null, z: 1.5 } },
      [1, 2, 3],
      42,
    ];
    for (const claim of claims) {
      expect(leafEntryForClaim(claim)).toBe(canonicalDigest(claim));
    }
  });

  test('empty session root is the RFC 6962 empty-tree root H("")', () => {
    // H("") = e3b0c442... (SHA-256 of the empty string).
    expect(EMPTY_SESSION_ROOT).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(new MerkleMountainRange().root()).toBe(EMPTY_SESSION_ROOT);
  });
});

describe('MerkleMountainRange — structure', () => {
  function entry(i: number): string {
    return leafEntryForClaim({ claim: i });
  }

  test('power-of-two sessions collapse to one peak whose root equals RFC 6962 merkleRoot', () => {
    for (const n of [1, 2, 4, 8, 16]) {
      const mmr = new MerkleMountainRange();
      const entries: string[] = [];
      for (let i = 0; i < n; i++) {
        const e = entry(i);
        entries.push(e);
        mmr.append(e);
      }
      expect(mmr.peakHashes()).toHaveLength(1);
      const rfc6962 = merkleRoot(entries.map((h) => Buffer.from(h, 'hex'))).toString('hex');
      expect(mmr.root()).toBe(rfc6962);
    }
  });

  test('peak count equals the popcount of the leaf count', () => {
    const mmr = new MerkleMountainRange();
    for (let i = 0; i < 11; i++) mmr.append(entry(i)); // 11 = 1011b → 3 peaks
    expect(mmr.peakHashes()).toHaveLength(3);
    expect(mmr.size).toBe(11);
  });

  test('proof size is logarithmic in session size', () => {
    const mmr = new MerkleMountainRange();
    const n = 1000;
    for (let i = 0; i < n; i++) mmr.append(entry(i));
    for (const idx of [0, 1, 500, 999]) {
      // O(log n): comfortably under 2*ceil(log2 n) ≈ 20 steps for n = 1000.
      expect(mmr.proof(idx).length).toBeLessThanOrEqual(20);
    }
  });

  test('every leaf in every session size verifies against the current root', () => {
    // Exhaustive over awkward sizes (non-power-of-two, multi-peak).
    for (let n = 1; n <= 33; n++) {
      const mmr = new MerkleMountainRange();
      const entries: string[] = [];
      for (let i = 0; i < n; i++) {
        const e = entry(i);
        entries.push(e);
        mmr.append(e);
      }
      const root = mmr.root();
      for (let i = 0; i < n; i++) {
        const proof = mmr.proof(i);
        expect(verifyInclusionProof(entries[i], proof, root)).toBe(true);
      }
    }
  });

  test('append rejects non-hex leaf entries', () => {
    expect(() => new MerkleMountainRange().append('not-a-hash')).toThrow();
  });

  test('proof rejects out-of-range indices', () => {
    const mmr = new MerkleMountainRange();
    mmr.append(entry(0));
    expect(() => mmr.proof(1)).toThrow(RangeError);
    expect(() => mmr.proof(-1)).toThrow(RangeError);
  });
});

describe('verifyInclusionProof — tamper detection', () => {
  function build(n: number): { entries: string[]; mmr: MerkleMountainRange } {
    const mmr = new MerkleMountainRange();
    const entries: string[] = [];
    for (let i = 0; i < n; i++) {
      const e = leafEntryForClaim({ step: i });
      entries.push(e);
      mmr.append(e);
    }
    return { entries, mmr };
  }

  test('a wrong leaf entry fails against a valid proof', () => {
    const { entries, mmr } = build(7);
    const root = mmr.root();
    const proof = mmr.proof(3);
    const forged = leafEntryForClaim({ step: 999 });
    expect(verifyInclusionProof(forged, proof, root)).toBe(false);
    expect(verifyInclusionProof(entries[3], proof, root)).toBe(true);
  });

  test('a flipped proof step fails', () => {
    const { entries, mmr } = build(7);
    const root = mmr.root();
    const proof = mmr.proof(2);
    const tampered = proof.map((s, i) =>
      i === 0 ? { sibling: s.sibling, side: s.side === 'left' ? ('right' as const) : ('left' as const) } : s,
    );
    expect(verifyInclusionProof(entries[2], tampered, root)).toBe(false);
  });

  test('a wrong root fails', () => {
    const { entries, mmr } = build(7);
    const proof = mmr.proof(5);
    const wrongRoot = leafEntryForClaim({ not: 'the root' });
    expect(verifyInclusionProof(entries[5], proof, wrongRoot)).toBe(false);
  });

  test('malformed hex is rejected, not thrown', () => {
    const { entries, mmr } = build(4);
    const root = mmr.root();
    const proof = [{ sibling: 'zz', side: 'left' as const }];
    expect(verifyInclusionProof(entries[0], proof, root)).toBe(false);
  });
});

describe('ReasoningSession — receipts', () => {
  function session(): ReasoningSession {
    const s = new ReasoningSession('D1 calibration walkthrough');
    s.addClaim({ id: 0, text: 'Hash tensors are i.i.d. ⇒ cosine ~ Normal(0, 1/M).' });
    s.addClaim({ id: 1, text: 'Tiling saturates effective dimensionality at M = 32.' });
    s.addClaim({ id: 2, text: 'τ(32, 0.01, 2048) ≈ 0.7816.' });
    s.addClaim({ id: 3, text: 'Legacy 0.65 admits a 21.5% false-resonance rate.' });
    s.addClaim({ id: 4, text: 'Therefore the default is calibrated, not magic.' });
    return s;
  }

  test('each receipt carries version, epoch, and verifies', () => {
    const s = session();
    for (let i = 0; i < s.size; i++) {
      const r = s.receiptFor(i);
      expect(r.version).toBe(REASONING_RECEIPT_VERSION);
      expect(r.epoch).toBe(REASONING_RECEIPT_EPOCH);
      expect(r.leafIndex).toBe(i);
      expect(r.root).toBe(s.root());
      expect(verifyReceipt(r)).toEqual({ valid: true });
      expect(receiptMatchesAnchor(r, s.root())).toBe(true);
    }
  });

  test('editing the claim after issuance breaks the receipt (claim-leaf-mismatch)', () => {
    const r = session().receiptFor(2);
    const tampered: ReasoningReceipt = { ...r, claim: { id: 2, text: 'τ ≈ 0.42 (forged)' } };
    expect(verifyReceipt(tampered)).toEqual({ valid: false, reason: 'claim-leaf-mismatch' });
  });

  test('editing the leaf entry without re-sealing breaks the receipt id', () => {
    const r = session().receiptFor(1);
    const tampered: ReasoningReceipt = { ...r, leafEntry: leafEntryForClaim({ id: 1, text: 'other' }) };
    expect(verifyReceipt(tampered).valid).toBe(false);
  });

  test('an unrecognised epoch is refused, not guessed', () => {
    const r = session().receiptFor(0);
    const tampered = { ...r, epoch: 'mmr-rfc6962-sha256/2' } as unknown as ReasoningReceipt;
    expect(verifyReceipt(tampered)).toEqual({ valid: false, reason: 'unknown-epoch' });
  });

  test('a receipt from one session does not verify against another root', () => {
    const a = session();
    const b = new ReasoningSession('different');
    b.addClaim({ id: 0, text: 'unrelated' });
    const receipt = a.receiptFor(0);
    expect(receiptMatchesAnchor(receipt, b.root())).toBe(false);
  });
});

describe('verifyBundle — the reader-as-verifier path', () => {
  test('a clean export is all-valid', () => {
    const s = new ReasoningSession('demo');
    for (let i = 0; i < 9; i++) s.addClaim({ i, note: `claim ${i}` });
    const bundle = s.export();
    const result = verifyBundle(bundle);
    expect(result.allValid).toBe(true);
    expect(result.results).toHaveLength(9);
  });

  test('a tampered claim in the bundle is pinpointed', () => {
    const s = new ReasoningSession('demo');
    for (let i = 0; i < 6; i++) s.addClaim({ i });
    const bundle = s.export();
    const claims = bundle.claims.slice();
    claims[3] = { i: 3, injected: true };
    const tampered = { ...bundle, claims };
    // The receipts still witness the original claims, so the bundle root no
    // longer matches the (now-edited) claim at index 3 once re-derived. The
    // receipt for index 3 carries the *original* claim, so re-exporting from
    // edited claims would change its leaf — emulate a forged receipt instead:
    const forgedReceipts = bundle.receipts.map((r) =>
      r.leafIndex === 3 ? { ...r, claim: claims[3] } : r,
    );
    const result = verifyBundle({ ...tampered, receipts: forgedReceipts });
    expect(result.allValid).toBe(false);
    const bad = result.results.find((r) => !r.valid);
    expect(bad?.leafIndex).toBe(3);
  });

  // Regression coverage for the bundle-level analog of the unsealed-shot fix
  // (#823): a forger appending unsealed entries to `bundle.claims` (and/or
  // inflating `bundle.size`) without touching the root or the legitimate
  // receipts must not pass `verifyBundle`. Iterating only `bundle.receipts`
  // would silently accept these.
  test('appended unsealed claims (and an inflated size) fail with unsealed-claim', () => {
    const s = new ReasoningSession('demo');
    for (let i = 0; i < 5; i++) s.addClaim({ i, note: `claim ${i}` });
    const bundle = s.export();
    const forged = {
      ...bundle,
      size: 100, // the displayed-but-unverified count
      claims: [
        ...bundle.claims,
        { i: 100, note: 'forged unsealed claim — never went into the MMR' },
        { i: 101, note: 'another forged claim' },
      ],
    };
    const result = verifyBundle(forged);
    expect(result.allValid).toBe(false);
    expect(result.sizeMismatch).toEqual({ declared: 100, actual: 5 });
    const unsealed = result.results.filter((r) => r.reason === 'unsealed-claim');
    expect(unsealed).toHaveLength(2);
    expect(unsealed.map((r) => r.leafIndex).sort()).toEqual([5, 6]);
  });

  test('an orphan receipt with no matching claim is flagged', () => {
    const s = new ReasoningSession('demo');
    for (let i = 0; i < 4; i++) s.addClaim({ i });
    const bundle = s.export();
    // Truncate the displayed claim list. A consumer iterating bundle.claims
    // would render a 3-claim session anchored to a 4-claim root — silently
    // dropping a credit-bearing entry.
    const forged = { ...bundle, claims: bundle.claims.slice(0, 3) };
    const result = verifyBundle(forged);
    expect(result.allValid).toBe(false);
    const orphan = result.results.find((r) => r.reason === 'orphan-receipt');
    expect(orphan).toBeDefined();
    expect(orphan?.leafIndex).toBe(3);
  });

  test('an inflated size alone (counts otherwise consistent) is rejected', () => {
    const s = new ReasoningSession('demo');
    for (let i = 0; i < 3; i++) s.addClaim({ i });
    const bundle = s.export();
    const forged = { ...bundle, size: 99 };
    const result = verifyBundle(forged);
    expect(result.allValid).toBe(false);
    expect(result.sizeMismatch).toEqual({ declared: 99, actual: 3 });
    // Per-position results are still all valid: the lie is only in `size`.
    expect(result.results.every((r) => r.valid)).toBe(true);
  });

  test('bundle.claims and receipt.claim disagreement at the same index is caught', () => {
    const s = new ReasoningSession('demo');
    for (let i = 0; i < 3; i++) s.addClaim({ i, note: `claim ${i}` });
    const bundle = s.export();
    const claims = bundle.claims.slice();
    claims[1] = { i: 1, note: 'displayed-only forgery (receipt unchanged)' };
    const result = verifyBundle({ ...bundle, claims });
    expect(result.allValid).toBe(false);
    const bad = result.results.find((r) => !r.valid);
    expect(bad?.leafIndex).toBe(1);
    expect(bad?.reason).toBe('claim-bundle-mismatch');
  });
});
