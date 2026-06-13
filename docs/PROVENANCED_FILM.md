# The Provenanced Film — the credits are a root hash

> **TL;DR** — A long-form generated film whose **every shot is Merkle-traceable**
> to its prompt, seed, adapter call, and — via **Direct Forcing** — the
> fingerprint of the previously generated clip it conditioned on. The provenance
> **sidecar** ships with the film; one **credit root** anchors every shot. A
> viewer verifies the whole thing locally and can watch the lineage break when
> they edit a shot. Live artifact: [`/film`](../src/app/film); published sidecar:
> `public/films/lunar-documentary.provenance.json`.

## What it composes (nothing new invented, three things wired)

| Piece | Role |
| --- | --- |
| [`longFormVideoOrchestrator`](../src/core/longFormVideoOrchestrator.ts) | Drives clip-by-clip generation with a **Direct Forcing** loop — each clip conditions on the *fingerprint of the previously generated clip*, the signal that holds a long sequence together against drift. |
| [`reasoningReceipts`](../src/core/reasoningReceipts.ts) (D2) | Append-only Merkle Mountain Range + `O(log n)` verifiable receipts. |
| [`filmProvenance`](../src/core/filmProvenance.ts) | Binds them: each shot becomes an MMR claim whose record **cryptographically seals the Direct Forcing edge**. |

The Direct Forcing loop already did real technical work (conditioning against
drift). Here it does **real cryptographic work too**: the same conditioning
signal becomes a verifiable provenance edge. It is not ceremony.

## What a shot record seals

Each shot is a canonical `ShotProvenanceRecord` — the MMR claim:

```jsonc
{
  "shotIndex": 3,
  "prompt": "[continuation …] a solitary rover crosses the lunar south pole …",
  "seed": 4242,
  "model": "wan-2.1",
  "adapter": "deterministic-stub",     // a real Vidu / Kling / Higgsfield call in production
  "durationSeconds": 5,
  "assetUrl": "https://reel.local/lunar/clip-3.mp4",
  "fingerprintDigest": "…",            // canonical digest of this clip's generated fingerprint
  "priorFingerprintDigest": "…",       // Direct Forcing edge: the clip this shot conditioned on
  "priorShotLeaf": "…"                 // chain edge: the prior shot's MMR leaf
}
```

`priorFingerprintDigest` is the load-bearing field: it records the digest of the
**actual prior clip's fingerprint**, so the provenance proves the conditioning
*lineage*, not merely that shots exist. The record never contains its own leaf
(that is derived), so there is no circularity.

## What the sidecar proves — and what it does not

A viewer running `verifyFilmSidecar(sidecar)` (pure, browser-runnable) checks,
per shot:

1. **Membership** — the shot's receipt folds to the published `creditRoot`
   (`O(log n)`), and the human-readable record is exactly what the receipt
   sealed (no `shot-receipt-desync`).
2. **Lineage** — for shot *i > 0*, `priorFingerprintDigest` equals shot *i−1*'s
   real `fingerprintDigest` (the Direct Forcing edge held: `direct-forcing-broken`
   otherwise) and `priorShotLeaf` equals shot *i−1*'s leaf (`chain-broken`
   otherwise). Shot 0 must be a clean genesis (`bad-genesis` otherwise).

Reordering shots, editing a prompt, or forging a conditioning edge all fail the
check — the lineage is order-bound and tamper-evident.

**Trust boundary.** A verified film proves it was *assembled as recorded* —
these shots, in this order, each conditioned on the previous one's real output,
unaltered since the root was published. It does **not** prove the footage
depicts anything real, nor that a prompt's provenance is the *training data's*
provenance (provenance of a prompt is not provenance of a model). The `/film`
page and this doc say so in plain language so the artifact does not overclaim.

## The lunar documentary

`src/__tests__/filmProvenanceOrchestrator.test.ts` drives the orchestrator with
a **deterministic** stub adapter (the "generated" fingerprint is a pure function
of the prompt, so the film and its credit root reproduce exactly) and emits
`public/films/lunar-documentary.provenance.json` — an 8-shot lunar traverse. A
production run swaps in a real `VideoClipAdapter` (Vidu / Kling / Higgsfield /
an in-house Wan or CogVideoX runner); the provenance layer is provider-agnostic
and unchanged.

Enable it on any orchestration:

```ts
const result = await orchestrator.generate(narrative, {
  totalDurationSec: 40,
  clipDurationSec: 5,
  recordFilmProvenance: true,
  filmTitle: 'Earthlight: A Lunar Traverse',
  modelId: 'wan-2.1',
  adapterName: 'vidu',
  adapterOptions: { seed: 4242 },
});
result.filmSidecar; // ships with the film; result.filmSidecar.creditRoot is the credit hash
```

## Why mainstream stacks can't ship this

Per [`COMPARISONS.md`](../COMPARISONS.md), the property stack is determinism +
chained provenance + a universal runtime. A film's credit root is only meaningful
if (a) generation is deterministic enough to record a stable fingerprint per
shot, (b) the provenance is chained shot-to-shot, and (c) the verifier runs where
the viewer is. Receipts make the property *checkable by the viewer* rather than
asserted in a press release.

## Limitations

- The sidecar is only as honest as the fingerprints fed in; a real adapter must
  return a faithful latent/feature vector per clip (the orchestrator falls back
  to embedding the asset URL when none is supplied, which proves *assembly*, not
  *visual* lineage).
- Anchoring the credit root (publishing/signing it) is out of scope here, exactly
  as for D2 — without an independent anchor a self-consistent sidecar proves only
  internal consistency.
- Provenance of prompts is not provenance of training data (see the trust
  boundary).
