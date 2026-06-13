# Verifiable Reasoning Receipts

> **TL;DR** — A reasoning session is committed to an append-only **Merkle
> Mountain Range (MMR)**. Every claim gets a few-kilobyte **receipt** carrying
> an `O(log n)` inclusion proof. A reader's browser recomputes each leaf digest
> and folds each proof to one published root, using the same portable SHA-256
> the encoder already runs in-browser. **The reader becomes the verifier** —
> nothing is taken on trust from a badge. Live artifact: [`/verify`](../src/app/verify).

## The problem with a linear chain

The classic provenance chain (`provenanceTracer.ts`) links each event to the
previous by `parentHash`. To prove that one specific event belongs to the chain,
you replay every event up to it: **O(n) work and O(n) data**. That is fine for
tamper-evidence of the whole log, but it is the wrong shape for *"prove this one
claim is in the session"* — the unit a reader actually wants to check.

A Merkle Mountain Range fixes the shape:

| | Linear hash chain | Merkle Mountain Range |
| --- | --- | --- |
| Append a claim | O(1) | O(log n) amortized |
| Prove one claim ∈ session | **O(n) replay** | **O(log n) audit path** |
| Proof size | the whole transcript | a few KB |
| Verifier needs | every prior event | the receipt + one root |

## Construction

### Leaf: claim → entry

```
leafEntry(claim) = SHA-256( RFC-8785-canonical-JSON(claim) )
```

This is byte-identical to [`canonicalEncoding.canonicalDigest`](../src/core/canonicalEncoding.ts),
but `reasoningReceipts.leafEntryForClaim` computes it through the portable
SHA-256 in [`universalCrypto`](../src/core/universalCrypto.ts) so it runs in a
browser with no Node globals. A parity test pins the equality.

### Tree: RFC 6962 over an MMR

Nodes use RFC 6962 domain separation, identical to
[`provenance/merkleTree.ts`](../src/provenance/merkleTree.ts) and
`mcop_package/mcop/merkle.py`:

```
leaf node  = H(0x00 || leafEntry)
interior   = H(0x01 || left || right)
```

The `0x00`/`0x01` prefixes give second-preimage resistance: an interior node can
never be replayed as a leaf.

Claims are appended into a Merkle Mountain Range — a list of perfect binary
trees ("peaks") of strictly descending height. Appending merges equal-height
peaks, exactly like incrementing a binary counter:

```
size 1:   [P0]                 (1 peak,  height 0)
size 2:   [P1]                 (1 peak,  height 1)
size 3:   [P1, P0]             (2 peaks)
size 7:   [P2, P1, P0]         (3 peaks  = popcount(7))
```

### Root: bag the peaks

The root is the peaks folded right to left:

```
bag([p0, p1, …, pk]) = H(0x01 || p0 || H(0x01 || p1 || … || H(0x01 || p_{k-1} || pk)))
```

A single peak bags to itself. **Consequence:** when the leaf count is a power of
two there is exactly one peak, so the MMR root is *bit-for-bit identical* to the
RFC 6962 `merkleRoot` over the same leaves. The test suite uses this to
cross-check the MMR against the already-parity-locked Merkle code.

The empty session's root is `H("")` =
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

### Inclusion proof

A proof for leaf *i* is a single self-describing audit path, leaf → root:

1. the sibling hashes from the leaf up to its peak (within its mountain), then
2. the bagging steps: the other peaks to the right collapse into one sibling on
   the right; each peak to the left is a sibling on the left.

Each step records whether the sibling is on the `left` or `right`, so the
verifier folds the path back to the root without knowing the leaf index. The
proof is the same `{ sibling, side }[]` format the existing parity-locked
`verifyProof` consumes.

## The receipt

```jsonc
{
  "version": "mcop-reasoning-receipt/1.0",
  "epoch":   "mmr-rfc6962-sha256/1",
  "claim":     { /* the reasoning claim, verbatim */ },
  "leafEntry": "…64 hex…",   // canonical digest of claim
  "leafIndex": 4,
  "size":      7,             // session size the proof is anchored to
  "proof":     [ { "sibling": "…", "side": "left" }, … ],
  "root":      "…64 hex…",
  "receiptId": "…64 hex…"     // canonical digest of the body above
}
```

`verifyReceipt` checks, in order: the envelope is well-formed; the **epoch** is
recognised (else it *refuses* rather than guessing); the claim hashes to
`leafEntry`; the body hashes to `receiptId`; and the proof folds to `root`. All
of it is pure, dependency-light, and runs in the browser.

### Epoch marker — the migration guard

The original analysis flagged the one real risk of moving to an MMR: *pre-fork
chains can't produce post-fork proofs.* The `epoch` field is the guard. It names
the accumulator construction, and a verifier that does not recognise the epoch
must refuse. This implementation is **additive** — it does not mutate or fork
the existing linear provenance chain, which keeps working unchanged — so there
is no destructive migration here. If a future change alters the tree shape or
hash, bump the epoch; old receipts stay self-describing and old verifiers fail
closed instead of silently accepting a mismatched proof.

## Trust boundary — read before quoting a receipt

A valid receipt proves **exactly one thing**:

> this claim was committed to a session whose root is *R*, and the session has
> not been altered since.

It does **not** prove:

- that the claim is **true**,
- that the reasoning was **sound**, or
- that *R* is a root you should **trust**.

Determinism makes a computation **replayable**; it does not make it **wise**.
Trusting *R* is a separate step — `receiptMatchesAnchor(receipt, anchoredRoot)`
compares the receipt's root to one you obtained independently (a published root,
a signature, a transparency-log entry). The `/verify` page pins the published
root and says all of this in plain language on the page itself, so the artifact
does not overclaim.

## Why mainstream frameworks structurally can't ship this

Per [`COMPARISONS.md`](../COMPARISONS.md), the property stack here is
*determinism + chained provenance + a universal runtime*. Receipts are the form
that makes it **checkable by the reader** rather than asserted: the verifier is
a few hundred lines of portable SHA-256 and proof-folding that the reader runs
locally, and the **same** `leafEntryForClaim` + proof-folding run in Node, in
the browser, and in Python — byte for byte. A framework whose provenance is
non-deterministic, or whose runtime can't execute the verifier where the reader
is, cannot offer a receipt the reader can independently fold.

## Cross-runtime byte-identity

The accumulator is identical across runtimes by construction (it composes the
already-parity-locked `canonical_digest` and RFC 6962 `merkle` primitives). It
is also pinned by a golden fixture:

- **Generator (Python):** `tests/parity/generate_reasoning_receipts_fixtures.py`
  builds a fixed 7-claim session (the D1 calibration argument) and writes
  `tests/parity/reasoningReceipts.golden.json` and the byte-identical published
  bundle `public/receipts/d1-calibration.json`. Root:
  `62492c3704c63ba63b7c98eabb3fd740ed90ef88fb326026c9d13396b2492e46`.
- **TS parity** (`src/__tests__/reasoningReceiptsParity.test.ts`) rebuilds the
  session and asserts the TypeScript runtime regenerates every Python receipt
  byte-for-byte and verifies them.
- **Python parity** (`mcop_package/tests/parity/test_reasoning_receipts_parity.py`)
  checks the mirror direction.

Regenerate after intentionally changing the fixture:

```bash
python3 tests/parity/generate_reasoning_receipts_fixtures.py
```

## Public API

From `@kullailabs/mcop-core` (and `src/core`):

| Symbol | Purpose |
| --- | --- |
| `ReasoningSession` | Append claims, issue receipts, `export()` a bundle. |
| `MerkleMountainRange` | The append-only accumulator (`append`, `root`, `proof`). |
| `leafEntryForClaim(claim)` | Portable canonical leaf digest. |
| `verifyReceipt(receipt)` | Full receipt check → `{ valid, reason? }`. |
| `verifyInclusionProof(entry, proof, root)` | The trust-critical fold. |
| `receiptMatchesAnchor(receipt, root)` | Anchor the root you trust. |
| `verifyBundle(bundle)` | Verify a whole exported session. |

## Limitations

- The receipt proves membership and integrity, not correctness or wisdom (see
  the trust boundary).
- Anchoring the root is out of scope here; without an independent anchor a
  self-consistent bundle proves only internal consistency.
- The MMR retains node objects, so memory is O(n) — sized for reasoning
  sessions (thousands of claims), not chains of millions.
- The embedding of a receipt is only as small as the claim it carries; very
  large claim payloads dominate the few-kilobyte proof.
