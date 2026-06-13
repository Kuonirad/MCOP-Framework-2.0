# Identical cognition state, byte for byte, across four runtimes

> **Preprint scaffold v0.1 — the headline claim.** This reframes the MCOP
> reproducibility story around the property a referee can check in ninety
> seconds, not a throughput number that invites hardware quibbles.

* **Authors.** Kevin Kull · MCOP Framework 2.0 contributors.
* **Repository.** `Kuonirad/MCOP-Framework-2.0`.
* **Claim artifact.** `docs/benchmarks/byte-identity-manifest.json` (emitted by the guardian).
* **Golden.** `tests/parity/byteIdentity.golden.json`.
* **License.** Apache-2.0.

---

## Abstract

We make one narrow, falsifiable claim and ship the means to check it: **the
cognition-state digest of MCOP Framework 2.0 is byte-identical across four
independent runtimes.** Every provenance hash in the system — NOVA-NEO tensors,
Stigmergy traces, Holographic Etch records, reasoning-receipt leaves, and
film-shot records — rests on a single substrate,
`SHA-256(RFC-8785-canonical-JSON(payload))`. A shared fixture of
representative cognition-state payloads is hashed through Node's native
`crypto`, a portable pure-JavaScript SHA-256, the W3C WebCrypto `subtle` API,
and Python's `hashlib`. All four produce the same digest, including the
float-and-unicode serialisation edge cases (signed zero, `1e21`, non-BMP code
points) where naive JSON serialisation diverges across languages. A referee
verifies the entire claim in about ninety seconds without trusting our hardware,
because the claim is about *bytes*, not *speed*.

## 1. Why byte-identity, not ops/sec

Throughput claims invite an endless regress of hardware quibbles: *which CPU,
which Node version, was the cache warm, did you pin the governor?* They are
real but unfalsifiable from a distance. Byte-identity is the opposite kind of
claim. It is a property of the *computation*, not the *machine*: if two runtimes
disagree on a single bit, the claim is false, and anyone can see it on any
hardware. That is what makes it a credibility anchor — and why it is the right
foundation under the verifiable receipts (D2) and the provenanced film (D4),
both of which are only meaningful if the digests they publish reproduce
everywhere.

## 2. The four runtimes

| Runtime | Implementation | Where it runs |
| --- | --- | --- |
| `node-crypto` | `canonicalEncoding.canonicalDigest` → Node OpenSSL `createHash` | server / CI |
| `portable-js` | `reasoningReceipts.leafEntryForClaim` → pure-TypeScript SHA-256 (`universalCrypto`) | browser, edge, any JS engine |
| `webcrypto-subtle` | W3C WebCrypto `subtle.digest('SHA-256', …)` | browsers, Deno, Node ≥ 20 |
| `python-hashlib` | `mcop.canonical_encoding.canonical_digest` → CPython `hashlib` | the Python package |

Two are different native libraries (OpenSSL, CPython), one is a standardised
browser API, and one is a from-scratch pure-language implementation. They share
no code. Agreement across them is therefore evidence about the *specification*
being unambiguous, not about a single library being self-consistent.

The shared canonicalisation is RFC 8785 (JSON Canonicalization Scheme); the
TS↔Python agreement on it is independently locked by
`canonicalMerkleParity` and `merkleTreeParity`, and now by the byte-identity
guardian over a fixture that deliberately includes the cases RFC 8785 exists to
resolve.

## 3. The ninety-second check

```bash
# 1. Recompute the digests in Python and compare to the golden (~5 s).
python3 -m pytest mcop_package/tests/parity/test_byte_identity_parity.py -q

# 2. Recompute them through three JavaScript runtimes and compare to the same
#    golden; emit the manifest (~5 s).
npx jest src/__tests__/byteIdentity.test.ts

# 3. Read the verdict.
jq '.allRuntimesAgree, .consensusRoot' docs/benchmarks/byte-identity-manifest.json
```

`allRuntimesAgree: true` and a single `consensusRoot` shared by all four
runtimes is the whole result. Regenerate the golden after intentionally
changing the fixture with
`python3 tests/parity/generate_byte_identity_fixtures.py`.

## 4. What this anchors

* **Verifiable reasoning receipts (D2).** A reader's browser folds an inclusion
  proof to a published root using `portable-js`; this paper certifies that root
  is the same one Node and Python compute. The receipt is only trustworthy
  because the digest is runtime-invariant.
* **The provenanced film (D4).** A film's credit root and per-shot fingerprints
  reproduce across runtimes for the same reason; a viewer on any platform
  recomputes the identical lineage.
* **Cross-language triad fingerprint.** `scripts/triad-fingerprint.mjs` and
  `mcop_package/mcop/triad.py` already diff a `tensor_sha256` field in CI; the
  byte-identity guardian generalises that single-field check to the full
  cognition-state substrate.

## 5. Threats to validity

* **Scope.** The claim is about the canonical-digest substrate that every
  provenance hash uses — not about floating-point tensor *arithmetic*, which is
  bounded separately (the triad fingerprint pins the normalised-tensor case, and
  the kernels accumulate in a fixed order; see
  `scripts/triad-fingerprint.mjs`). Byte-identity of the *digest* is necessary
  and sufficient for the provenance claims; byte-identity of every intermediate
  float is a stronger property this paper does not assert.
* **Fixture coverage.** Six payloads, chosen to span the subsystems and the
  serialisation edge cases. Adding cases only strengthens the claim; the golden
  is regenerated deterministically.
* **Hash agility.** The claim is pinned to SHA-256 and RFC 8785; a future
  migration would bump the schema (`mcop-byte-identity/1.0`) and regenerate.

## 6. Conclusion

Determinism is often asserted; here it is *checkable*, narrowly and quickly, by
a property that does not depend on the verifier's hardware. The same digest in
four runtimes — two native libraries, a browser standard, and a pure-language
reimplementation — is the credibility floor the rest of the provenance story
stands on.

---

## References

1. Rundgren, A., et al. *JSON Canonicalization Scheme (JCS).* RFC 8785, 2020.
2. Laurie, B., Langley, A., Käsper, E. *Certificate Transparency.* RFC 6962, 2013.
3. *MCOP Verifiable Reasoning Receipts.* `docs/VERIFIABLE_RECEIPTS.md`, 2026.
4. *The Provenanced Film.* `docs/PROVENANCED_FILM.md`, 2026.
