# Quarterly Governance Review — 2026 Q2

**Review window:** 2026-02-01 → 2026-04-30 (rolling 90 days through cut date)
**Reviewer:** automated audit pass + reviewer-of-record [@Kuonirad](https://github.com/Kuonirad)
**Cadence:** quarterly per [GOVERNANCE.md "Changing this document"](../../GOVERNANCE.md#changing-this-document) and Phase 4 of the post-audit roadmap.

This is the first formal quarterly review under `GOVERNANCE.md` (introduced in v2.1.0, 2026-04-19). It establishes the baseline that the next review (2026-Q3, due ≈ 2026-07-30) will compare against.

---

## 1. Executive summary

| Pillar | Status | Direction since last quarter |
| --- | --- | --- |
| Maintainer roster / bus factor | ⚠️ **bus factor = 1** | flat — onboarding plan exists but no second maintainer yet |
| Decision model (lazy-consensus, 72h) | ✅ codified, observed in practice | flat |
| Branch protection on `main` | ✅ strong (11 required checks, CODEOWNERS, no force-push, no delete) | improved (more required checks) |
| Required approving reviewers | ⚠️ count = 0 (CODEOWNERS gates only) | flat |
| Release process | ✅ release-drafter active; SBOM auto-attach landed (#554) | improved |
| Supply-chain posture | ✅ 0 open Dependabot / code-scanning / secret-scanning alerts; 0 `pnpm audit` vulns across 1125 deps | improved |
| License compliance | ✅ root + `packages/core/` + `mcop_package/` BUSL-1.1 LICENSE files byte-identical (sha `cf4b09f7…`); guarded by `pnpm docs:guard` | improved |
| CI workflow stability | ⚠️ `Build and Test` 78.6% green over last 14 runs; the rest 92–100% | mildly degraded — flakes documented |
| Branch hygiene | ✅ 316 → 47 branches (−269) | improved |
| Issue / PR backlog | ✅ 10 open issues (all good-first-issues), 1 open PR | healthy |
| Documentation drift | ✅ no drift detected | flat |

**Overall:** governance is **healthy and improving**. The single material risk is **bus factor = 1**; everything else is on or above target. Phase 3 of the post-audit roadmap (community recruitment + 2nd maintainer onboarding) remains the highest-leverage next move.

---

## 2. Maintainers & bus factor

### Current roster

| Role | Handle | Scope | Tenure |
| --- | --- | --- | --- |
| Lead maintainer | [@Kuonirad](https://github.com/Kuonirad) | Architecture, releases, security escalation | since project inception (v2.0.0, 2025-12-19) |

### CODEOWNERS audit

`.github/CODEOWNERS` resolves all sensitive paths to `@Kuonirad`:

```
*                       @Kuonirad
.github/workflows/      @Kuonirad
.github/actions/        @Kuonirad
package.json            @Kuonirad
pnpm-lock.yaml          @Kuonirad
next.config.*           @Kuonirad
src/                    @Kuonirad
mcop_package/           @Kuonirad
Dockerfile              @Kuonirad
```

This is correct for the current single-maintainer phase. It must be revisited the moment a second maintainer is added — particularly to spread the workflow / release / dependency-pinning paths so maintainer absence does not block patches.

### Contributor flow (last 90 days)

| Identity | Type | Commits | Note |
| --- | --- | --- | --- |
| `{KVN-AI} - @KullAILABS` | human (lead) | 138 | primary author |
| `google-labs-jules[bot]` | automation | 50 | speculative-optimization PRs (most pruned, see §7) |
| `Claude` | AI assistant | 11 | scoped tasks |
| `Kuonirad` | human (lead) | 10 | review / merge commits |
| `dependabot[bot]` | automation | 8 | dependency updates |
| `Kuonirad - {KVN-AI}` | human (lead) | 2 | merge commits |
| `KULLAILABS` | human (lead) | 1 | pre-merge fix |

**Net human contributors:** 1 (the various aliases above all resolve to @Kuonirad).
**Bus factor:** 1 — confirmed.

### Bus-factor mitigation status

`GOVERNANCE.md § "Becoming a maintainer"` defines a clear path:
> Sustained record of high-quality PRs (typically 10+ merged commits over 60+ days). Demonstrated review judgement on others' PRs. Agreement to uphold CODE_OF_CONDUCT.md.

No external candidates have crossed the 10-commit / 60-day threshold this quarter. The 10 good-first-issues filed 2026-04-30 (#544–#553) are the seed for the 2026-Q3 recruitment funnel.

**Recommendation (carry-forward to Q3):** post a recruitment thread in GitHub Discussions and 1–2 adjacent communities (TypeScript, provenance/audit tooling, AI-tooling). Target: 2 active external contributors, each landing ≥ 10 merged PRs by 2026-Q4.

---

## 3. Decision model

`GOVERNANCE.md § "Decision model"` defines lazy consensus with a **72-hour objection window**, escalating to synchronous review on contested PRs. Single-maintainer phase falls back to lead-decides-and-records.

### Observed in practice

- 62 merge commits in the review window; per spot-check (5 randomly sampled merges across the window), all merged after CI green, none with unresolved review threads.
- **No contested merges** identified — the 72h objection window has been respected by default because there are no other reviewers to object.
- The 7-day extended-objection window for `GOVERNANCE.md` itself has not been triggered (no governance-doc edits in the period).

**Health:** ✅ as designed for the single-maintainer phase. Will need a stress-test once a second maintainer is added.

---

## 4. Branch protection on `main`

| Setting | Value | Verdict |
| --- | --- | --- |
| Required status checks (strict) | ✅ enabled | ✅ |
| Number of required checks | 11 (test 20.x, test 22.x, build, security, test-malicious-load, trojan-source-scan, CodeQL JS/TS, CodeQL Python, Python tests 3.10, Python tests 3.12, npm package) | ✅ comprehensive |
| Required PR reviews | ✅ enabled | ✅ |
| `required_approving_review_count` | **0** | ⚠️ |
| `require_code_owner_reviews` | ✅ true | ✅ — CODEOWNERS still gate on `@Kuonirad` |
| `dismiss_stale_reviews` | ✅ true | ✅ |
| `require_last_push_approval` | false | ⚠️ minor — re-approval not forced after force-push (which is also disabled, so this is mostly moot) |
| `required_conversation_resolution` | ✅ true | ✅ |
| `enforce_admins` | false | ⚠️ — admin (lead maintainer) can self-bypass; documented as intentional during single-maintainer phase |
| `allow_force_pushes` | false | ✅ |
| `allow_deletions` | false | ✅ |
| `lock_branch` | false | n/a |
| `required_signatures` | false | ⚠️ — commits not GPG/Sigstore-required; pairs poorly with provenance focus |

### Recommendations

1. **Bump `required_approving_review_count` to 1** as soon as a 2nd maintainer is onboarded. Today, CODEOWNERS still gates and lazy-consensus is enforced socially, but the explicit count of 0 is misleading on the API surface.
2. **Enable `required_signatures`** as a low-risk hardening step. The Trusted-Publishing workflows already auto-sign npm + PyPI artefacts; extending to commits closes the last gap.
3. **Re-evaluate `enforce_admins`** at the same time the review-count is bumped. With one admin, enforcing admin restrictions traps the maintainer mid-incident; with two, it's a strict win.

---

## 5. CI workflow health (last ~14 runs each)

| Workflow | Success rate | Notes |
| --- | --- | --- |
| `Build and Test` (`ci.yml`) | **78.6 %** (11/14) | 1 main-branch push failure 2026-04-30; 2 PR failures (one Dependabot, one Devin coverage-gaps `useTaskChunker.test.ts` Node 20 timing flake — see [PR #543](https://github.com/Kuonirad/MCOP-Framework-2.0/pull/543) discussion). The flake is documented; not yet hardened. |
| `CI Security - Malicious Mod Test` (`malicious-mod.yml`) | 100 % (13/13) | clean |
| `CodeQL Analysis` (`codeql.yml`) | 92.3 % (12/13) | one transient infra failure |
| `Cypress E2E Tests` (`cypress.yml`) | 92.3 % (12/13) | one transient |
| `Delete merged branches` (`delete-merged-branches.yml`) | 100 % (5/5) | clean |
| `Guard - Trojan Source / Bidi Controls` (`guard-trojan-source.yml`) | 100 % (14/14) | clean |
| `License Guard` (`license-guard.yml`) | 100 % (9/9) | clean |
| `Publish Container` (`publish.yml`) | 100 % (5/5) | clean |
| `Release Drafter` (`release-drafter.yml`) | 100 % (14/14) | clean |

### Recommendations

1. **Stabilise `useTaskChunker.test.ts`** — the Node 20.x timing flake (single 1ms budget can elapse before the loop exhausts it on faster runners). Cheapest fix: assert `progress.length >= 1 && finalProgress === 1`, or raise the workload size from 200 to ≥ 1000 trivial items so the budget definitely elapses multiple times.
2. **Add a `Build and Test` flake-rate dashboard panel** in the next governance iteration. Sub-90% on the marquee CI workflow is the quickest way to erode contributor trust.

---

## 6. Supply chain & security posture

### Snapshot (2026-04-30)

| Surface | Open alerts |
| --- | --- |
| Dependabot security alerts | **0** |
| Code scanning alerts (CodeQL) | **0** |
| Secret-scanning alerts | **0** |
| `pnpm audit` (1125 deps) | **0** at info / low / moderate / high / critical |

### Provenance & SBOM

- **npm Trusted Publishing + automatic Sigstore provenance** active in `publish-npm.yml`.
- **PyPI Trusted Publishing (OIDC)** active in `publish-pypi.yml`.
- **CycloneDX SBOMs** (`docs/sbom/mcop-framework.cdx.json`, `mcop-core.cdx.json`) generated on demand via `pnpm sbom`, schema-validated via `pnpm sbom:validate`, and attached to GitHub Releases by both publish workflows (#554, landing in v2.2.0).
- **Trojan Source / bidi guard** runs on every PR (`guard-trojan-source.yml`).
- **Malicious-modification guard** runs on every PR (`malicious-mod.yml`); 100% green this quarter.

### Earlier-quarter Dependabot follow-ups

- Alerts **#78** (`postcss < 8.5.10`, GHSA-qx2v-qp2m-jg93) and **#79** (`uuid < 14.0.0`, GHSA-w5hq-g745-h8pq) were flagged earlier in Q2. Both were already patched in the lockfile via existing `pnpm.overrides` (`postcss → 8.5.10/8.5.12`, `uuid → 14.0.0`) and the Dependabot UI did not auto-resolve through overrides. The owner dismissed both as `Risk tolerable to this project / Override resolves to patched version` and the open-alerts count is currently 0 across all categories.

### Recommendations

1. **Add a periodic `pnpm.overrides` sweep** to the quarterly cadence. Overrides accrete; some may become unnecessary once direct deps catch up. Suggested check: `pnpm why <pkg>` for every entry in `pnpm.overrides`, dropping overrides where the resolved transitive dep is already at or above the patched version naturally.
2. **Adopt `cosign attest --predicate <sbom>.cdx.json`** in v2.3.0 to push CycloneDX SBOMs as Sigstore attestations alongside the existing Sigstore artefact provenance. Closes the `SECURITY.md § "Supply Chain Security" → SBOM generation for releases (planned)` line item that is now no longer planned but shipping.

---

## 7. Branch hygiene

### Quarter-on-quarter state

| Metric | Start of Q2 | End of Q2 |
| --- | --- | --- |
| Total branches | 316 | **47** |
| `bolt/*` + `bolt-*` | 101 | 0 |
| `palette/*` | 94 | 14 |
| `sentinel/*` | 92 | 13 |
| `jules/*` | 11 | 2 |
| Active feature / fix / security branches | ~18 | ~18 |

The 269-branch prune executed 2026-04-30 followed the decision matrix in `docs/audits/branch-cleanup-strategy.md`: all `bolt/*` deleted (per matrix § "> 30 days OR < 7 days with 1 commit"); `palette/*` / `sentinel/*` / `jules/*` deleted at the > 30-day cutoff. The 27 retained automation branches are all < 30-day single-commit experiments and will roll off automatically via `delete-stale-bot-branches.yml`.

### Recommendation

- **Tighten `delete-stale-bot-branches.yml`** in v2.3.0 to also cover `palette/*`, `sentinel/*`, and `jules/*` prefixes (currently it covers `bolt-*` only). Same 7-day grace period.

---

## 8. Issues & PR backlog

| Bucket | Count | Health |
| --- | --- | --- |
| Open issues | 10 | ✅ All `good first issue` + `help wanted` (#544–#553); intentional recruitment seed |
| Open PRs (excluding Dependabot) | 1 | ✅ release-prep PR #555 (this quarter's release) |
| Stale issues (no activity > 90 days) | 0 | ✅ |
| Stale PRs (no activity > 90 days) | 0 | ✅ — `stale.yml` workflow operating as intended |

---

## 9. Documentation & legal hygiene

- **License drift**: zero. `LICENSE` (BUSL-1.1) is byte-identical (`sha1: cf4b09f7…`) across root, `packages/core/`, and `mcop_package/`. Enforced on every push via `scripts/shared-docs-guard.mjs` (`pnpm docs:guard`) and the `License Guard` workflow.
- **`SECURITY.md` "Supported Versions" table**: refreshed in v2.2.0 (this release) — `2.2.x` and `2.1.x` ✅; `2.0.x` and earlier moved to `please upgrade`.
- **GitHub repo "License" detection**: GitHub returns `NOASSERTION` because BUSL-1.1 is not in their auto-detected SPDX whitelist. This is a known limitation of `licensee/licensee`; not actionable from our side until upstream adds BUSL.
- **Funding**: `.github/FUNDING.yml` present; GitHub Sponsors profile active.

---

## 10. Bus-factor mitigation plan (2026-Q3)

The single-maintainer state remains the project's largest residual risk. Concrete steps for next quarter:

1. **Recruitment thread** — file in [GitHub Discussions](https://github.com/Kuonirad/MCOP-Framework-2.0/discussions). Cross-post to:
   - r/typescript, r/MachineLearning (low-volume but signal)
   - The Cyclone-DX / OWASP supply-chain mailing lists (provenance-relevant)
   - One adjacent creative-tooling / AI-research community
2. **Triage the 10 good-first-issues weekly** so first-time contributors get fast acknowledgement.
3. **Public weekly office-hours** (1× / week, 30 min) on Discussions or a calendar slot — even if attendance is initially zero, the consistent slot is the recruitment signal.
4. **Define the `core_reviewer` provisional role** in `GOVERNANCE.md` — review-rights without merge-rights, as a stepping stone to full maintainer status. Lowers the activation energy.
5. **Track recruitment KPI** — by 2026-Q3 review: 2 external contributors with ≥ 5 merged PRs each; by 2026-Q4: 2 with ≥ 10 merged PRs each, eligible for full maintainer nomination.

---

## 11. Action items for 2026-Q3

| # | Owner | Effort | Action |
| --- | --- | --- | --- |
| A1 | @Kuonirad | low | File Discussions recruitment thread (§10.1) |
| A2 | @Kuonirad | low | Add `palette/*`, `sentinel/*`, `jules/*` patterns to `delete-stale-bot-branches.yml` (§7) |
| A3 | next maintainer + @Kuonirad | low | Bump branch-protection `required_approving_review_count` to 1 once 2nd maintainer onboards (§4.1) |
| A4 | @Kuonirad | low | Enable `required_signatures` on `main` branch protection (§4.2) |
| A5 | @Kuonirad / contributor | low | Stabilise `useTaskChunker.test.ts` flake (§5.1) |
| A6 | @Kuonirad | low | Sweep `pnpm.overrides`, drop entries no longer needed (§6.1) |
| A7 | @Kuonirad | medium | Adopt `cosign attest` for SBOM attestations alongside existing Sigstore provenance (§6.2) |
| A8 | @Kuonirad | low | Define `core_reviewer` role in `GOVERNANCE.md` (§10.4) |

---

## 12. Sign-off

This review was assembled by direct inspection of the GitHub REST API, the local `git` history, and the in-repo governance / security / contributing documents on **2026-04-30**, prior to the v2.2.0 release tag.

Next review due: **2026-Q3** (≈ 2026-07-30).
