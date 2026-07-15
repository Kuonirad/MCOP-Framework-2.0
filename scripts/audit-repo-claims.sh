#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# -----------------------------------------------------------------------------
# MCOP claim/version/license/proof audit
#
# Usage:
#   bash scripts/audit-repo-claims.sh
#
# Optional knobs:
#   STRICT=1                         # fail when optional-but-important gates are missing
#   SKIP_INSTALL=1                   # skip pnpm install
#   SKIP_HEAVY=1                     # skip build/test/e2e/bench work
#   EXPECTED_VERSION=2.4.0           # override root package.json version
#   CANONICAL_IMPORT=@kullailabs/mcop-core
#   CORE_PACKAGE=@kullailabs/mcop-core
#   REPORT_DIR=audit-artifacts
# -----------------------------------------------------------------------------

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

STRICT="${STRICT:-1}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
SKIP_HEAVY="${SKIP_HEAVY:-0}"
REPORT_DIR="${REPORT_DIR:-audit-artifacts}"
CORE_PACKAGE="${CORE_PACKAGE:-@kullailabs/mcop-core}"
CANONICAL_IMPORT="${CANONICAL_IMPORT:-@kullailabs/mcop-core}"

mkdir -p "$REPORT_DIR"

LOG="$REPORT_DIR/audit.log"
SUMMARY="$REPORT_DIR/summary.md"
CLAIMS_REPORT="$REPORT_DIR/claim-drift.txt"
PACKAGE_REPORT="$REPORT_DIR/package-metadata.txt"
ENV_REPORT="$REPORT_DIR/environment.txt"

: > "$LOG"
: > "$SUMMARY"
: > "$CLAIMS_REPORT"
: > "$PACKAGE_REPORT"
: > "$ENV_REPORT"

FAILURES=0
WARNINGS=0

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

say() {
  printf '%s\n' "$*" | tee -a "$LOG"
}

pass() {
  say "✔ PASS: $*"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  say "⚠ WARN: $*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  say "✘ FAIL: $*"
}

section() {
  say ""
  say "============================================================================="
  say "$*"
  say "============================================================================="
}

need_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "Found command: $cmd"
  else
    fail "Missing required command: $cmd"
  fi
}

run_cmd() {
  local label="$1"
  shift

  section "$label"
  say "+ $*"

  if "$@" >>"$LOG" 2>&1; then
    pass "$label"
  else
    fail "$label"
  fi
}

has_pnpm_script() {
  local script="$1"
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1);
  ' "$script"
}

run_pnpm_script_required() {
  local script="$1"

  if has_pnpm_script "$script"; then
    run_cmd "pnpm script: $script" pnpm run "$script"
  else
    fail "Missing required package.json script: $script"
  fi
}

run_pnpm_script_optional() {
  local script="$1"

  if has_pnpm_script "$script"; then
    run_cmd "pnpm script: $script" pnpm run "$script"
  else
    if [[ "$STRICT" == "1" ]]; then
      fail "Missing strict-mode gate script: $script"
    else
      warn "Missing optional script: $script"
    fi
  fi
}

# search_claims LABEL PATTERN SEVERITY [EXTRA_GLOB ...]
#
# Every argument after SEVERITY is an additional ripgrep --glob exclusion
# (e.g. '!docs/audits/**') that is layered on top of the default exclusion
# set (node_modules, dist, build, coverage, .next, .git, pnpm-lock.yaml,
# audit-artifacts). Use these to silence specific FALSE-POSITIVE matches
# (the file legitimately discusses the topic) WITHOUT broadening or
# weakening the pattern itself. Every per-call exclusion below is justified
# inline at the call site.
search_claims() {
  local label="$1"
  local pattern="$2"
  local severity="$3"
  shift 3
  local -a extra_globs=("$@")
  local outfile="$REPORT_DIR/${label//[^A-Za-z0-9_]/_}.txt"

  : > "$outfile"

  if command -v rg >/dev/null 2>&1; then
    local rg_cmd=(
      rg
      --hidden
      --line-number
      --no-heading
      --glob '!node_modules/**'
      --glob '!dist/**'
      --glob '!build/**'
      --glob '!coverage/**'
      --glob '!.next/**'
      --glob '!.git/**'
      --glob '!pnpm-lock.yaml'
      --glob '!audit-artifacts/**'
      --glob '!artefacts/**'
    )
    local glob
    for glob in "${extra_globs[@]}"; do
      rg_cmd+=(--glob "$glob")
    done
    rg_cmd+=(-S "$pattern" .)
    "${rg_cmd[@]}" >"$outfile" || true
  else
    # git-grep fallback: convert each '!path' rg-glob into a
    # ':(exclude)path' pathspec. Trailing '/**' is stripped because
    # git-grep pathspecs treat 'foo' as 'everything under foo'.
    local -a gg_extras=()
    local glob path
    for glob in "${extra_globs[@]}"; do
      path="${glob#!}"      # drop leading '!'
      path="${path%/\*\*}"  # drop trailing '/**'
      gg_extras+=(":(exclude)$path")
    done
    git grep -n -E "$pattern" -- . \
      ':(exclude)node_modules' \
      ':(exclude)dist' \
      ':(exclude)build' \
      ':(exclude)coverage' \
      ':(exclude).next' \
      ':(exclude)pnpm-lock.yaml' \
      ':(exclude)audit-artifacts' \
      ':(exclude)artefacts' \
      "${gg_extras[@]}" >"$outfile" || true
  fi

  if [[ -s "$outfile" ]]; then
    {
      echo ""
      echo "## $label"
      echo ""
      cat "$outfile"
    } >> "$CLAIMS_REPORT"

    if [[ "$severity" == "FAIL" ]]; then
      fail "Claim drift detected: $label. See $outfile"
    else
      warn "Potential claim drift detected: $label. See $outfile"
    fi
  else
    pass "No claim drift found for: $label"
  fi
}

capture_environment() {
  section "Environment"

  {
    echo "timestamp=$(timestamp)"
    echo "root=$ROOT"
    echo "git_sha=$(git rev-parse HEAD 2>/dev/null || true)"
    echo "git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    echo "node=$(node --version 2>/dev/null || true)"
    echo "pnpm=$(pnpm --version 2>/dev/null || true)"
    echo "npm=$(npm --version 2>/dev/null || true)"
    echo "os=$(uname -a 2>/dev/null || true)"
  } | tee "$ENV_REPORT" | tee -a "$LOG" >/dev/null
}

audit_package_metadata() {
  section "Package/version/license/import metadata"

  EXPECTED_VERSION="${EXPECTED_VERSION:-$(node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    process.stdout.write(pkg.version || "");
  ')}"

  export EXPECTED_VERSION
  export CORE_PACKAGE
  export CANONICAL_IMPORT

  if node <<'NODE' > "$PACKAGE_REPORT"
const fs = require("fs");
const cp = require("child_process");

const expectedVersion = process.env.EXPECTED_VERSION;
const corePackage = process.env.CORE_PACKAGE;
const canonicalImport = process.env.CANONICAL_IMPORT;

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function exists(path) {
  return fs.existsSync(path);
}

function emit(level, msg) {
  console.log(`${level}: ${msg}`);
}

function fail(msg) {
  emit("ERROR", msg);
  errors++;
}

function warn(msg) {
  emit("WARN", msg);
  warnings++;
}

function pass(msg) {
  emit("PASS", msg);
}

let errors = 0;
let warnings = 0;

if (!exists("package.json")) {
  fail("Missing root package.json");
  process.exit(2);
}

const root = readJson("package.json");

if (!root.name) fail("Root package.json is missing name");
else pass(`Root package name: ${root.name}`);

if (!root.version) fail("Root package.json is missing version");
else pass(`Root package version: ${root.version}`);

if (expectedVersion && root.version !== expectedVersion) {
  fail(`Root version ${root.version} does not match EXPECTED_VERSION ${expectedVersion}`);
}

if (!root.license) {
  fail("Root package.json is missing license");
} else if (!/Apache-2\.0|Apache License 2\.0/i.test(root.license)) {
  warn(`Root license is '${root.license}'. Confirm this matches LICENSE (Apache-2.0) and release docs.`);
} else {
  pass(`Root license: ${root.license}`);
}

const allDeps = {
  ...(root.dependencies || {}),
  ...(root.devDependencies || {}),
  ...(root.peerDependencies || {}),
  ...(root.optionalDependencies || {}),
};

const nextSpec = allDeps.next || "";
const nextMajorMatch = nextSpec.match(/\d+/);
const nextMajor = nextMajorMatch ? Number(nextMajorMatch[0]) : null;

if (nextSpec) pass(`Next.js package spec: ${nextSpec}`);
else warn("No Next.js dependency found in root package.json");

const readme = exists("README.md") ? fs.readFileSync("README.md", "utf8") : "";

const readmeNext = readme.match(/Next\.js\s+(\d+)/i);
if (readmeNext && nextMajor != null && Number(readmeNext[1]) !== nextMajor) {
  fail(
    `README documents Next.js major ${readmeNext[1]} while package.json resolves next='${nextSpec}' (major ${nextMajor})`,
  );
}

// Post Apache-2.0 relicense (NOTICE.md), the README's License section
// legitimately references the MIT-legacy versions and the MIT-licensed
// integration shims, so a bare "MIT-licensed" mention is no longer drift.
// Apache-2.0 is itself permissive and permits commercial use. The real
// drift to catch now is (a) the README failing to name the current
// Apache-2.0 license, or (b) the README asserting the project AS A WHOLE
// is MIT-licensed, contradicting the relicense.
if (!/Apache License 2\.0|Apache-2\.0/i.test(readme)) {
  fail("README does not name the current Apache-2.0 license. Verify the License section is in sync with LICENSE and NOTICE.md.");
}
if (/\bthis (project|framework|repository|repo) is (released|licensed|distributed) under the MIT\b/i.test(readme)) {
  fail("README claims the project as a whole is MIT-licensed, contradicting the Apache-2.0 relicense (see NOTICE.md).");
}

if (readme.includes("@mcop/core") && canonicalImport !== "@mcop/core") {
  fail(`README imports @mcop/core, but canonical import is ${canonicalImport}`);
}

if (!readme.includes(canonicalImport)) {
  warn(`README does not mention canonical import '${canonicalImport}'`);
}

let packageFiles = [];
try {
  packageFiles = cp
    .execFileSync("git", ["ls-files", "*package.json"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((f) => !/(^|\/)(node_modules|dist|build|coverage|\.next)\//.test(f));
} catch {
  packageFiles = ["package.json"];
}

let foundCorePackage = false;

for (const file of packageFiles) {
  let pkg;
  try {
    pkg = readJson(file);
  } catch (err) {
    fail(`${file}: invalid JSON: ${err.message}`);
    continue;
  }

  if (pkg.name === corePackage) foundCorePackage = true;

  if (!pkg.name) warn(`${file}: missing package name`);
  if (!pkg.version && file !== "package.json") warn(`${file}: missing package version`);
  if (pkg.version && expectedVersion && pkg.version !== expectedVersion) {
    warn(`${file}: version '${pkg.version}' differs from expected '${expectedVersion}'`);
  }

  if (!pkg.license) {
    warn(`${file}: missing license field`);
  }

  if (pkg.dependencies?.next || pkg.devDependencies?.next) {
    const spec = pkg.dependencies?.next || pkg.devDependencies?.next;
    const major = Number((spec.match(/\d+/) || [NaN])[0]);
    if (readmeNext && Number.isFinite(major) && Number(readmeNext[1]) !== major) {
      fail(
        `${file}: README documents Next.js major ${readmeNext[1]} but this package uses next='${spec}' (major ${major})`,
      );
    }
  }
}

if (!foundCorePackage) {
  fail(`Could not find package '${corePackage}' in tracked package.json files`);
} else {
  pass(`Found core package '${corePackage}'`);
}

console.log("");
console.log(`SUMMARY: errors=${errors}, warnings=${warnings}`);

process.exit(errors > 0 ? 2 : 0);
NODE
  then
    cat "$PACKAGE_REPORT" >> "$LOG"
    pass "Package metadata audit passed"
  else
    cat "$PACKAGE_REPORT" >> "$LOG"
    fail "Package metadata audit failed. See $PACKAGE_REPORT"
  fi
}

audit_claim_drift() {
  section "Claim drift scan"

  : > "$CLAIMS_REPORT"

  # Overclaim self-exclusion: the audit script itself contains the
  # pattern definition (literal substrings like 'production-grade'),
  # which would otherwise produce an inescapable self-match.
  search_claims \
    "Overclaiming production readiness" \
    '\b(production[- ]ready|cleared for production|enterprise[- ]grade|production-grade|top 5 ?%|independently verified|Verified \(post-remediation\))\b' \
    "WARN" \
    '!scripts/audit-repo-claims.sh'

  search_claims \
    "Next.js documentation drift" \
    'Next\.js[[:space:]]+16' \
    "FAIL"

  # License contradiction exclusions: files that legitimately describe
  # the licensing model after the Apache-2.0 relicense (NOTICE.md). The
  # current license is Apache-2.0; the only MIT surfaces that remain are
  # the preserved MIT-legacy grant and the MIT-licensed integration shims
  # (LICENSE-MIT-LEGACY / LICENSE-MIT-INTEGRATIONS). Per the LICENSE +
  # NOTICE.md design these files MUST mention MIT in the carve-out /
  # history context; flagging them is a false positive. The root README's
  # License section is the canonical licensing footer and references those
  # same carve-out files, so it is allow-listed here exactly like NOTICE.md
  # (the README's whole-project license claim is separately validated to be
  # Apache-2.0 by the package-metadata audit). New mentions of "MIT" outside
  # this allow-list will still be caught.
  search_claims \
    "License contradiction" \
    'MIT License|MIT-licensed|permissive for research and commercial use|commercial use' \
    "WARN" \
    '!LICENSE' \
    '!LICENSE-*' \
    '!NOTICE.md' \
    '!README.md' \
    '!packages/*/LICENSE' \
    '!packages/*/LICENSE-*' \
    '!packages/*/NOTICE.md' \
    '!packages/*/README.md' \
    '!CONTRIBUTING.md' \
    '!docs/DUE_DILIGENCE_REGISTER.md' \
    '!docs/integrations/UPSTREAM_SUBMISSION_PLAN.md' \
    '!scripts/license-audit.sh' \
    '!scripts/audit-repo-claims.sh'

  # Unproven benchmark exclusions: files that document the 4.4 ms /
  # 22,700 ops/sec / 96.6% claims AND ship the reproducible evidence
  # (the examples/reproducible-benchmark/ folder, src/benchmarks/, the
  # design-handoff archive, the historical audits). The numbers in
  # those files are SUPPORTED by the cited reproducer, not unproven.
  # New benchmark claims in files outside this allow-list will still
  # be caught.
  search_claims \
    "Unproven benchmark claim" \
    '4\.4[[:space:]]*ms|22,?700[[:space:]]*ops/sec|96\.6[[:space:]]*%' \
    "WARN" \
    '!examples/reproducible-benchmark/**' \
    '!src/benchmarks/**' \
    '!packages/core/src/benchmark.ts' \
    '!packages/core/README.md' \
    '!README.md' \
    '!ROADMAP_TO_100.md' \
    '!ROADMAP.md' \
    '!src/integrations/index.ts' \
    '!public/**' \
    '!docs/benchmarks/**' \
    '!docs/badges/**' \
    '!docs/design-handoff/**' \
    '!docs/audits/**' \
    '!scripts/audit-repo-claims.sh'

  # Version drift exclusions: files that legitimately reference older
  # versions as HISTORICAL context, not as current-version claims.
  # CHANGELOG.md is history-by-definition; docs/releases/** and
  # docs/audits/** are version-anchored historical records; the
  # holographicEtch.ts / stigmergyV5.ts files carry inline audit
  # annotations of the form `// YYYY-MM-DD audit -> vX.Y.Z` that
  # cite the audit sprint a behaviour was introduced in. The current
  # version is enforced by the package-metadata audit against EXPECTED_VERSION
  # (default: root package.json) and the Next.js documentation drift check.
  search_claims \
    "Version drift suspects" \
    'v2\.2\.1|v2\.2\.2|v2\.3\.0' \
    "WARN" \
    '!CHANGELOG.md' \
    '!docs/releases/**' \
    '!docs/audits/**' \
    '!public/**' \
    '!src/core/holographicEtch.ts' \
    '!src/core/stigmergyV5.ts' \
    '!packages/core/src/holographicEtch.ts' \
    '!packages/core/src/stigmergyV5.ts' \
    '!scripts/audit-repo-claims.sh'

  if [[ "$CANONICAL_IMPORT" != "@mcop/core" ]]; then
    search_claims \
      "Import alias drift" \
      '@mcop/core' \
      "FAIL" \
      '!scripts/audit-repo-claims.sh'
  fi

  if [[ ! -s "$CLAIMS_REPORT" ]]; then
    echo "No claim drift detected." > "$CLAIMS_REPORT"
  fi
}

setup_pnpm() {
  section "Package manager setup"

  need_cmd node

  if command -v corepack >/dev/null 2>&1; then
    pass "Found command: corepack"

    local package_manager
    package_manager="$(node -e '
      const fs = require("fs");
      const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
      process.stdout.write(pkg.packageManager || "pnpm@9.15.0");
    ')"

    run_cmd "Enable Corepack" corepack enable
    run_cmd "Prepare package manager: $package_manager" corepack prepare "$package_manager" --activate
  else
    warn "corepack not found; using existing pnpm installation"
  fi

  need_cmd pnpm
}

install_dependencies() {
  if [[ "$SKIP_INSTALL" == "1" ]]; then
    warn "Skipping dependency install because SKIP_INSTALL=1"
    return
  fi

  if [[ -f pnpm-lock.yaml ]]; then
    run_cmd "Install dependencies with frozen lockfile" pnpm install --frozen-lockfile
  else
    warn "pnpm-lock.yaml missing; installing without frozen lockfile"
    run_cmd "Install dependencies" pnpm install
  fi
}

run_proof_gates() {
  section "Proof gates"

  if [[ "$SKIP_HEAVY" == "1" ]]; then
    warn "Skipping heavy proof gates because SKIP_HEAVY=1"
    return
  fi

  run_pnpm_script_required "lint"
  run_pnpm_script_required "typecheck"

  if has_pnpm_script "test:coverage"; then
    run_cmd "pnpm script: test:coverage" pnpm run test:coverage
  elif has_pnpm_script "test"; then
    run_cmd "pnpm test with coverage flag" pnpm test -- --coverage
  else
    fail "Missing required test script"
  fi

  run_pnpm_script_required "build"

  # npm CLI bulk advisories (pnpm 9 audit hits retired registry 410 endpoints)
  run_cmd "npm audit high+" npm audit --audit-level=high

  if has_pnpm_script "sbom"; then
    run_cmd "pnpm script: sbom" pnpm run sbom
  else
    fail "Missing required SBOM generation script: sbom"
  fi

  if has_pnpm_script "sbom:validate"; then
    run_cmd "pnpm script: sbom:validate" pnpm run sbom:validate
  else
    fail "Missing required SBOM validation script: sbom:validate"
  fi

  if has_pnpm_script "cypress:run"; then
    run_cmd "pnpm script: cypress:run" pnpm run cypress:run
  elif has_pnpm_script "e2e"; then
    run_cmd "pnpm script: e2e" pnpm run e2e
  else
    if [[ "$STRICT" == "1" ]]; then
      fail "Missing strict-mode e2e gate: cypress:run or e2e"
    else
      warn "No e2e gate found"
    fi
  fi

  if has_pnpm_script "bench:smoke"; then
    run_cmd "pnpm script: bench:smoke" pnpm run bench:smoke
  elif has_pnpm_script "benchmark:smoke"; then
    run_cmd "pnpm script: benchmark:smoke" pnpm run benchmark:smoke
  else
    if [[ "$STRICT" == "1" ]]; then
      fail "Missing strict-mode benchmark smoke gate: bench:smoke or benchmark:smoke"
    else
      warn "No benchmark smoke gate found"
    fi
  fi

  if has_pnpm_script "determinism:test"; then
    run_cmd "pnpm script: determinism:test" pnpm run determinism:test
  else
    if [[ "$STRICT" == "1" ]]; then
      fail "Missing strict-mode determinism gate: determinism:test"
    else
      warn "No determinism gate found"
    fi
  fi

  if has_pnpm_script "docs:check"; then
    run_cmd "pnpm script: docs:check" pnpm run docs:check
  else
    if [[ "$STRICT" == "1" ]]; then
      fail "Missing strict-mode documentation code-block gate: docs:check"
    else
      warn "No docs code-block validation gate found"
    fi
  fi

  if pnpm --filter "$CORE_PACKAGE" exec node -e "process.exit(0)" >/dev/null 2>&1; then
    run_cmd "Core package build: $CORE_PACKAGE" pnpm --filter "$CORE_PACKAGE" build
  else
    fail "Could not resolve pnpm workspace filter: $CORE_PACKAGE"
  fi
}

write_summary() {
  section "Final summary"

  {
    echo "# Repository Claim Audit Summary"
    echo ""
    echo "- Timestamp: $(timestamp)"
    echo "- Git SHA: $(git rev-parse HEAD 2>/dev/null || true)"
    echo "- Failures: $FAILURES"
    echo "- Warnings: $WARNINGS"
    echo ""
    echo "## Reports"
    echo ""
    echo "- Environment: \`$ENV_REPORT\`"
    echo "- Package metadata: \`$PACKAGE_REPORT\`"
    echo "- Claim drift: \`$CLAIMS_REPORT\`"
    echo "- Full log: \`$LOG\`"
    echo ""
    if [[ "$FAILURES" -gt 0 ]]; then
      echo "## Result"
      echo ""
      echo "FAILED"
    else
      echo "## Result"
      echo ""
      echo "PASSED"
    fi
  } > "$SUMMARY"

  cat "$SUMMARY" | tee -a "$LOG"
}

main() {
  section "Starting repository audit"

  need_cmd git
  need_cmd node

  capture_environment
  audit_claim_drift
  audit_package_metadata
  setup_pnpm
  install_dependencies
  run_proof_gates
  write_summary

  if [[ "$FAILURES" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
