# Claim Audit Harness

> "Claims now have to survive an executable audit, not just a search pass."

The MCOP repository ships a CI-enforced **claim audit** that goes well
beyond `git grep`. It captures evidence, fails on real drift, records
logs, checks package/version/license consistency, runs local proof
commands, and emits an audit report.

## What it actually does

`scripts/audit-repo-claims.sh` runs six gates in sequence:

| Gate | Purpose | Default severity |
|---|---|---|
| `capture_environment` | Records git SHA, branch, Node/pnpm versions, and OS into `audit-artifacts/environment.txt` so every run is reproducible. | Informational |
| `audit_claim_drift` | Pattern-based scan for documentation drift: overclaiming production readiness, Next.js version contradictions, license contradictions (e.g. whole-project MIT claims against the current Apache-2.0 grant), unproven benchmark headlines, stale version strings, and import-alias drift. | Mixed (FAIL on Next.js/import drift, WARN otherwise) |
| `audit_package_metadata` | Cross-validates root `package.json` and every workspace `package.json` against `EXPECTED_VERSION`, `CORE_PACKAGE`, `CANONICAL_IMPORT`, and the README. Catches cases where the README announces a Next.js or license posture the manifest does not back up. | FAIL on hard contradictions, WARN otherwise |
| `setup_pnpm` | Activates the pinned `packageManager` via Corepack so the harness runs against the same pnpm CI uses. | FAIL if pnpm is not resolvable |
| `install_dependencies` | `pnpm install --frozen-lockfile` against the committed `pnpm-lock.yaml`. | FAIL on lockfile drift |
| `run_proof_gates` | Executes the actual proofs the README's claims rely on: `lint`, `typecheck`, `test:coverage`, `build`, `pnpm audit`, `sbom`, `sbom:validate`, `cypress:run`, `bench:smoke`, `determinism:test`, `docs:check`, and a workspace-filtered `@kullailabs/mcop-core` build. | FAIL on first non-zero exit |

All output (per-gate logs, drift snippets, package-metadata report,
machine-readable bench summary, and a final `summary.md`) lands in
`audit-artifacts/` and is uploaded by CI as a GitHub Actions artifact.

## Running it locally

```bash
# Full audit (the same thing CI runs).
STRICT=1 pnpm audit:claims

# Fast mode — skip dependency install and heavy proof gates; useful while
# editing README/CHANGELOG and you only want to validate drift detection.
STRICT=1 SKIP_INSTALL=1 SKIP_HEAVY=1 pnpm audit:claims

# Override the version and core package the harness asserts on.
EXPECTED_VERSION=2.4.0 \
CORE_PACKAGE=@kullailabs/mcop-core \
CANONICAL_IMPORT=@kullailabs/mcop-core \
STRICT=1 pnpm audit:claims
```

A non-zero exit code means the repository's claims have drifted from its
artifacts. The fix is *always* to either correct the claim or to update
the artifact — never to weaken the gate.

## CI wiring

CI callers should pin `STRICT=1`, `EXPECTED_VERSION=2.4.0`, and the
canonical import alias, then upload `audit-artifacts/` regardless of pass/fail
so reviewers can inspect drift evidence directly from a failed run. When
`EXPECTED_VERSION` is omitted, the harness derives it from the root manifest.

## Strict-mode gates added in this PR

The harness's strict mode requires four scripts that did not previously
exist as standalone gates. They are intentionally minimal but real:

- **`docs:check`** — `scripts/check-readme-code-blocks.mjs` parses every
  fenced ```json``` / ```bash``` block in `README.md`, `ARCHITECTURE.md`,
  `CONTRIBUTING.md`, and `docs/**/*.md`. JSON blocks must parse, shell
  blocks must not contain `TODO`/`FIXME`/`XXX`, and any `pnpm <name>`
  reference that is neither a built-in pnpm verb nor a real script
  triggers a warning.
- **`determinism:test`** — `scripts/test-determinism.mjs` exercises the
  RFC 8785 / SHA-256 fingerprinting primitives the framework's
  provenance and Merkle claims rest on, in-process and in a cold
  sub-process. Drift in either dimension fails the gate.
- **`bench:smoke`** — `scripts/bench-smoke.mjs` runs a fixed-iteration
  smoke benchmark of canonicalize+SHA-256 within a hard time budget,
  writes machine-readable results to
  `audit-artifacts/bench-smoke.json`, and deliberately avoids printing
  marketing-style headline numbers that the drift scanner would treat as
  unproven claims.
- **`audit:claims`** — convenience alias for the harness itself.

These are not a substitute for the framework's full benchmark and
determinism suites; they are the cheap, always-on proofs CI demands of
every commit.
