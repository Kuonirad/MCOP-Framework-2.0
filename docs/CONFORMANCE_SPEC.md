<!--
SPDX-License-Identifier: Apache-2.0
Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
-->

# Conformance Spec & Approved-Changeset Gate

**Status date:** 2026-05-29
**Module:** [`src/conformance/`](../src/conformance) · entry points [`runConformanceSuite`](../src/conformance/conformanceSuite.ts), [`validateApprovedChangeset`](../src/conformance/approval.ts)
**Roadmap:** advance #4 of four — the last one.

## Why this exists

The Due-Diligence Register rates the project at **Bus Factor 1**. Three of the
four roadmap advances made the framework's *behaviour* richer; none of them made
it *survivable* without the original author. This advance does, on two surfaces,
with one idea — **make the framework checkable instead of trusted**:

- a **conformance suite** pins the deterministic contracts any reimplementation
  (or second maintainer) must satisfy; and
- an **approved-changeset gate** turns "a human approved it" into a content-bound,
  replayable record.

"It behaves correctly because the author knows how it works" becomes "it behaves
correctly because the conformance suite passes, and this change is provably
approved."

## The conformance suite

`runConformanceSuite()` runs every [`ConformanceContract`](../src/conformance/contracts.ts)
and seals the outcome into a Merkle-rooted `ConformanceReport`. The built-in set
covers the three load-bearing guarantees, each runnable with no network and no
GPU:

| Contract | Pins |
| --- | --- |
| `canonical-digest-determinism` | RFC-8785 canonical digests are order-independent and byte-stable — the basis of all provenance. |
| `hot-path-parity` | The CPU reference kernels reproduce the Python golden fixture for all five hot-path ops (TS↔Python parity). |
| `hot-path-provenance` | Every hot-path op carries uniform provenance and a deterministic, replayable chain root. |
| `approved-changeset-gate` | Approvals are content-bound: genuine owner approval passes; tamper / stale / self-approval fail. |

```ts
import { runConformanceSuite } from '@/conformance';

const report = await runConformanceSuite();
if (report.verdict !== 'conformant') {
  throw new Error(`non-conformant: ${report.contracts.filter((c) => !c.passed).map((c) => c.id)}`);
}
```

A green report is the single, checkable answer to "does this implementation
conform?" — the artifact that lets a clean-room port or a second maintainer be
trusted without the original author in the loop.

## The approved-changeset gate

A **changeset** is the unit the gate binds to: an ordered, content-hashed
manifest of every file a change touches, rolled into one `changesetHash` (a
canonical Merkle digest, so it is order-independent and byte-stable, and any edit
moves it). An **approval** carries the exact `changesetHash` it signed off on.

`validateApprovedChangeset` recomputes the hash from the changeset's *files*
(never trusting the stored field) and accepts an approval only if it binds to
that recomputed hash and comes from a CODEOWNER who is not the author:

| Verdict | Cause |
| --- | --- |
| `approved` | ≥ `minApprovals` bound approvals from required owners. |
| `tampered` | The sealed hash does not match the manifest it claims to seal. |
| `stale-approval` | An owner approved, but the diff changed afterward (recomputed hash moved). |
| `self-approval-rejected` | The only owner approval came from the author. |
| `insufficient-approvals` | Not enough valid owner approvals (or forged approval records). |

The required owners are resolved from the repo's real `.github/CODEOWNERS`
([`requiredOwnersFor`](../src/conformance/codeowners.ts)), so the machine-checkable
gate and the GitHub-enforced `require_code_owner_reviews` rule cannot drift apart.

```ts
import {
  buildChangeset, approveChangeset, validateApprovedChangeset,
  parseCodeowners, requiredOwnersFor,
} from '@/conformance';

const changeset = buildChangeset({ id, baseRef, headRef, author, files });
const owners = requiredOwnersFor(changeset.files.map((f) => f.path), parseCodeowners(codeownersText));
const approval = approveChangeset(changeset, '@Kuonirad');           // bound to the content
const result = validateApprovedChangeset(changeset, [approval], {
  requiredOwners: owners, minApprovals: 1, forbidSelfApproval: true,
});
// result.verdict === 'approved' | 'tampered' | 'stale-approval' | …
```

This is the security property GitHub's UI only *socially* enforces (an approval
should be dismissed when new commits land), made into an offline, replayable,
cryptographic check: **approval is bound to content**, so approving-then-editing
is detectable by anyone, forever.

## What is verified

`pnpm conformance:test` runs:

- the **codeowners matcher** against the real rule shapes (catch-all, directory
  prefixes, basename globs, last-match-wins);
- the **gate** across all five verdicts, forged-approval rejection,
  `minApprovals > 1`, and determinism of the sealed validation root; and
- the **suite** itself — conformant when all contracts pass, non-conformant (and
  fault-isolating a throwing contract) otherwise, with a deterministic report root.

## Enforced in CI

Both surfaces are wired in as checks, so the gate is policy, not just a library:

- **Conformance spec** — the `Conformance spec` job (`.github/workflows/ci.yml`)
  runs `pnpm conformance:test` on every push and PR; a non-conformant build
  fails CI.
- **Approved-changeset gate** — the `Approved Changeset Gate` workflow
  (`.github/workflows/approved-changeset.yml`) runs on `pull_request` and
  `pull_request_review`. It reconstructs the changeset from the PR's git diff,
  resolves required owners from `.github/CODEOWNERS`, and ingests the PR's review
  approvals. Its job is the **content-binding** check GitHub misses, not a
  duplicate of "needs approval" (branch protection's `require_code_owner_reviews`
  already blocks the *merge* until a CODEOWNER approves). So the gate:
  - **passes** when an owner approval is bound to the current head commit, **or**
    when the PR is merely awaiting review (no owner approval yet — merge stays
    gated by branch protection); and
  - **fails** only on an integrity violation — a **stale** approval (an owner
    approved an earlier commit, then the diff moved) or a **tampered** manifest.

  Pushing a new commit moves the head SHA, so an approval that is not re-issued
  becomes stale and the check goes red until a fresh owner approval lands.

Together with branch protection's `require_code_owner_reviews`, this makes every
merge a provably-approved, content-bound changeset — verifiable offline by anyone,
not just trusted because GitHub's UI showed a green check.

## Roadmap complete

With this, all four advances the analysis named are in place:

1. Pre-registered, multi-rater, held-out efficacy program ✅
2. Fast control loop ✅
3. Temporal dynamics for Stigmergy ✅
4. Conformance spec + approved-changeset gate ✅ (this)

The framework has moved from *provably deterministic* to *demonstrably useful and
survivable*: its behaviour is conformance-checked, its changes are provably
approved, and its efficacy claims are adjudicated by a program its own optimiser
cannot game.
