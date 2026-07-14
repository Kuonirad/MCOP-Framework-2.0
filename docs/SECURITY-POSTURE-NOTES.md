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
| [#9](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/9) | `.github/workflows/publish-npm.yml` | Immutable-safe npm Release lifecycle: reconcile state → create draft → upload and digest-check both SBOMs → publish → verify final assets. | Required to satisfy PARP/MCOP invariant #4 (SBOM/CI integrity) without mutating a published immutable Release. Exact published releases are preserved, mismatches are rejected, and only incomplete drafts are recreated. Workflow-level scope is `contents: read`; only the publish job carries write capability. |
| [#10](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/10) | `.github/workflows/publish-pypi.yml` | Immutable-safe PyPI Release lifecycle: reconcile state → create draft with SBOMs → publish → verify final assets. | GitHub has no narrower "release assets" scope. Exact published releases are preserved, mismatches are rejected, and only incomplete drafts are recreated. Workflow-level scope is `contents: read`; build and TestPyPI jobs have minimum scopes; only the final publish-pypi job carries the write capability. |
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

## OSSF Scorecard — `VulnerabilitiesID` (Tauri / wry GTK3 stack)

| Alert | Rule | Finding |
|---|---|---|
| [#30](https://github.com/Kuonirad/MCOP-Framework-2.0/security/code-scanning/30) | `VulnerabilitiesID` | OSV lists RUSTSEC INFO unmaintained gtk-rs **0.18** crates + glib **0.18.5** (RUSTSEC-2024-0429) + `proc-macro-error` pulled by the Tauri 2 Linux WebView (`webkit2gtk` / wry). |

### Why these cannot be version-bumped away

| Advisory class | IDs | Blocker |
|---|---|---|
| gtk-rs GTK3 unmaintained | RUSTSEC-2024-0411 … 0420 | **No patched crates** on crates.io; gtk3-rs is archived. Upstream recommends gtk4-rs, which wry/tauri do not use yet ([wry#1435](https://github.com/tauri-apps/wry/issues/1435), [tauri#11928](https://github.com/tauri-apps/tauri/issues/11928)). |
| glib unsoundness | RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g | Fixed only in **glib ≥ 0.20** (gtk4-rs). Cannot mix glib 0.20 with gtk 0.18. |
| proc-macro-error unmaintained | RUSTSEC-2024-0370 | Transitive of `glib-macros` 0.18 only. |

### What we *did* fix

| Class | Action |
|---|---|
| unic-* unmaintained (RUSTSEC-2025-0075/0080/0081/0098/0100) | Removed from the lockfile via `tauri-utils` → `urlpattern 0.6` patch (`apps/desktop/src-tauri/Cargo.toml`). |
| Regression gate | Desktop CI runs `cargo audit --deny warnings` with the allowlist in [`apps/desktop/src-tauri/.cargo/audit.toml`](../apps/desktop/src-tauri/.cargo/audit.toml). |
| Code Scanning noise | Scorecard SARIF is filtered by [`scripts/scorecard-filter-accepted-rust-vulns.mjs`](../scripts/scorecard-filter-accepted-rust-vulns.mjs) so **only non-allowlisted** OSV/RUSTSEC IDs open Code Scanning alerts. Raw Scorecard still publishes to scorecard.dev. |

### Dismissal (after filter lands on `main`)

```bash
gh api -X PATCH /repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts/30 \
  -f state=dismissed \
  -f dismissed_reason="won't fix" \
  -f dismissed_comment="Accepted Tauri/wry GTK3 Linux WebView stack; no crates.io patch until gtk4. See docs/SECURITY-POSTURE-NOTES.md and apps/desktop/src-tauri/.cargo/audit.toml. Unic advisories fixed. SARIF filter prevents re-open for allowlisted IDs only."
```

Or re-run Scorecard after the filter merge; a clean SARIF upload auto-closes the finding when no non-allowlisted RUSTSECs remain.

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
