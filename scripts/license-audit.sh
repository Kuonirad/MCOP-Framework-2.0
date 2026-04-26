#!/usr/bin/env bash
# license-audit.sh — self-verifying license audit for the MCOP Framework 2.0.
#
# Verifies that the BUSL 1.1 relicense artefacts are internally consistent:
# required files exist, mirrored LICENSE copies are byte-identical to the
# root LICENSE, package metadata advertises BUSL-1.1, NOTICE/CONTRIBUTING/
# README contain the expected anchor strings, and llms.txt has not regressed
# back to advertising MIT for the live project.
#
# Exit code 0 => all checks pass. Any failure exits non-zero with a short
# diagnostic. Designed to run in CI with only `bash`, `grep`, `cmp` available.

set -euo pipefail

# Resolve repo root from the script's location so the script works whether it
# is invoked as `./scripts/license-audit.sh`, `bash scripts/license-audit.sh`,
# or from any other working directory.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

FAILED=0

fail() {
  printf '  ✗ %s\n' "$1" >&2
  FAILED=1
}

pass() {
  printf '  ✓ %s\n' "$1"
}

require_file() {
  local path="$1"
  if [[ -f "${path}" ]]; then
    pass "exists: ${path}"
  else
    fail "missing required file: ${path}"
  fi
}

require_grep() {
  # require_grep <file> <fixed-string> <human-readable-description>
  local file="$1"
  local needle="$2"
  local desc="$3"
  if [[ ! -f "${file}" ]]; then
    fail "${desc}: file ${file} not found"
    return
  fi
  if grep -qF -- "${needle}" "${file}"; then
    pass "${desc}"
  else
    fail "${desc} — expected substring not found in ${file}: ${needle}"
  fi
}

require_not_grep() {
  # require_not_grep <file> <fixed-string> <human-readable-description>
  local file="$1"
  local needle="$2"
  local desc="$3"
  if [[ ! -f "${file}" ]]; then
    fail "${desc}: file ${file} not found"
    return
  fi
  if grep -qF -- "${needle}" "${file}"; then
    fail "${desc} — forbidden substring still present in ${file}: ${needle}"
  else
    pass "${desc}"
  fi
}

echo "==> license-audit: required artefacts"
require_file "LICENSE"
require_file "LICENSE-MIT-LEGACY"
require_file "NOTICE.md"
require_file "CONTRIBUTING.md"
require_file "README.md"
require_file "packages/core/LICENSE"
require_file "packages/core/package.json"
require_file "mcop_package/LICENSE"
require_file "package.json"
require_file "public/llms.txt"

echo "==> license-audit: root LICENSE content"
require_grep "LICENSE" "Business Source License 1.1" "LICENSE names BUSL 1.1"
require_grep "LICENSE" "Additional Use Grant" "LICENSE includes Additional Use Grant block"
require_grep "LICENSE" "2030-04-26T00:00:00Z" "LICENSE pins Change Date 2030-04-26T00:00:00Z"
require_grep "LICENSE" "66438ea3fc57f4af80d4e9d38f769a4e65d7839b" "LICENSE pins anchor commit"
require_grep "LICENSE" "MIT License" "LICENSE names MIT as Change License"
require_not_grep "LICENSE" "you may NOT" "LICENSE does not contain restrictive 'you may NOT' phrasing"

echo "==> license-audit: mirrored LICENSE files match root"
if cmp -s "LICENSE" "packages/core/LICENSE"; then
  pass "packages/core/LICENSE matches root LICENSE byte-for-byte"
else
  fail "packages/core/LICENSE differs from root LICENSE"
fi
if cmp -s "LICENSE" "mcop_package/LICENSE"; then
  pass "mcop_package/LICENSE matches root LICENSE byte-for-byte"
else
  fail "mcop_package/LICENSE differs from root LICENSE"
fi

echo "==> license-audit: package metadata declares BUSL-1.1"
require_grep "package.json" "\"license\": \"BUSL-1.1\"" "root package.json declares BUSL-1.1"
require_grep "packages/core/package.json" "\"license\": \"BUSL-1.1\"" "packages/core/package.json declares BUSL-1.1"
require_grep "packages/core/package.json" "\"LICENSE\"" "packages/core/package.json files[] includes LICENSE"

echo "==> license-audit: NOTICE.md content"
require_grep "NOTICE.md" "License transition" "NOTICE.md describes the license transition"
require_grep "NOTICE.md" "66438ea3fc57f4af80d4e9d38f769a4e65d7839b" "NOTICE.md pins anchor commit"
require_grep "NOTICE.md" "2030-04-26" "NOTICE.md pins Change Date"
require_grep "NOTICE.md" "Prohibited Use Cases" "NOTICE.md enumerates Prohibited Use Cases"

echo "==> license-audit: CONTRIBUTING.md DCO"
require_grep "CONTRIBUTING.md" "Developer Certificate of Origin" "CONTRIBUTING.md references DCO"
require_grep "CONTRIBUTING.md" "Signed-off-by" "CONTRIBUTING.md requires Signed-off-by"

echo "==> license-audit: README.md license markers"
require_grep "README.md" "Business Source License 1.1" "README.md names BUSL 1.1"
require_grep "README.md" "LICENSE-MIT-LEGACY" "README.md links LICENSE-MIT-LEGACY"
require_grep "README.md" "NOTICE.md" "README.md links NOTICE.md"

echo "==> license-audit: public/llms.txt does not advertise stale MIT"
require_not_grep "public/llms.txt" "- License: MIT" "public/llms.txt does not advertise stale MIT"

echo "==> license-audit: SPDX headers on newly-added source files (soft-warn)"
# Soft-only: never sets FAILED. Requires a usable git ref to diff against.
# Honours $LICENSE_AUDIT_BASE_REF (CI sets this to the PR base) and falls back
# to origin/main, then main, then a no-op if no ref is available (fresh
# clones, detached HEAD, shallow CI checkouts without a base ref).
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  base_ref="${LICENSE_AUDIT_BASE_REF:-}"
  if [[ -z "${base_ref}" ]] && git rev-parse --verify --quiet origin/main >/dev/null; then
    base_ref="origin/main"
  fi
  if [[ -z "${base_ref}" ]] && git rev-parse --verify --quiet main >/dev/null; then
    base_ref="main"
  fi
  if [[ -n "${base_ref}" ]]; then
    added_sources=$(git diff --name-only --diff-filter=A "${base_ref}...HEAD" -- \
      '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' '*.py' 2>/dev/null || true)
    missing=0
    while IFS= read -r f; do
      [[ -z "${f}" ]] && continue
      [[ ! -f "${f}" ]] && continue
      if ! head -n 5 -- "${f}" | grep -qF "SPDX-License-Identifier: BUSL-1.1"; then
        printf '  ⚠ new source file missing SPDX header (soft-warn): %s\n' "${f}"
        missing=$((missing + 1))
      fi
    done <<< "${added_sources}"
    if [[ "${missing}" -eq 0 ]]; then
      pass "all newly-added source files carry the SPDX-License-Identifier header (or none added)"
    else
      printf '  ℹ %d newly-added source file(s) missing SPDX header — soft-warn only, build NOT failed\n' "${missing}"
    fi
  else
    pass "SPDX soft-warn skipped (no usable base ref)"
  fi
else
  pass "SPDX soft-warn skipped (not a git checkout)"
fi

echo
if [[ "${FAILED}" -ne 0 ]]; then
  echo "license-audit: FAIL" >&2
  exit 1
fi
echo "license-audit: OK"
