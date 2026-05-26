# Roadmap

**Status:** operative — the canonical 12-month outlook for MCOP Framework 2.0.
**Last updated:** 2026-05-26
**Owner:** [@Kuonirad](https://github.com/Kuonirad)
**Review cadence:** revisited at the start of each quarter; superseded entries summarized in [`CHANGELOG.md`](./CHANGELOG.md).

This file is the **high-level outlook**. Two complementary documents carry the deep detail:

- The in-flight 90-day v2.4 milestone (discoverability + adoption, 2026-05-10 → 2026-08-10) lives in [`ROADMAP_TO_100.md`](./ROADMAP_TO_100.md) §"v2.4 Milestone."
- The long-form CUDA productionization, distributed cluster mode, and hosted-provenance-ledger plan lives in [`docs/TRUST_SUBSTRATE_ROADMAP.md`](./docs/TRUST_SUBSTRATE_ROADMAP.md).

---

## Current snapshot (2026-05-26)

| Dimension | State | Source of truth |
|:---|:---|:---|
| Release line | v2.3.x in production; v2.4 milestone in flight on `efficacy-escalation/v2.4` | [`CHANGELOG.md`](./CHANGELOG.md), [`ROADMAP_TO_100.md`](./ROADMAP_TO_100.md) |
| License | Apache 2.0 (transitioned from BUSL 1.1, 2026-04) | [`LICENSE`](./LICENSE) |
| OpenSSF Best Practices | Passing achieved; Silver in progress (project 12884) | https://www.bestpractices.dev/projects/12884 |
| OpenSSF Scorecard | Workflow shipped, rating published | [`.github/workflows/scorecard.yml`](./.github/workflows/scorecard.yml), https://scorecard.dev/viewer/?uri=github.com/Kuonirad/MCOP-Framework-2.0 |
| Bus factor | **1** (Kuonirad) — top mitigation priority | [`docs/DUE_DILIGENCE_REGISTER.md`](./docs/DUE_DILIGENCE_REGISTER.md#maintainer-continuity-register) |
| Test coverage | 96.6% (Jest snapshot) | [`docs/badges/coverage.svg`](./docs/badges/coverage.svg) |
| Supply-chain provenance | Sigstore keyless + SLSA v1.0 on npm & PyPI | [`CONTRIBUTING.md`](./CONTRIBUTING.md#verifying-the-sigstore-provenance-on-kullailabsmcop-core) |

---

## Q3 2026 (Jul–Sep) — Assurance & succession

**Theme:** close remaining OpenSSF Silver-tier gaps and break the single-maintainer bus factor.

| Deliverable | Exit criterion |
|:---|:---|
| **STRIDE threat model** → `docs/THREAT_MODEL.md` | Six STRIDE categories enumerated against the triad core, adapter layer, and Sigstore release path. Cross-linked from `SECURITY.md` and `docs/DUE_DILIGENCE_REGISTER.md`. Closes the OpenSSF `assurance_case` criterion. |
| **Maintainer #2 onboarded** | Second maintainer with merge rights on `main` and `production`-environment approval. `.github/CODEOWNERS` updated. Closes the OpenSSF `bus_factor` criterion. |
| **Commit-signature verification becomes blocking** | The warn-only `verify-commit-signatures` gate referenced in `CONTRIBUTING.md` is promoted to a required status check on PRs targeting `main`. |
| **OpenSSF Best Practices Silver achieved** | All Silver criteria green at https://www.bestpractices.dev/projects/12884; Silver badge added to README badge cluster. |
| **v2.4 milestone shipped** | Per [`ROADMAP_TO_100.md`](./ROADMAP_TO_100.md) §v2.4: ≥ 50 stars, ≥ 5 forks, ≥ 3 non-founding contributors, 1 reproducible benchmark preprint published. |

---

## Q4 2026 (Oct–Dec) — Gold trajectory & external scrutiny

**Theme:** move from "well-documented" to "independently scrutinized."

| Deliverable | Exit criterion |
|:---|:---|
| **External security review note** → `docs/audits/external-review-2026-Q4.md` | Either (a) a paid lightweight pen-test summary, or (b) a documented third-party review by a non-maintainer with relevant credentials. Satisfies the Gold-tier external-review expectation. |
| **Reproducible-build documentation** → `docs/REPRODUCIBLE_BUILD.md` | Explicit `pnpm install --frozen-lockfile && pnpm build` invocation; SLSA verification commands; SBOM regeneration steps; backed by a CI job that builds twice and diffs artifact hashes. |
| **OpenSSF Scorecard ≥ 8.0** | Public dashboard shows ≥ 8.0; remediation for any sub-7.0 individual check is documented in [`docs/SECURITY-POSTURE-NOTES.md`](./docs/SECURITY-POSTURE-NOTES.md). |
| **v2.5 stable release cut** | CUDA acceleration ships behind `enableCUDA: 'auto'` per [`docs/CUDA_PRODUCTION.md`](./docs/CUDA_PRODUCTION.md); deterministic CPU fallback remains bit-identical. |
| **OpenSSF Best Practices Gold gap analysis published** | Gap doc lists every Gold criterion with target close date. |

---

## Q1 2027 (Jan–Mar) — Substrate maturation

**Theme:** the trust substrate moves from "documented design" to "running code with provenance."

| Deliverable | Exit criterion |
|:---|:---|
| **Distributed cluster mode (Redis Streams) ships under a flag** | Per [`docs/DISTRIBUTED_CLUSTER_MODE.md`](./docs/DISTRIBUTED_CLUSTER_MODE.md); cluster lineage fields populate `TrustSubstrateLineage`; integration tests verify cross-node Merkle root reproducibility. |
| **Maintainer #3 onboarded** | Bus factor ≥ 3 with at least two release-capable maintainers — matches the success condition in [`docs/DUE_DILIGENCE_REGISTER.md`](./docs/DUE_DILIGENCE_REGISTER.md#maintainer-continuity-register). |
| **Hosted provenance ledger (alpha)** | Service-rooted ledger receipts per [`docs/TRUST_SUBSTRATE_ROADMAP.md`](./docs/TRUST_SUBSTRATE_ROADMAP.md); experimental endpoint with a public verification CLI. |
| **OpenSSF Best Practices Gold achieved** | Gold badge visible in README; all Gold-tier criteria green at https://www.bestpractices.dev/projects/12884. |

---

## Q2 2027 (Apr–Jun) — v3.0 design & ecosystem consolidation

**Theme:** architectural foundation for v3.0; harden upstream integration partnerships.

| Deliverable | Exit criterion |
|:---|:---|
| **v3.0 design RFC** | Public ADR covering breaking-change inventory, migration path, and explicit SemVer commitment. RFC discussion open ≥ 30 days before lock-in. |
| **Upstream PRs landed against LangChain, LlamaIndex, Haystack** | Per [`docs/integrations/UPSTREAM_SUBMISSION_PLAN.md`](./docs/integrations/UPSTREAM_SUBMISSION_PLAN.md); at least one of the three accepts the memory-layer shim upstream. |
| **Independent reproducibility study** | At least one external party reproduces the published benchmark within ±5% and reports back via a `reproducibility-audit-questions` discussion. |
| **Conference / preprint placement** | The reproducible-benchmark paper appears on arXiv `cs.SE` with a Zenodo DOI mirror. |

---

## Non-goals (next 12 months)

We will explicitly **not** do the following over this roadmap horizon. Calling these out keeps scope honest and prevents "future-feature" debates from re-litigating decisions in PR review.

- **Closed-source forks, dual-licensing, or paid tiers.** The Apache 2.0 commitment in `LICENSE` (invariant 3 of [`ROADMAP_TO_100.md`](./ROADMAP_TO_100.md) §v2.4) is non-negotiable for this window.
- **Replacing the deterministic CPU path.** CUDA acceleration is additive only. Any release that breaks the deterministic CPU result for identical inputs is a regression, not a feature.
- **Adopting a new state-management or DI framework.** Triad determinism comes from pure functions; Redux / RxJS / MobX / Effect-TS / etc. are explicitly out of scope this year.
- **Multi-tenant SaaS hosting.** The hosted provenance ledger planned for Q1 2027 is an alpha public-good service, not a commercial multi-tenant platform.
- **In-browser key management.** Sigstore-backed signing stays a release-time, server-trusted operation; we are not shipping browser-side cryptographic identity for user traces.
- **Wholesale rewrite to Rust / Zig / Go.** Discussed; deferred until at least the v3.0 design RFC concludes.

---

## Cadence and change protocol

- **Quarterly review.** At the start of each quarter, the lead maintainer opens a `chore/roadmap-Q?-20??-review` PR that closes out completed items, archives anything skipped, and proposes the next quarter's targets.
- **Mid-quarter changes.** Material additions or deletions follow the [`GOVERNANCE.md`](./GOVERNANCE.md) lazy-consensus protocol with the objection window extended to **7 days**.
- **History.** Completed quarterly entries are summarized in [`CHANGELOG.md`](./CHANGELOG.md) under a "Roadmap" heading and remain visible in `git log` against this file.

---

This roadmap is part of the [OpenSSF Best Practices Silver](https://www.bestpractices.dev/projects/12884) evidence base for the `documentation_roadmap` criterion.
