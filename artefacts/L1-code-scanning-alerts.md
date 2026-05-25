# L1 — GitHub Code Scanning Alerts Snapshot

**Fetched.** 2026-05-25 18:24 UTC, at `HEAD = e65d486079375d8ce0ccf359885de16a5f69cbc3`.
**Endpoint.** `GET /repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts?state=open&per_page=100`.
**Open total.** 9. **Dismissed total.** 0.

Raw payload: [`L1-code-scanning-alerts-open.json`](./L1-code-scanning-alerts-open.json) (full GitHub REST response, paginated). Summary projection: [`L1-code-scanning-alerts-summary.json`](./L1-code-scanning-alerts-summary.json).

All 9 alerts are emitted by the **OSSF Scorecard** tool (not CodeQL) at `security_severity_level=high`. They split into two categories:

## Category A — Per-workflow fixes (7 alerts, `TokenPermissionsID`)

Each affected workflow file is missing an explicit minimum `permissions:` block at job or workflow level. The standard fix is to add the smallest set of scopes the job needs (e.g. `permissions: { contents: read }`) at the top of the workflow, then narrow individual jobs further if they need write access.

| # | Workflow | Suggested L1/L4 fix |
|---|----------|---------------------|
| 9  | `.github/workflows/publish-npm.yml:66`            | Add explicit `permissions:` block; narrow to `id-token: write` only on the publish job, `contents: read` elsewhere. |
| 10 | `.github/workflows/publish-pypi.yml:173`          | Same — `id-token: write` on the upload-to-PyPI job, `contents: read` elsewhere. |
| 44 | `.github/workflows/auto-close-bot-prs.yml:16`     | `permissions: { pull-requests: write, contents: read }`. |
| 45 | `.github/workflows/delete-merged-branches.yml:15` | `permissions: { contents: write }` (branch deletion) on the relevant job, `contents: read` at workflow level. |
| 46 | `.github/workflows/delete-stale-bot-branches.yml:24` | Same as #45. |
| 47 | `.github/workflows/release-drafter.yml:16`        | `permissions: { contents: write, pull-requests: write }` per `release-drafter` docs. |
| 48 | `.github/workflows/positive-resonance-ledger.yml:11` | `permissions: { contents: write }` on the ledger-commit job, `contents: read` at workflow level. |

**Branching.** Each fix goes on its own `fix/parp-cs-<number>-token-perms-<name>` branch and PR, per PARP §1 L5.
**Auth note.** Pushing workflow-touching branches via the default local git proxy fails ("OAuth App missing `workflow` scope"). Use the `$GITHUB_PAT_WORKFLOW` workaround documented in the environment knowledge: `git push "https://x-access-token:${GITHUB_PAT_WORKFLOW}@github.com/Kuonirad/MCOP-Framework-2.0.git" <branch>`.

## Category B — Repository-setting alerts (2 alerts, owner-only)

These cannot be closed by code changes alone; they require repository / org settings adjustments by an owner.

| # | Rule | What Scorecard wants | Action |
|---|------|----------------------|--------|
| 7  | `BranchProtectionID` | Branch protection on `main`: required status checks, required reviews, dismissal of stale reviews, signed commits where applicable. | Owner: configure branch protection per OSSF Scorecard recommendation; document in `GOVERNANCE.md`. |
| 27 | `CodeReviewID`       | Evidence of mandatory code-review on every merged PR over the rolling Scorecard window. | Owner: enable "Require a pull request before merging" + "Require approvals: ≥1" on `main`; this scorecard signal will improve organically over the next 30 days as new PRs land. |

If either alert is intentionally accepted as residual risk, dismiss with `reason=won't_fix` in the GitHub UI and record the rationale in `docs/SECURITY-POSTURE-NOTES.md` (new file, to be added in L4 follow-up).

---

## L1 / L4 Exit Criteria Recap

A future PARP L7 release-gate run MUST observe: `state=open` count = 0 (or every open alert has an explicit dismissal justification linked from the PARP execution issue). The check can be automated by extending `pnpm audit:parp-baseline` to fail when `jq 'length' artefacts/L1-code-scanning-alerts-open.json > 0` is true without a matching dismissal record.
