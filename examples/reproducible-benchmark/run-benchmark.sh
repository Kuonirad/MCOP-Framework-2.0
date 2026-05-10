#!/usr/bin/env bash
# Reproducible-benchmark entrypoint.
#
# Re-runs `BENCHMARK_GENERATE=1 pnpm test -- benchmarks` against the
# deterministic mock LLM in `src/benchmarks/promptingModes.ts`, then defers to
# `verify-benchmark` to:
#
#   1. Diff the regenerated `docs/benchmarks/results.json` against the
#      committed snapshot (must be byte-identical for PASS).
#   2. Compute SHA-256 of the regenerated artefact.
#   3. Emit `/out/manifest.json` with the SHA + verifier metadata + an
#      ISO8601 verified-at timestamp.
#
# This script is the single source of truth for how the bundle reproduces the
# canonical snapshot — anything that wraps it (Compose, CI, the Jupyter
# notebook) calls it without arguments.

set -Eeuo pipefail

WORKSPACE="${WORKSPACE:-/workspace}"
OUT_DIR="${OUT_DIR:-/out}"
RESULTS_PATH="${WORKSPACE}/docs/benchmarks/results.json"

mkdir -p "${OUT_DIR}"

echo "==> Reproducing the deterministic prompting-mode benchmark"
echo "    Workspace : ${WORKSPACE}"
echo "    Snapshot  : ${RESULTS_PATH}"
echo "    Out dir   : ${OUT_DIR}"

cd "${WORKSPACE}"

# Capture the committed snapshot before we overwrite it so verify.sh can
# byte-diff regenerated vs. baseline.
cp "${RESULTS_PATH}" "${OUT_DIR}/results.committed.json"

# Re-run the benchmark suite with snapshot regeneration enabled. Uses the
# repo-blessed `benchmark:refresh` script which sets `BENCHMARK_GENERATE=1`
# and constrains jest to the benchmark suite alone.
pnpm run benchmark:refresh

cp "${RESULTS_PATH}" "${OUT_DIR}/results.regenerated.json"

# Defer to the verifier, which is the only thing allowed to write
# manifest.json. Keeping the verifier separate makes it usable from Jupyter
# (or from CI) without re-running the full test suite.
exec /usr/local/bin/verify-benchmark
