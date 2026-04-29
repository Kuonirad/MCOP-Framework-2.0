# Branch Hygiene Strategy — `bolt-*` Cleanup

**Context:** The repository currently carries **316 remote branches** with the `bolt-*` prefix, all created by an automated optimization tool. None have associated PRs or reviews. This creates contributor confusion and CI noise.

**Goal:** Reduce remote branch count to <10 (permanent branches + active feature work).

---

## Inventory

```bash
# Count total branches
curl -s -H "Authorization: token <PAT>" \
  "https://api.github.com/repos/Kuonirad/MCOP-Framework-2.0/branches?per_page=100&page=N" | jq '.[].name'

# Result: 316 branches across 4 pages (100 + 100 + 100 + 16)
# All match pattern: ^bolt-.*$
```

**Permanent branches (do NOT delete):**
- `main` — default branch
- `gh-pages` — if present for docs hosting

**Active human branches (review before deletion):**
- `feature/*` — feature work
- `chore/*` — maintenance
- `fix/*` — bug fixes
- `audit/*` — audit response work

**Automated branches (candidates for deletion):**
- `bolt-*` — all 316 branches

---

## Phase 1: Triage (Before Deletion)

Before mass-deleting `bolt-*` branches, verify none contain unmerged work worth preserving.

```bash
# List bolt branches with last commit date and author
for branch in $(git branch -r | grep 'origin/bolt-' | sed 's/origin\///'); do
  echo "=== $branch ==="
  git log origin/$branch --oneline -1
  echo
done | tee /tmp/bolt-branch-log.txt
```

**Decision matrix:**
| Last commit age | Commit count | Verdict |
|----------------|--------------|---------|
| < 7 days | > 1 | Keep for 30 days, re-evaluate |
| < 7 days | 1 | Delete (single speculative commit) |
| > 30 days | Any | Delete |

---

## Phase 2: Bulk Deletion

### Option A: GitHub API (Recommended)

```bash
#!/bin/bash
# delete-bolt-branches.sh
# Requires: GH_TOKEN with repo scope

REPO="Kuonirad/MCOP-Framework-2.0"
PAGE=1

while true; do
  branches=$(curl -s -H "Authorization: token $GH_TOKEN" \
    "https://api.github.com/repos/$REPO/branches?per_page=100&page=$PAGE" | \
    jq -r '.[].name | select(test("^bolt-"))')
  
  [ -z "$branches" ] && break
  
  for branch in $branches; do
    echo "Deleting: $branch"
    curl -s -X DELETE -H "Authorization: token $GH_TOKEN" \
      "https://api.github.com/repos/$REPO/git/refs/heads/$branch"
  done
  
  PAGE=$((PAGE + 1))
done
```

### Option B: gh CLI

```bash
gh repo view Kuonirad/MCOP-Framework-2.0 --json defaultBranchRef
# Then:
gh api repos/Kuonirad/MCOP-Framework-2.0/branches?per_page=100 | \
  jq '.[].name | select(test("^bolt-"))' | \
  xargs -I {} gh api -X DELETE repos/Kuonirad/MCOP-Framework-2.0/git/refs/heads/{}
```

---

## Phase 3: Prevention

Add `.github/workflows/delete-stale-bot-branches.yml`:

```yaml
name: Delete Stale Bot Branches
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6AM UTC
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Delete bolt-* branches older than 7 days
        run: |
          gh auth setup-git
          branches=$(gh api repos/${{ github.repository }}/branches?per_page=100 \
            --jq '.[].name | select(test("^bolt-"))')
          for branch in $branches; do
            last_commit=$(gh api repos/${{ github.repository }}/branches/$branch \
              --jq '.commit.commit.committer.date')
            days_old=$(( ($(date +%s) - $(date -d "$last_commit" +%s)) / 86400 ))
            if [ $days_old -gt 7 ]; then
              echo "Deleting $branch ($days_old days old)"
              gh api -X DELETE repos/${{ github.repository }}/git/refs/heads/$branch
            fi
          done
        env:
          GH_TOKEN: ${{ github.token }}
```

---

## Verification

After cleanup:

```bash
# Should return < 10
curl -s https://api.github.com/repos/Kuonirad/MCOP-Framework-2.0/branches?per_page=1 | jq length
```

---

## Risk Mitigation

- **Backup:** The branches are not deleted from git objects immediately; they can be restored from reflog for 90 days via GitHub support.
- **Notification:** Post a GitHub Discussion before bulk deletion warning contributors.
- **Grace period:** Wait 48h after posting before executing deletion.

---

*Drafted: 2026-04-30*
*Branch: audit/coverage-push*
