#!/usr/bin/env bash
# scripts/scorecard-dismiss-informational.sh
#
# Dismiss the six informational OSSF Scorecard TokenPermissionsID alerts that
# correspond to legitimate, security-reviewed uses of `contents: write` at the
# job level. Each alert has an inline justification comment in its workflow
# file and a row in docs/SECURITY-POSTURE-NOTES.md.
#
# This is a MAINTAINER tool. It requires a fine-grained personal access token
# with `security_events: write` scope on Kuonirad/MCOP-Framework-2.0.
#
# Usage:
#   export GITHUB_TOKEN=<PAT with security_events:write>
#   bash scripts/scorecard-dismiss-informational.sh
#
# Idempotent: re-running on an already-dismissed alert returns the same
# PATCH response without re-opening or rewriting history.

set -euo pipefail

REPO="${REPO:-Kuonirad/MCOP-Framework-2.0}"

if ! command -v gh >/dev/null 2>&1; then
  echo "::error::gh CLI is required (install: https://cli.github.com/)." >&2
  exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ] && ! gh auth status >/dev/null 2>&1; then
  echo "::error::GITHUB_TOKEN is not set and gh CLI is not authenticated." >&2
  echo "Either export GITHUB_TOKEN or run \`gh auth login\` first." >&2
  exit 1
fi

COMMENT="$(cat <<'EOM'
Dismissed under PARP v1.0 L1 with inline workflow justification.
See docs/SECURITY-POSTURE-NOTES.md and the per-workflow comment block
that names the specific step requiring contents:write and explains
why no narrower scope exists in GitHub's permission model.
EOM
)"

# Informational TokenPermissionsID alerts with inline justifications:
#   #9  publish-npm.yml             SBOM attachment to GitHub Release
#   #10 publish-pypi.yml            Immutable Release lifecycle + SBOMs
#   #44 auto-close-bot-prs.yml      git.deleteRef on closed bot PR branches
#   #45 delete-merged-branches.yml  git.deleteRef on merged PR head branch
#   #46 delete-stale-bot-branches   gh api DELETE refs/heads/<branch>
#   #47 release-drafter.yml         release-drafter action minimum perms
ALERTS=(9 10 44 45 46 47)

for alert in "${ALERTS[@]}"; do
  echo "Dismissing alert #${alert}…"
  gh api \
    -X PATCH "/repos/${REPO}/code-scanning/alerts/${alert}" \
    -f state=dismissed \
    -f dismissed_reason="won't fix" \
    -f dismissed_comment="${COMMENT}" \
    >/dev/null
  echo "  done #${alert}"
done

echo
echo "All 6 informational TokenPermissionsID alerts dismissed."
echo "Verify with: gh api /repos/${REPO}/code-scanning/alerts?state=open --jq '[.[] | select(.rule.id==\"TokenPermissionsID\")] | length'"
