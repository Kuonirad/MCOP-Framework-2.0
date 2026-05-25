# PARP v1.0 — L0 Baseline Summary

**Locus.** `HEAD = e65d486079375d8ce0ccf359885de16a5f69cbc3` (branch `devin/1779733346-parp-v1-baseline`, source `origin/main`).
**Captured.** 2026-05-25 18:22–18:33 UTC (two consecutive reproducibility passes).
**Environment.** Node `v22.12.0` (pinned target `22.22.3`; snapshot delta — pnpm WARN-only), pnpm `9.15.0`, Python `3.12.8`.

> Reproducibility cross-check: the entire L0 suite was run **twice** in identical conditions. SBOM outputs are **byte-identical** across runs (`git diff docs/sbom/` is empty after each pass). `audit:claims` proof-gate PASS/FAIL/WARN set is identical between runs (same 4 WARNs, same 1 baseline FAIL: `cypress:run` requires a live dev server on port 3000). This satisfies PARP invariant #1 (byte-identical reproducibility) at this locus.

---

## Audit-Command Results (Pass 1 / Pass 2)

| Step | Command | Pass 1 | Pass 2 | Notes |
|------|---------|--------|--------|-------|
| L0.01 | `pnpm install --frozen-lockfile` | OK | OK | Lockfile in sync; "Already up to date" |
| L0.03 | `pnpm verify` (lint + typecheck + jest + sbom + sbom:validate) | OK | OK | ~757 jest tests across 68 suites; both SBOMs VALID against CycloneDX 1.7 |
| L0.04 | `pnpm positive:audit` | OK | OK | All 9 resonance checks pass; Positive Impact Report regenerated |
| L0.05 | `pnpm self:audit` | OK | OK | `scores.front_door_readiness = 1.0`; all 6 self-audit checks pass |
| L0.06 | `pnpm deps:audit` | OK | OK | `No known vulnerabilities found` at `--audit-level=high` |
| L0.07 | `pnpm audit:claims` | 4 WARN / 1 FAIL | 4 WARN / 1 FAIL | Same outcomes both passes — see "Pre-existing baseline state" below |

Full per-step output is captured under `artefacts/L0-NN-*.log` (pass 1) and `artefacts/run2/L0-NN-*.log` (pass 2).

---

## Pre-existing Baseline State (NOT introduced by this PR)

### `audit:claims` WARNs (claim drift)
1. **Overclaiming production readiness** — `artefacts/run1-claim-audit-artifacts/Overclaiming_production_readiness.txt`
2. **License contradiction** — `artefacts/run1-claim-audit-artifacts/License_contradiction.txt`
3. **Unproven benchmark claim** — `artefacts/run1-claim-audit-artifacts/Unproven_benchmark_claim.txt`
4. **Version drift suspects** — `artefacts/run1-claim-audit-artifacts/Version_drift_suspects.txt`

These are routed to PARP L3 (Documentation, Claims & Narrative Synchronization) as remediation candidates — not closed in this baseline PR per the integration-only scope rule.

### `audit:claims` FAIL
- `pnpm cypress:run` fails because no dev server is listening on `http://localhost:3000`. This is an infrastructure precondition (the local-test runner expects `pnpm dev` running in a separate process), **not a code regression**. The script also runs `pnpm test:coverage`, `pnpm build`, `pnpm sbom`, `pnpm bench:smoke`, `pnpm determinism:test`, `pnpm docs:check`, and the `@kullailabs/mcop-core` build — all of which PASS. Per AGENTS.md, Cypress is "exploratory / non-blocking" in headless environments.

---

## Debt-Marker Sweep (L1 preview)

| Pattern | Total Hits |
|--------|-----------|
| Case-insensitive `(TODO\|FIXME\|BUG\|HACK\|XXX\|OPTIMIZE\|DEPRECATED\|WORKAROUND)` (per PARP spec; `dist/` excluded) | **181** |
| Case-sensitive word-boundary `\b(TODO\|FIXME\|XXX\|HACK\|WORKAROUND\|DEPRECATED)\b` (high-signal) | **3** |

The case-insensitive total is dominated by identifier substring matches (`debugHook` → `bug`, optimizer code → `optimize`, deprecation notices → `deprecated`). The high-signal set is *meta* — all 3 hits live inside `scripts/check-readme-code-blocks.mjs`, which is the linter that ENFORCES no TODO/FIXME/XXX in README code blocks. Effectively zero source-level outstanding debt markers in the codebase at this locus.

Full output: `artefacts/L1-debt-markers.txt` and `artefacts/L1-debt-markers-high-signal.txt`.

---

## GitHub Code Scanning Queue

Fetched via `GET /repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts` at `HEAD = e65d486`.

- **Open: 9** (all `tool=Scorecard`, `security_severity_level=high`)
- **Dismissed: 0**

| # | Rule | Path | Line | Alert URL |
|---|------|------|------|-----------|
| 7 | BranchProtectionID | *(repo-level setting)* | — | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/7 |
| 9 | TokenPermissionsID | `.github/workflows/publish-npm.yml` | 66 | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/9 |
| 10 | TokenPermissionsID | `.github/workflows/publish-pypi.yml` | 173 | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/10 |
| 27 | CodeReviewID | *(repo-level setting)* | — | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/27 |
| 44 | TokenPermissionsID | `.github/workflows/auto-close-bot-prs.yml` | 16 | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/44 |
| 45 | TokenPermissionsID | `.github/workflows/delete-merged-branches.yml` | 15 | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/45 |
| 46 | TokenPermissionsID | `.github/workflows/delete-stale-bot-branches.yml` | 24 | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/46 |
| 47 | TokenPermissionsID | `.github/workflows/release-drafter.yml` | 16 | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/47 |
| 48 | TokenPermissionsID | `.github/workflows/positive-resonance-ledger.yml` | 11 | https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/48 |

**Categorization.**
- **7 × TokenPermissionsID** — workflow files lacking an explicit minimum `permissions:` block. Per-file fixable in dedicated `fix/parp-cs-token-perms-*` PRs (requires `workflow` OAuth scope).
- **1 × CodeReviewID (#27)** — repository setting; not a code change. Owner-only resolution (enable required reviews on protected branches).
- **1 × BranchProtectionID (#7)** — repository setting; not a code change. Owner-only resolution (configure branch protection per OSSF Scorecard recommendations).

**L1 exit gate.** All 9 alerts MUST be either fixed, dismissed-with-justification, or have an open issue/PR per PARP §1 L1. Tracked in the PARP execution issue (see PR description).

Raw snapshots: `artefacts/L1-code-scanning-alerts-open.json`, `artefacts/L1-code-scanning-alerts-dismissed.json`, `artefacts/L1-code-scanning-alerts-summary.json`.

---

## Self-Audit Scorecard (from `pnpm self:audit`)

```
scores.front_door_readiness = 1.0
checks.benchmark_badge          = pass
checks.benchmark_notebook       = pass
checks.comparison_document      = pass
checks.contribution_scaffolding = pass
checks.governance_signals       = pass
checks.stigmergic_issue_templates = pass
```

(Generated 2026-05-25 18:23:59 UTC; appended to `audit/ledger.jsonl` — captured snapshot in `artefacts/run1-audit-ledger.jsonl` and `artefacts/run2-audit-ledger.jsonl`.)

---

## Positive-Resonance Audit (from `pnpm positive:audit`)

All 9 resonance checks PASS in both passes:

```
TypeScript app resonance        OK
TypeScript core resonance       OK
Lint resonance                  OK
Test resonance                  OK
Parity resonance                OK
Documentation resonance         OK
Placement resonance             OK
SBOM generation resonance       OK
SBOM validation resonance       OK
🌱 Positive Impact Report generated.
```

Snapshot of the regenerated report: `artefacts/run1-POSITIVE_IMPACT_REPORT.md` (and `run2-…` for the second pass).

---

## Deps / SBOM Posture

- `pnpm audit --audit-level=high`: **No known vulnerabilities found** (both passes).
- `pnpm sbom`: both `docs/sbom/mcop-framework.cdx.json` and `docs/sbom/mcop-core.cdx.json` regenerated.
- `pnpm sbom:validate`: both SBOMs **VALID** against CycloneDX 1.7.
- AI Inventory: 1 instruction file (`AGENTS.md`), 2 skill files (`.agents/skills/testing-arcagi3-strategy/SKILL.md`, `.agents/skills/testing-frontend/SKILL.md`), 0 MCP configs.

---

## What This PR Does NOT Do

Per PARP scope rule, this PR is **integration + baseline only**. It does **not**:

- Modify any file under `src/ledger/`, `src/orchestrator/`, `src/core/`, `src/adapters/`, `src/drift_sentinel/`, or `src/proteome/`.
- Remediate any of the 4 `audit:claims` WARNs.
- Close any of the 9 open Code Scanning alerts.
- Touch any GitHub Actions workflow file.
- Modify the lockfile or dependency tree.

All remediation is routed to focused `fix/parp-<id>-*` follow-ups per PARP §1 L5, tracked from the umbrella issue linked in the PR description.
