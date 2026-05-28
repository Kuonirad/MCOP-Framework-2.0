#!/usr/bin/env bash
# audit-debt.sh — surface technical-debt / pre-bug signals across the repo.
#
# Invoked via `just audit-debt`. Read-only: it never modifies the tree.
# Exit code is always 0 (informational); CI can grep the output if it wants
# to gate on a specific category.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
count()   { grep -rIl "$@" 2>/dev/null | wc -l | tr -d ' '; }

# --- debt:dead-code -----------------------------------------------------------
section "debt:dead-code — superseded / archival candidates"
for path in mcop_cuda_server; do
  if [ -e "$path" ]; then
    echo "  ! $path present — confirm migration note before removal"
  fi
done
git ls-files | grep -iE 'legacy|cluster.*\.(py|ts|js)$|deprecated' || echo "  (no obvious legacy/cluster artifacts tracked)"

# --- debt:documentation -------------------------------------------------------
section "debt:documentation — inline markers"
markers=$(grep -rInE 'TODO|FIXME|XXX|HACK|DEBT' \
  --include='*.py' --include='*.ts' --include='*.js' --include='*.md' \
  . 2>/dev/null | grep -v node_modules || true)
if [ -n "$markers" ]; then echo "$markers"; else echo "  (no inline debt markers found)"; fi

# --- debt:compliance ----------------------------------------------------------
section "debt:compliance — security posture artifacts"
for f in SECURITY.md docs/SECURITY-POSTURE-NOTES.md .github/workflows/scorecard.yml; do
  if [ -e "$f" ]; then echo "  ok  $f present"; else echo "  !!  $f MISSING"; fi
done
echo "  legacy license/header sweep candidates:"
grep -rIl -E 'BUSL|MIT-LEGACY' . 2>/dev/null | grep -v node_modules | sed 's/^/    /' \
  || echo "    (none found)"

# --- debt:reproducibility -----------------------------------------------------
section "debt:reproducibility — build determinism signals"
if [ -e .github/workflows/reproducible-build.yml ]; then
  echo "  ok  double-build diff workflow present"
else
  echo "  !!  no reproducible-build (double-build diff) workflow — roadmap Q4 item"
fi

section "Done"
echo "File matching backlog categories above as [DEBT] issues using"
echo ".github/ISSUE_TEMPLATE/technical_debt.md and the debt:* labels."
