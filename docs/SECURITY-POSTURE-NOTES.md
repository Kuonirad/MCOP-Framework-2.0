# Security Posture Notes

This document captures **maintainer-facing rationale** for security findings that are surfaced by automated tooling (currently OSSF Scorecard via GitHub Code Scanning) but represent intentional, security-reviewed decisions rather than vulnerabilities. It is produced and maintained per the **Phoenix Audit & Remediation Protocol (PARP) v1.0** ([`docs/audits/PARP-v1.0.md`](audits/PARP-v1.0.md)).

The purpose of this document is twofold:

1. Give an outside auditor (or a future maintainer) a single, citable place that explains **why** every still-open security alert is open.
2. Provide ready-to-run CLI commands to **dismiss** the informational alerts after the corresponding inline justification has been merged, so the GitHub Code Scanning queue stays at zero.

---

## OSSF Scorecard — `TokenPermissionsID` (informational warnings)

OSSF Scorecard's [Token-Permissions](https://github.com/ossf/scorecard/blob/main/docs/checks.md#token-permissions) check verifies that each workflow follows the principle of least privilege for the `GITHUB_TOKEN`. The check's **highest-score configuration** is:

- Workflow-level `permissions:` set to `contents: read` (or `read-all`).
- Per-job `permissions:` blocks declaring only the minimum write scope each job actually needs.

This is exactly the pattern the MCOP-Framework-2.0 workflows follow after PR #751 and PR #(this one). However, Scorecard's heuristic **also emits a finding for any `contents: write` declaration**, regardless of whether the use is legitimate. Those findings are documented per-workflow in the table below.

### Per-alert justification

| Alert | Workflow | Step / action requiring `contents: write` | Why this is the minimum scope |
|---|---|---|---|
| [#9](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/9) | `.github/workflows/publish-npm.yml` | `Attach SBOMs to GitHub Release` (`softprops/action-gh-release` step, SHA-pinned) | Attaches `mcop-framework.cdx.json` + `mcop-core.cdx.json` as release assets. Required to satisfy PARP/MCOP invariant #4 (SBOM/CI integrity) and OSSF Scorecard's own SBOM check. Workflow-level scope is `contents: read`. |
| [#10](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/10) | `.github/workflows/publish-pypi.yml` | Release lifecycle on the `publish-pypi` job: delete-prior-release → create-draft-with-SBOMs → flip-to-published. Required by the repo's **Immutable Releases** setting, which forbids post-publish asset uploads. | GitHub has no narrower "release assets" scope. Workflow-level scope is `contents: read`; build and TestPyPI jobs have minimum scopes; only the final publish-pypi job carries the write capability. |
| [#44](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/44) | `.github/workflows/auto-close-bot-prs.yml` | `github.rest.git.deleteRef` on the head branch of each closed bot PR. | GitHub's permission model has no narrower "delete refs" scope. The job only operates on a hard-coded bot prefix regex (`^(bolt|palette|jules)\//i`) and explicitly skips allowlisted bots (Dependabot, Renovate, etc.). |
| [#45](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/45) | `.github/workflows/delete-merged-branches.yml` | `github.rest.git.deleteRef` on the merged PR's head branch — the entire purpose of the workflow. | The job explicitly refuses to delete the repository default branch (script line 22-25). Blast radius is one ref per invocation, only on `pull_request.closed` with `merged == true`. |
| [#46](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/46) | `.github/workflows/delete-stale-bot-branches.yml` | `gh api -X DELETE repos/$REPO/git/refs/heads/$branch` on stale bot branches matching a hard-coded pattern list. | Restricts targets to a narrow allowlist, skips protected branches, skips branches with open PRs, and requires >30 days of inactivity. `dry_run` default is `'true'` on manual dispatch. |
| [#47](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/47) | `.github/workflows/release-drafter.yml` | `release-drafter/release-drafter` action (SHA-pinned, v7.3.1) creating/updating draft Release objects. | These are the documented minimum permissions for the action (see the [`release-drafter` README](https://github.com/release-drafter/release-drafter#permissions)). Workflow-level scope is `contents: read`. |
| ~~[#48](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/48)~~ | ~~`.github/workflows/positive-resonance-ledger.yml`~~ | Resolved by [PR #751](https://github.com/Kuonirad/MCOP-Framework-2.0/pull/751) — `contents: write` moved from workflow level to job level. | — |

### Dismissal procedure (maintainer-only)

After this PR is merged and the inline justifications are visible in `main`, the six informational alerts can be closed with `dismissed_reason: "won't fix"` using the included script:

```bash
# Requires a personal access token with `security_events: write` scope.
# (The same scope that's used to read the Code Scanning queue.)
export GITHUB_TOKEN=<your fine-grained PAT with security_events:write>

# Dismisses all 6 informational TokenPermissionsID alerts with the
# PARP justification comment pointing at this document.
bash scripts/scorecard-dismiss-informational.sh
```

The script body is at [`scripts/scorecard-dismiss-informational.sh`](../scripts/scorecard-dismiss-informational.sh) and is also reproduced below for reference:

```bash
#!/usr/bin/env bash
# scripts/scorecard-dismiss-informational.sh — dismiss the 6 informational
# Scorecard TokenPermissionsID alerts after their inline justifications have
# landed in main. Run after merging the PR that introduces this script.

set -euo pipefail

REPO="${REPO:-Kuonirad/MCOP-Framework-2.0}"
COMMENT="$(cat <<'EOM'
Dismissed under PARP v1.0 L1 with inline workflow justification.
See docs/SECURITY-POSTURE-NOTES.md and the per-workflow comment block
that names the specific step requiring `contents: write` and explains
why no narrower scope exists in GitHub's permission model.
EOM
)"

for alert in 9 10 44 45 46 47; do
  echo "Dismissing alert #${alert}…"
  gh api \
    -X PATCH "/repos/${REPO}/code-scanning/alerts/${alert}" \
    -f state=dismissed \
    -f dismissed_reason="won't fix" \
    -f dismissed_comment="${COMMENT}" \
    >/dev/null
  echo "  ✓ #${alert} dismissed"
done

echo "Done. Re-running Scorecard via 'gh workflow run scorecard.yml' will"
echo "confirm the queue is empty for TokenPermissionsID."
```

The script is **idempotent** — running it again on an already-dismissed alert is a no-op (GitHub returns the same PATCH response).

---

## OSSF Scorecard — owner-only repository settings (cannot fix via code)

Two open alerts cannot be addressed by code changes because they depend on repository-level settings only the repository owner can modify:

| Alert | Rule | Required setting |
|---|---|---|
| [#7](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/7) | `BranchProtectionID` | Branch protection on `main` with required reviewers + required status checks. **Set under** Repo Settings → Branches → Branch protection rules → `main`. |
| [#27](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/27) | `CodeReviewID` | Required code review before merge (also under branch protection). |

Both will be re-evaluated on the next Scorecard run after the maintainer enables those settings; no code change is needed (or possible) from this side of the boundary.

---

## See also

- [`docs/audits/PARP-v1.0.md`](audits/PARP-v1.0.md) — the full Phoenix Audit & Remediation Protocol.
- [`artefacts/L1-code-scanning-alerts.md`](../artefacts/L1-code-scanning-alerts.md) — original L1 baseline categorization.
- [`scripts/scorecard-dismiss-informational.sh`](../scripts/scorecard-dismiss-informational.sh) — maintainer dismissal script.
- Tracking issue [#749](https://github.com/Kuonirad/MCOP-Framework-2.0/issues/749).
