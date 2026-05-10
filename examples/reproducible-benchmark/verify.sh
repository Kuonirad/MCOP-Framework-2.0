#!/usr/bin/env bash
# Reproducible-benchmark verifier.
#
# Asserts that the regenerated `docs/benchmarks/results.json` is
# byte-identical to the committed snapshot, computes a SHA-256 over the
# regenerated artefact, and emits `/out/manifest.json`.
#
# Exit codes:
#   0 — byte-identical; manifest written with verdict="pass"
#   1 — drift detected; manifest written with verdict="fail" + the diff
#       summary; exits non-zero so CI / docker run propagates failure.
#
# This script is intentionally callable on its own (independent of the test
# runner) so the Jupyter notebook can re-verify a previously-generated
# `out/results.regenerated.json` without spinning up Node.

set -Eeuo pipefail

OUT_DIR="${OUT_DIR:-/out}"
COMMITTED="${OUT_DIR}/results.committed.json"
REGENERATED="${OUT_DIR}/results.regenerated.json"
MANIFEST="${OUT_DIR}/manifest.json"

if [[ ! -f "${COMMITTED}" ]]; then
  echo "verify.sh: missing ${COMMITTED} — run run-benchmark.sh first." >&2
  exit 2
fi
if [[ ! -f "${REGENERATED}" ]]; then
  echo "verify.sh: missing ${REGENERATED} — run run-benchmark.sh first." >&2
  exit 2
fi

verified_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sha_committed="$(sha256sum "${COMMITTED}"   | awk '{print $1}')"
sha_regen="$(    sha256sum "${REGENERATED}" | awk '{print $1}')"

if cmp -s "${COMMITTED}" "${REGENERATED}"; then
  verdict="pass"
  diff_summary=""
  echo "==> Byte-identity: PASS"
  echo "    SHA-256(regenerated) = ${sha_regen}"
else
  verdict="fail"
  diff_summary="$(diff -u "${COMMITTED}" "${REGENERATED}" | head -200 || true)"
  echo "==> Byte-identity: FAIL — drift detected"
  echo "${diff_summary}"
fi

# Pull the headline budget numbers out of the regenerated artefact so the
# manifest is self-describing and the badge can read it directly.
mcop_avg_latency_ms="$(jq -r '.summary[] | select(.mode=="mcop-mediated") | .avgLatencyMs' "${REGENERATED}")"
mcop_avg_triad_ms="$(  jq -r '.summary[] | select(.mode=="mcop-mediated") | .avgTriadMs'   "${REGENERATED}")"
human_avg_latency_ms="$(jq -r '.summary[] | select(.mode=="human-only")   | .avgLatencyMs' "${REGENERATED}")"
pure_avg_latency_ms="$( jq -r '.summary[] | select(.mode=="pure-ai")      | .avgLatencyMs' "${REGENERATED}")"

# Compose the manifest.
jq -n \
  --arg version              "mcop-reproducible-benchmark/1.0" \
  --arg verifiedAt           "${verified_at}" \
  --arg verdict              "${verdict}" \
  --arg shaCommitted         "${sha_committed}" \
  --arg shaRegenerated       "${sha_regen}" \
  --arg mcopAvgLatencyMs     "${mcop_avg_latency_ms}" \
  --arg mcopAvgTriadMs       "${mcop_avg_triad_ms}" \
  --arg humanAvgLatencyMs    "${human_avg_latency_ms}" \
  --arg pureAvgLatencyMs     "${pure_avg_latency_ms}" \
  --arg diffSummary          "${diff_summary}" \
  '{
    version: $version,
    verifiedAt: $verifiedAt,
    verdict: $verdict,
    snapshot: {
      path: "docs/benchmarks/results.json",
      sha256_committed: $shaCommitted,
      sha256_regenerated: $shaRegenerated,
      byteIdentical: ($shaCommitted == $shaRegenerated)
    },
    headlineBudget: {
      "mcop-mediated.avgLatencyMs": ($mcopAvgLatencyMs | tonumber),
      "mcop-mediated.avgTriadMs":   ($mcopAvgTriadMs   | tonumber),
      "human-only.avgLatencyMs":    ($humanAvgLatencyMs | tonumber),
      "pure-ai.avgLatencyMs":       ($pureAvgLatencyMs | tonumber),
      claim: "Reproducible deterministic pipeline · byte-identical regression baseline"
    },
    diffSummary: $diffSummary
  }' > "${MANIFEST}"

echo "==> Manifest written: ${MANIFEST}"
cat "${MANIFEST}"

if [[ "${verdict}" != "pass" ]]; then
  exit 1
fi
