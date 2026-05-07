#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-Kuonirad/MCOP-Framework-2.0}"
NOTES_DIR="docs/releases"

echo "==> GitHub Finalization Runner"
echo "    Repo: $REPO"
gh auth status -h github.com >/dev/null
[ "$(gh --version | head -1 | awk '{print $3}')" ] || { echo "gh missing"; exit 1; }

# STEP 1: Uninstall Bolt/Jules/Palette (user-scoped)
echo "==> Step 1: Uninstalling Bolt/Jules/Palette apps"
for SLUG in bolt-new jules palette; do
  ID=$(gh api /user/installations --jq \
    ".installations[] | select(.app_slug==\"$SLUG\") | .id" 2>/dev/null || true)
  if [ -n "${ID:-}" ]; then
    gh api -X DELETE "/user/installations/$ID" >/dev/null
    echo "  removed $SLUG (id=$ID)"
  else
    echo "  $SLUG not in user installations (check org-level manually)"
  fi
done

# STEP 2: Enable Discussions + auto-delete
echo "==> Step 2: Enable Discussions + auto-delete branches"
gh api --method PATCH "/repos/$REPO" \
  -f has_discussions=true -F delete_branch_on_merge=true \
  --jq '{discussions:.has_discussions, delete_branch:.delete_branch_on_merge}'

# STEP 3: Create releases
echo "==> Step 3: Creating releases"
declare -A REL=( [v2.0.1]=d2c7a14 [v2.0.2]=d47cbbe [v2.1.0]=c1dfcf3 )
declare -A TITLE=(
  [v2.0.1]="v2.0.1 — Onboarding & Dependency Maintenance"
  [v2.0.2]="v2.0.2 — Security Hygiene & CI Hardening"
  [v2.1.0]="v2.1.0 — Dialectical Hardening & Release Automation"
)
for TAG in v2.0.1 v2.0.2 v2.1.0; do
  NOTES="$NOTES_DIR/$TAG.md"
  [ -f "$NOTES" ] || { echo "ERROR: missing $NOTES"; exit 1; }
  if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
    echo "  $TAG exists — skipping"
  else
    gh release create "$TAG" --repo "$REPO" --target "${REL[$TAG]}" \
      --title "${TITLE[$TAG]}" --notes-file "$NOTES"
    echo "  created $TAG"
  fi
done

# STEP 4: Topics
echo "==> Step 4: Adding topics"
gh repo edit "$REPO" \
  --add-topic typescript \
  --add-topic nextjs \
  --add-topic agent-framework \
  --add-topic collective-intelligence \
  --add-topic stigmergy \
  --add-topic meta-cognitive-optimization \
  --add-topic arc-agi \
  --add-topic meta-cognitive \
  --add-topic evolutionary-ai \
  --add-topic research

# STEP 5: Trigger bot-PR cleanup workflow and wait for completion
echo "==> Step 5: Trigger auto-close-bot-prs"
BEFORE=$(gh api "repos/$REPO/branches?per_page=100" --paginate --jq length)
gh workflow run auto-close-bot-prs.yml --repo "$REPO"
RUN_ID=""
for _ in $(seq 1 12); do
  sleep 5
  RUN_ID=$(gh run list --repo "$REPO" \
    --workflow=auto-close-bot-prs.yml --limit 1 --json databaseId,status \
    --jq '.[0] | select(.status!="completed") | .databaseId' 2>/dev/null || true)
  [ -n "${RUN_ID:-}" ] && break
done
[ -n "${RUN_ID:-}" ] && gh run watch "$RUN_ID" --repo "$REPO" --exit-status || true
AFTER=$(gh api "repos/$REPO/branches?per_page=100" --paginate --jq length)
echo "  branches: $BEFORE -> $AFTER (expected drop ≈ 298)"

# STEP 6: Final stats + announcement reminder
STATS=$(gh api "repos/$REPO" \
  --jq '"stars=\(.stargazers_count) forks=\(.forks_count) watchers=\(.subscribers_count)"')
echo "==> Complete. $STATS"
echo "==> Projected score 92–95 (100 after ≥20 stars, ≥3 forks)"
echo "==> Post the Show HN / r/MachineLearning / X.com draft from"
echo "    /tmp/FINAL_ACTION_CHECKLIST.md §6 to 3 platforms within 24h."
