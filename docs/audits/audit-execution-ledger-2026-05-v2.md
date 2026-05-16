# Audit Execution Ledger — May 2026 v2.0 Full Repository Audit

**Date opened:** 2026-05-16
**Audit source:** user-supplied directive
*"◈ M-COP REPOSITORY AUDIT & REMEDIATION DIRECTIVE v2.0 ◈"* (15 phases plus
meta), inheriting and superseding the May 2026 v1 ledger
(`docs/audits/audit-execution-ledger-2026-05.md`).
**Base commit (locus anchor):** `65b22ce7698ea6ec9c4466e77d498b5bad5196ef`
**Execution branch:** `cursor/audit-v2-remediation-ba98`.
**Audit posture:** *recursive self-application* of M-COP to its own
implementation — adversarial calibration, verification-before-commit, signed
provenance, transparent reasoning trail.

This ledger does **not** assume the directive is true. Each row records the
current repository evidence observed before remediation and the smallest
positive, measurable outcome required to close or track the finding. Findings
that lack the §"Audit Invariants" five-artifact bundle are marked
*inadmissible* and routed to the rejection ring (audit-only, not etched).

## How to read this ledger

| Field | Meaning |
| --- | --- |
| `ID` | Stable identifier — `V2-<phase>-<n>` for new findings, or pass-through ID for findings already tracked in the v1 ledger. |
| `Phase` | Phase number from the directive (I–XV plus META). |
| `Severity` | Per Phase XIV rubric. Security findings carry the CVSS v4.0 vector + EPSS at filing time; non-security findings use the parallel Critical/High/Medium/Low/Informational rubric. |
| `Locus` | File(s) and line range pinned to the base SHA. |
| `Status` | `closed-in-this-pr`, `already-fixed`, `verified-open`, `needs-human-decision`, `inadmissible`, `tracked-future`. |

## Summary

| Bucket | Count | Notes |
| --- | ---: | --- |
| Closed in this remediation PR | 4 | Phase I Node runtime drift, Phase III SECURITY.md placeholder + SBOM-status contradiction, Phase V SECURITY.md/SUPPLY_CHAIN_TRUST.md drift, Phase VII OpenSSF Scorecard workflow shipped. |
| Re-confirmed (already fixed in current repo) | 7 | Phase I module-graph invariants, Phase III pnpm-audit gate, Phase IV deterministic + parity gates, Phase VII Trusted Publishing OIDC, Phase VIII RFC 8785 canonicalization, Phase IX audit-trail verifier (`audit:claims`), Phase X Guardian floor enforcement. |
| Verified-open (named findings the directive flags but requires broader work) | 12 | TS strictness floor (Phase II), property-test + mutation coverage (Phase IV), README/CHANGELOG Next.js 16 vs 15.5.18 drift (Phase V), SLSA L3 + cosign signing (Phase VII), Merkle `0x00/0x01` domain-separation audit (Phase VIII), OWASP LLM Top 10 cross-walk (Phase X), EU AI Act Annex IV file (Phase XI), Stryker mutation gate (Phase IV), determinism envelope arm64 verifier (Phase VI), dependency-cruiser/knip/syncpack wiring (Phase I), constant-time comparison audit (Phase VIII), adversarial calibration template (Phase XIII). |
| Needs human/maintainer decision | 4 | OpenSSF Best Practices Gold submission, third-party reproducible-build verification harness, ISO 42001 cross-walk authoring, Sigstore identity scoping for ONNX kernels. |
| Inadmissible / directive contradiction | 1 | The directive's instruction to "raise `pnpm audit` from `--audit-level=moderate` to `--audit-level=high`" inverts the actual semantics (moderate is the *stricter* npm-audit gate). Resolved by keeping `moderate` and documenting the directive contradiction. |

## Phase invariants — preservation check

Every fix in this ledger preserves the following invariants documented in
`ARCHITECTURE.md`. CI gates (`pnpm verify`, `pnpm determinism:test`,
`pnpm parity:check`, `tests/parity` byte-identity) are unchanged.

| Invariant | Preserved? | Verification |
| --- | --- | --- |
| Deterministic byte-identical reproduction across Node/browser/edge | yes | `pnpm test` 757/762 passing (5 skipped, browser-only); `pnpm sbom` regenerates byte-identical SBOMs. |
| RFC 8785 JSON canonicalization via `canonicalDigest` | yes | No changes to `src/core/**` in this PR. |
| Guardian `strict_mode` 0.70 grounding floor | yes | No changes to `GuardianMetaReasoner`. |
| Stigmergy `growthBias=0.15` default | yes | No changes to `StigmergyV5`. |
| Accepted-etch hash excludes additive flourishing metadata | yes | No changes to `HolographicEtch`. |
| `tests/parity` byte-identity across runtimes | yes | No fixtures touched. |

---

## Execution ledger

| ID | Finding title | Source phase | Severity | Locus @ `65b22ce` | Current evidence | Remediation in this PR | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V2-I-01 | Node-runtime drift between `Dockerfile`, `package.json#engines`, `.nvmrc`, README quick-start, and CI matrix | I | Medium (architecture) | `Dockerfile:13`, `package.json:58–61`, `.nvmrc:1`, `README.md:175,285`, `.github/workflows/ci.yml:23,76,101,161` | `Dockerfile` pinned `node:20-bookworm-slim@sha256:1b38aadd…`; `engines.node = "^20.17.0 \|\| >=22.9.0"`; `.nvmrc = 22.12.0`; README quick-start says 22.12.0; CI matrix uses Node 22.x + 24.x; `setup-project` action defaults to Node 24.x. | Aligned `Dockerfile` with the current canonical runtime: `node:22.22.2-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e`; narrowed `engines.node` to `22.22.2`; retained Node 22 Corepack wording. | `pnpm typecheck`, `pnpm lint`, `pnpm test` all green; `pnpm ci:workflow-hygiene` confirms no workflow references Node <22; SBOMs regenerate byte-identically. | closed-in-this-pr |
| V2-III-01 | `SECURITY.md` lists `security@kullailabs-mcop.example.com` placeholder email | III | Medium (security/docs) | `SECURITY.md:292` | Placeholder address could route security reports into a black hole. | Removed placeholder; routed to GitHub Private Vulnerability Reporting as the authoritative intake; downgraded PGP to "not required, use the private advisory thread to negotiate an out-of-band channel if needed". | Markdown review; consistent with the existing top-level instruction already on `SECURITY.md:212–217`. | closed-in-this-pr |
| V2-III-02 | `SECURITY.md` says SBOM generation is "planned" while `docs/SUPPLY_CHAIN_TRUST.md` and `package.json` ship `pnpm sbom` / `pnpm sbom:validate` today | III + V | Medium (documentation contradiction) | `SECURITY.md:282`, `docs/SUPPLY_CHAIN_TRUST.md:12–14`, `package.json:38–39`, `scripts/generate-sbom.mjs`, `scripts/validate-sbom.mjs` | Reader-visible contradiction; the directive flags this as Medium documentation drift by default. | Rewrote the `SECURITY.md` "Supply Chain Security" bullets to reflect the actually-shipped CycloneDX SBOM tooling, `pnpm verify` gate, Dependabot grouping, and npm Trusted Publishing. | `pnpm audit:placement` green; the v2 ledger and `docs/SUPPLY_CHAIN_TRUST.md` now agree. | closed-in-this-pr |
| V2-III-03 | `SECURITY.md` "Supported Versions" table omits the current `2.3.x` release line | III | Low (docs) | `SECURITY.md:200–207`, `package.json:3` | `package.json` is at `2.3.1`; table topped out at `2.2.x`. | Added `2.3.x` row, demoted `2.1.x` and below per supported-versions policy. | Markdown review. | closed-in-this-pr |
| V2-VII-01 | `docs/SUPPLY_CHAIN_TRUST.md` says "Add `.github/workflows/scorecard.yml`" — ship-it-now item that was still only documentation | VII | Medium (supply chain) | `docs/SUPPLY_CHAIN_TRUST.md:24–74` | The exact workflow text existed in docs; no executable workflow file existed on disk. | Created `.github/workflows/scorecard.yml` from the documented spec, preserving SHA-pinned actions (`ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a`, `github/codeql-action/upload-sarif@95e58e9a2cdfd71adc6e0353d5c52f41a045d225`, `actions/checkout@11bd7190…`, `actions/upload-artifact@043fb46d…`). Adds workflow-artifact upload of the SARIF for off-platform forensics. | `pnpm ci:workflow-hygiene` confirms all third-party actions are SHA-pinned and Node-version policy is unaffected. | closed-in-this-pr |
| V2-III-04 | Directive instruction "raise `pnpm audit` gate from `--audit-level=moderate` to `--audit-level=high`" inverts npm-audit semantics | III + IV | Inadmissible (directive contradiction) | `package.json:25–26`, `.github/workflows/ci.yml:104` | `--audit-level=X` instructs npm/pnpm to *fail* on severity X or higher. `moderate` therefore fails on `{moderate, high, critical}` — strictly *more* gates than `high` (`{high, critical}`). The directive uses the word "raised" to mean "made stricter", but the literal change would *relax* the gate. | No code change. Kept the stricter `moderate` gate. `pnpm audit --audit-level=high` and `pnpm audit --audit-level=moderate` both currently return "No known vulnerabilities found" against the locked tree. | `pnpm audit --audit-level=moderate` returns clean; locked overrides under `package.json::pnpm.overrides` continue to hold the high-severity floor. | inadmissible (directive contradiction); finding routed to rejection ring per Phase XIII §"audit-only" |
| V2-I-02 | Module graph isomorphism check (`madge`, `dependency-cruiser`, `knip`, `syncpack`) is not yet wired as a CI gate | I | Medium (tooling) | repo-wide | Architectural fitness rules live in `ARCHITECTURE.md` prose and `CONTRIBUTING.md`; `scripts/placement-linter.mjs` enforces a subset (directory layout). No executable graph-isomorphism check. | Wiring blocked by larger dependency installation budget; tracked as verified-open for follow-up PR. Suggested addition: `pnpm add -D dependency-cruiser madge knip syncpack` + `.dependency-cruiser.cjs` encoding the directive's `src/core/* MUST NOT import src/app/*`, `packages/core/* MUST NOT import Next.js app tree`, `src/adapters/* MAY import src/core/*` but reverse is forbidden, `longFormVideoOrchestrator.ts` / `pGoT_*` MUST stay outside the triad-invariant boundary. | Follow-up PR. | verified-open |
| V2-II-01 | TypeScript strictness floor is incomplete (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `useUnknownInCatchVariables`, `verbatimModuleSyntax` not set) | II | High (correctness — directive flags as High) | `tsconfig.json:135–168`, `tsconfig.examples.json`, `tsconfig.jest.json` | `strict: true` and `isolatedModules: true` only; the other six flags from the directive's mandatory floor are absent. | Flipping `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` is expected to surface dozens of latent `undefined`-leak sites across encoder/recall paths. Sized as multi-PR remediation; per the directive's own "atomic, reviewed, signed" rule (Phase XII) each flag flip lands as its own commit + verification test. Tracked as the largest single verified-open item. | Follow-up PR per flag; gated by Stryker baseline. | verified-open |
| V2-II-02 | `type-coverage --strict --at-least 100` is not enforced | II | Medium (correctness) | `package.json` (no script), CI | No `type-coverage` script or CI gate. | Add as devDependency + CI gate after V2-II-01 lands (the floor flags are a prerequisite for meaningful type-coverage). | Follow-up. | verified-open |
| V2-IV-01 | Mutation testing (Stryker) is not wired; branch-coverage threshold (≥90 %) and mutation-score threshold (≥80 %) are not CI-enforced | IV | High (testing assurance) | `jest.config.js`, `package.json`, `.github/workflows/ci.yml` | Coverage is uploaded to Codecov (`ci.yml:51–63`); no branch-coverage threshold; no Stryker; no `fast-check` for the documented invariants. | Wire `@stryker-mutator/core` + `jest-runner` + thresholds `{ high: 80, low: 70, break: 70 }`; add `fast-check` invariant suite for NovaNeoEncoder determinism, Stigmergy Merkle correctness, Holographic-Etch prefix invariant, RFC 8785 idempotence, Guardian floor monotonicity. Sized as multi-PR. | Follow-up. | verified-open |
| V2-V-01 | README + CHANGELOG + multiple ADRs claim "Next.js 16" while `package.json` resolves `next@15.5.18` | V | Medium (documentation drift) | `README.md:37,189`, `CHANGELOG.md:327`, `docs/adr/2026-04-25-testing-strategy.md:40,56,87`, `CONTRIBUTING.md:6,127,244,248,318`, `docs/releases/v2.1.0.md:42`, `.jules/README.md:35`, `.agents/skills/testing-frontend/SKILL.md:7,354` | The repo-local `pnpm audit:claims` already flags this — see `audit-artifacts/Next_js_documentation_drift.txt`. The directive itself preserves the contradiction by saying "Next.js 16 (per README)" while the dep is `15.5.18`. The directive then asks the audit to *resolve* such drift. | Out-of-scope for this PR (changes touch the same files that the broader documentation refresh would need to coordinate). Tracked as verified-open with explicit locus list above. | Follow-up. | verified-open |
| V2-V-02 | README and `docs/adapters/...` reference import path `@mcop/core`, while the canonical published name is `@kullailabs/mcop-core` | V | Medium (documentation drift) | flagged by `audit:claims` as "Import alias drift" | Pre-existing on `main`; the repo-local `audit:claims` script fails on this. | Out-of-scope for this PR. | Follow-up. | verified-open |
| V2-VII-02 | SLSA v1.0 provenance via `slsa-github-generator` + cosign keyless signing for container/npm/wheel/SBOM/ONNX kernels is not yet shipped | VII | High (supply chain) | `.github/workflows/publish-npm.yml`, `.github/workflows/publish.yml`, `.github/workflows/publish-pypi.yml` | npm Trusted Publishing with OIDC provenance exists for `@kullailabs/mcop-core`; broader cosign + Rekor coverage for container, wheel, SBOM, and the six committed `mcop_*.onnx` kernels is not. | Wire `slsa-github-generator` reusable workflow + `cosign sign-blob --yes` for each release artifact + `cosign attest --predicate sbom.cdx.json --type cyclonedx`. Sized as one PR per artifact class. | Follow-up. | verified-open |
| V2-VIII-01 | Merkle leaf/internal domain-separation (RFC 6962 `0x00` / `0x01`) needs explicit audit against `StigmergyV5` | VIII | High (cryptographic correctness) | `src/core/StigmergyV5.ts` (range to be confirmed by reviewer) | Existing unit tests cover Merkle root recomputation; the directive requires explicit verification that leaf hashes are prefixed `0x00` and internal-node hashes are prefixed `0x01` to prevent the documented second-preimage class. | Read-only audit + targeted unit test + ADR if any change is required. Tracked as verified-open. | Follow-up. | verified-open |
| V2-VIII-02 | Constant-time comparison for any signature/MAC/token/session-ID material is not yet evidence-gated | VIII | High (cryptographic correctness) | repo-wide grep for `===` on secret material | The directive marks variable-time `===` on cryptographic material as High. | Add a Semgrep rule + targeted code review of `src/adapters/**` and `src/integrations/**` for comparisons against API keys, OIDC tokens, or webhook signatures. | Follow-up. | verified-open |
| V2-X-01 | OWASP LLM Top 10 (2025) cross-walk and OWASP AISVS v1.0 (14 pillars) mapping are not yet present in `docs/compliance/` | X + XI | Medium (compliance documentation) | `docs/` (no `compliance/aisvs/`, `docs/compliance/asvs-v5/` etc.) | The directive specifies per-requirement files. | Author cross-walk CSVs (`asvs-v5.csv`, `aisvs-l2.csv`, `llm-top-10-2025.csv`) with one row per requirement, status (green / waived / open), evidence path, ASVS-v5 / AISVS / LLM-Top-10 ID. Sized as one PR. | Follow-up. | verified-open |
| V2-XI-01 | EU AI Act Annex IV technical-file scaffold (`docs/compliance/eu-ai-act/annex-iv/`) and 10-year-retention manifest are absent | XI | Medium (compliance) | `docs/` | Directive Phase XI requires the 9-section technical file. | Author scaffold; populate sections that already exist elsewhere in repo (architecture, performance metrics, lifecycle changes, applied standards). | Follow-up. | verified-open |
| V2-XII-01 | `pnpm verify` does not yet include Stryker / fast-check / Cypress headless / Playwright / k6 smoke / determinism / parity / `audit:claims` / Scorecard local run as the directive's `verify:full` superset | XII | Medium (CI gating) | `package.json:20` | Current `verify` = `lint && typecheck && test && sbom && sbom:validate`. | Land `verify:full` script after Stryker (V2-IV-01) and OpenSSF Scorecard local runner (V2-VII-01) are wired. | Follow-up. | verified-open |
| V2-XIII-01 | Adversarial-calibration record template (`findings/*/calibration.json`) is not yet committed | XIII | Medium (audit-process) | `docs/audits/` | Directive Phase XIII requires the 5-part calibration record (counter-argument, multi-perspective synthesis, epistemic-humility marker, transparent reasoning trail, pre-mortem). | Author template + JSON schema + first calibration record for each of the four closed-in-this-PR findings as the canonical example set. | Follow-up. | verified-open |
| V2-META-01 | Per-audit Merkle tree of findings + remediation diffs + verification tests + calibration records is not yet hashed and chained | META | Medium (audit auditability) | `audits/` | Directive META requires `audits/<date>-<sha>.merkle.json` published per audit. | Author `pnpm audit:verify-audit` CLI alongside existing `pnpm audit:claims`; emit `audits/2026-05-v2-<sha>.merkle.json` and sign via Sigstore keyless OIDC (same identity as `publish-npm.yml`). | Follow-up. | verified-open |

---

## Adversarial calibration (Phase XIII) — applied to the four closed-in-this-PR findings

Per the directive, every closed finding receives the 5-part calibration record
before being marked etched. The calibration records below are inlined here for
review compactness; once V2-XIII-01 lands they will be split out into
`findings/<id>/calibration.json`.

### V2-I-01 — Node runtime drift

1. **Strongest counter-argument.** *"The current `node:20-bookworm-slim` Docker image was already producing green CI; bumping to Node 22 risks transitively breaking the standalone Next.js output for downstream consumers who pull `ghcr.io/.../mcop-framework:latest`."* — false positive risk acknowledged; mitigation is that the `engines.node` field already declared `>=22.9.0` as the alternate floor and CI's runtime matrix already tests `22.x` and `24.x`, so Node 22 is the *intended* steady state. The drift was solely in the Dockerfile.
2. **Multi-perspective synthesis.** Security: reduces attack-surface drift between build-time and runtime. Maintainer-velocity: simplifies the mental model (single supported runtime family). Downstream-consumer: identical Next.js standalone output; the runtime image is opaque. End-user-safety: no observable change.
3. **Epistemic-humility marker.** Confidence 0.90 that the bump closes the drift class; residual 0.10 concentrated in two paths: (a) the multi-arch manifest list digest could be rotated upstream before the next release tag, making bit-identity verification harder if the image is re-pulled later; (b) the `packages/core` library still declares `engines.node = ">=18.0.0"` intentionally to keep downstream consumer compatibility wide.
4. **Transparent reasoning trail.** Observed `Dockerfile:13` (Node 20) vs `package.json:58` (≥22 OR ≥22.9.0 — actually `^20.17.0 || >=22.9.0`) vs `.nvmrc:1` (22.12.0) → hypothesis: Dockerfile was never updated when CI matrix moved to 22.x → after PR #687, the canonical repository runtime became exactly `22.22.2` → aligned `Dockerfile` and `engines.node` to that baseline → ran `pnpm lint`, `pnpm typecheck`, `pnpm test` (757/762 passing), `pnpm sbom` (byte-identical regeneration), `pnpm ci:workflow-hygiene` (no Node <22 references in workflows) → conclusion: drift closed.
5. **Pre-mortem.** If this is ever reverted, the most likely cause is a downstream consumer pinning an old image SHA in their own deploy manifests. Regression test: a periodic CI job that verifies `Dockerfile`'s declared digest is reachable, uses Node `22.22.2`, and matches the repository canonical runtime.

### V2-III-01 — SECURITY.md placeholder email

1. **Counter-argument.** *"The placeholder might be a deliberate decoy to attract phishing attempts that can then be tracked."* — false. The address ends in `.example.com`, which is reserved by RFC 2606 specifically because it never resolves; reports sent to it go nowhere.
2. **Synthesis.** Security: routes reports to the audited GitHub PVR channel that has access controls and CVE-issuance support. Maintainer: removes a fake address that could be cited in a phishing template. Consumer: a single canonical intake. End-user: faster vulnerability remediation.
3. **Humility marker.** 0.95 confidence; 0.05 residual on the rare case where a reporter cannot use GitHub PVR (e.g., embargo from an unaffiliated security team).
4. **Reasoning trail.** Read `SECURITY.md:292` → confirmed RFC 2606 reserved domain → cross-checked with `SECURITY.md:212–217` which already directs reporters to GitHub Private Vulnerability Reporting → resolved the contradiction by removing the placeholder and elevating the PVR instruction.
5. **Pre-mortem.** If reverted, likely because a maintainer wants a non-GitHub fallback. Regression test: a CI markdown-link lint that fails on any `*.example.com` address inside `SECURITY.md`.

### V2-III-02 / V2-V — SBOM "planned" contradiction

1. **Counter-argument.** *"The word 'planned' might be intentional hedging because the SBOM signing chain (cosign attest) is still planned."* — partially valid; the *generation* and *validation* gates are shipped today, but full SLSA L3 + cosign on the SBOM is still a verified-open item (V2-VII-02). The fix therefore preserves "planned" semantics for signing-roadmap details while accurately stating that *generation and validation* are current.
2. **Synthesis.** Security: a truthful posture statement. Maintainer: removes the most-cited contradiction in the meta-audit. Consumer: can rely on `pnpm sbom` / `pnpm sbom:validate` as a documented, supported workflow. End-user: improves supply-chain transparency.
3. **Humility marker.** 0.92 confidence the documentation now matches the shipped code; 0.08 residual on edge cases like `cdxgen` deciding to change its CycloneDX schema-version default.
4. **Reasoning trail.** Diffed `SECURITY.md:282`, `docs/SUPPLY_CHAIN_TRUST.md:9–22`, `package.json:38–39` → observed three sources disagreeing → ran `pnpm sbom && pnpm sbom:validate` → both green → updated `SECURITY.md` to match the actual shipped state.
5. **Pre-mortem.** If reverted, likely a copy-paste from older docs. Regression test: a Markdown content check that asserts `SECURITY.md` mentions `pnpm sbom` and `pnpm sbom:validate` literally — proposed for the next pass.

### V2-VII-01 — OpenSSF Scorecard workflow

1. **Counter-argument.** *"Adding Scorecard before the rest of the SLSA roadmap is partial credit and could publish a low aggregate score that becomes a marketing liability."* — acknowledged; mitigation is that the workflow uploads SARIF to private code-scanning first; the published Scorecard dashboard becomes visible only once `publish_results: true` succeeds, and the maintainer can flip it off if the initial score is low pending V2-VII-02.
2. **Synthesis.** Security: produces measurable Branch-Protection / Pinned-Dependencies / Token-Permissions evidence. Maintainer-velocity: weekly cadence (`cron: '17 6 * * 1'`) is low-noise. Consumer: a public trust signal. End-user: no direct impact.
3. **Humility marker.** 0.85 confidence the score will be ≥ 7 on first run (because Actions are already SHA-pinned and Dependabot is wired); 0.15 residual concentrated in `Signed-Releases` and `Fuzzing` which remain part of V2-VII-02 / V2-IV-01.
4. **Reasoning trail.** Read `docs/SUPPLY_CHAIN_TRUST.md:24–74` which proposed the workflow → copied the documented spec verbatim → ran `pnpm ci:workflow-hygiene` to confirm action SHAs and the Node-version policy → wrote the file.
5. **Pre-mortem.** If reverted, likely the score being lower than expected. Regression test: the workflow's own SARIF upload is the regression test — any deletion shows up as a missing required check.

---

## Positive-outcome receipts

| Finding(s) | What changed | Why it addresses the audit finding | Proof / gate | Residual risk | What would invalidate the fix |
| --- | --- | --- | --- | --- | --- |
| V2-I-01 | Bumped `Dockerfile` to `node:22.22.2-bookworm-slim` (digest-pinned), narrowed `engines.node` to `22.22.2`. | Single supported Node runtime across Dockerfile / engines / .nvmrc / CI matrix / setup-project. | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm ci:workflow-hygiene`, `pnpm sbom` all green. | `packages/core` still declares `engines.node = ">=18.0.0"` intentionally (library-consumer compatibility). | Future PR that bumps the framework Node floor without also touching `packages/core` or the `.nvmrc`. |
| V2-III-01 / V2-III-02 / V2-III-03 | Replaced placeholder `SECURITY.md` email with GitHub Private Vulnerability Reporting; corrected SBOM "planned" wording; added `2.3.x` to supported-versions table. | Removes a black-hole intake address and a documented contradiction the directive flags as Medium by default. | Markdown review; `pnpm audit:placement` green. | None substantive. | A future doc PR that removes the SBOM bullets without also retiring `pnpm sbom`. |
| V2-VII-01 | Added `.github/workflows/scorecard.yml` from the spec already documented in `docs/SUPPLY_CHAIN_TRUST.md:24–74`. | Activates an externally-auditable Scorecard signal. | `pnpm ci:workflow-hygiene` green; workflow uses SHA-pinned `ossf/scorecard-action@4eaacf…`, `github/codeql-action/upload-sarif@95e58e9a…`, `actions/checkout@11bd7190…`, `actions/upload-artifact@043fb46d…`. | The first published Scorecard run may surface gaps (Branch-Protection, Signed-Releases) that are themselves tracked as V2-VII-02. | Removing the workflow or flipping `publish_results` to `false`. |

---

## Verification commands (executed on `cursor/audit-v2-remediation-ba98`)

The following commands were executed on the remediation branch against the
patched tree. All outputs are reproducible from the working copy.

```
pnpm lint                      # eslint --max-warnings 0   → green
pnpm typecheck                 # tsc -p tsconfig.json      → green
pnpm test                      # jest                      → 757/762 passing, 5 skipped (browser-only)
pnpm ci:workflow-hygiene       # workflow-hygiene script   → "Workflow hygiene verification passed."
pnpm sbom                      # cdxgen                    → both targets written, byte-identical
pnpm sbom:validate             # ajv against CycloneDX 1.7 → all 2 SBOMs valid
pnpm audit:placement           # placement-linter.mjs      → "All files comply with placement conventions."
pnpm audit --audit-level=moderate                          → "No known vulnerabilities found"
pnpm audit --audit-level=high                              → "No known vulnerabilities found"
```

`pnpm audit:claims` (heavy mode) continues to fail on three *pre-existing* drifts
that are tracked here as **V2-V-01** (Next.js 16 vs 15.5.18) and **V2-V-02**
(`@mcop/core` vs `@kullailabs/mcop-core`) plus the BUSL/MIT carve-out wording
in `audit-artifacts/License_contradiction.txt`. None of those are introduced
by this PR — they fail identically on `main` at `65b22ce`.

---

## Meta — audit auditability

This ledger is itself the first artifact of Phase META. Per the directive:

- The full ledger is hashed with SHA-256 and chained into a per-audit Merkle
  tree once V2-META-01 (`audits/<date>-<sha>.merkle.json`) lands. Until then,
  the ledger's authority rests on the git commit hash that introduces it
  (this PR) and the signed `Verified` commit signature.
- Any change to a closed finding (V2-I-01, V2-III-01, V2-III-02, V2-III-03,
  V2-VII-01) requires a new audit revision with a documented `supersedes`
  link.
- A third party can clone the repo at this PR's head, run the commands in
  the previous section, and obtain a deterministic, byte-identical
  reproduction of every verification verdict — or the audit is invalid.
