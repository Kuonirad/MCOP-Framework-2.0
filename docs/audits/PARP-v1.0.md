# Phoenix Audit & Remediation Protocol (PARP) v1.0

**Scope:** Kuonirad/MCOP-Framework-2.0
**Aligned to:** MCOP Framework 2.x — NOVA-NEO Encoder, Stigmergy v5, Holographic Etch, Positive-Resonance Scoring, Proteome Substrate, Drift Sentinel.
**License:** This protocol document is published under the same terms as the surrounding `docs/` content. It is purely procedural. As of the 2026-05-26 relicense the entire repository — core runtime (`src/ledger/`, `src/orchestrator/`, `src/core/`, adapters, Drift Sentinel, Proteome) included — is licensed **Apache-2.0**, with the framework-agnostic integration shims in `src/integrations/` and `mcop_package/mcop/integrations/` carved out under MIT (see `NOTICE.md`). PARP integration does **not** modify the licensing of any source file.
**Authoring invocation (for AI executors):**
> *"Execute PARP v1.0 on MCOP-Framework-2.0. Begin at L0. Maintain full provenance trail. Prioritize verifiability and eudaimonic outcomes."*

---

## 0. Protocol Philosophy & Invariants

PARP exists to **increase negentropy** in the repository: reduce technical debt, eliminate bugs, close gaps, synchronize artifacts, and amplify the framework's core value — verifiable, reproducible, positive-impact reasoning.

### Non-Negotiable Invariants

Every fix MUST preserve or strengthen all of:

1. **Byte-identical reproducibility** of core pipelines (NOVA-NEO encoder, Stigmergy v5 traces, Holographic Etch ledger, SBOMs).
2. **Merkle-chained provenance** for all reasoning and audit steps (Stigmergy logs, `audit/ledger.jsonl`, `audit/positive-resonance-ledger.md`, or equivalent).
3. **Self-auditing positive-resonance / eudaimonic scoring** capability (`pnpm positive:audit` continues to score ≥ baseline).
4. **Cryptographic lineage and SBOM integrity** (`pnpm sbom` + `pnpm sbom:validate` remain green; SBOMs continue to validate against their declared CycloneDX schema).
5. **Human-primacy.** Improvements must ultimately serve verifiable human–AI flourishing, not merely internal metrics.
6. **No regression in test coverage or CI gate strength** (`pnpm verify` and `pnpm positive:audit` must remain green; coverage delta ≥ 0 on core paths).

### AI Executor Rules

- Every action MUST be logged with timestamp, rationale, before/after evidence, and verification result.
- Never commit a fix without running the relevant verification harness.
- If a fix risks an invariant, **escalate** — file a detailed GitHub issue and pause.
- Use existing repo scripts wherever possible (`pnpm verify`, `pnpm positive:audit`, `pnpm self:audit`, `pnpm deps:audit`, `pnpm audit:claims`, `pnpm audit:placement`).
- Treat the audit itself as an MCOP process: NOVA-NEO encode findings → Stigmergy log → Holographic Etch confidence → Positive-Resonance score the trajectory.
- **Scope rule:** baseline / integration PRs do **not** remediate. Each discovered issue gets its own focused `fix/parp-<id>-*` branch and PR per §L5.

---

## 1. Execution Phases (Layered / Fractal Flow)

### L0 — Bootstrap, Snapshot & Baseline *(Mandatory — Do Not Skip)*

**Goal.** Establish a reproducible starting state and capture current health metrics.

1. **Verify environment.** Node `22.22.3` per `.nvmrc` / `engines`, pnpm `9.15.0` per `packageManager`, Python 3.x available for `self:audit` and CUDA scripts.
   *If only Node 22.12.x is available (snapshot delta), pnpm emits an `Unsupported engine` WARN but continues. Record the exact `node --version` / `pnpm --version` used in `artefacts/baseline-meta.txt`.*
2. **Pin the locus.** `git rev-parse HEAD` → record in `artefacts/baseline-meta.txt`.
3. **Install.** `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile` (or plain `pnpm install` per `AGENTS.md` when adding deps).
4. **Baseline snapshot** — run each and tee to `artefacts/L0-NN-<name>.log`:
   - `git status --porcelain` → `artefacts/L0-02-git-status.log`
   - `pnpm verify` (lint + typecheck + jest + sbom + sbom:validate)
   - `pnpm positive:audit`
   - `pnpm self:audit`
   - `pnpm deps:audit`
   - `pnpm audit:claims`
5. **Snapshot the GitHub Code Scanning queue.** Fetch all open alerts and persist them so the L1 remediation track is reproducible from a fixed locus, not from a live API result that drifts:

   ```
   gh api -X GET /repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts \
     -F state=open -F per_page=100 --paginate \
     > artefacts/L1-code-scanning-alerts-open.json
   gh api -X GET /repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts \
     -F state=dismissed -F per_page=100 --paginate \
     > artefacts/L1-code-scanning-alerts-dismissed.json
   ```

   Also produce a human-readable summary at `artefacts/L1-code-scanning-alerts.md` categorized by `tool.name` × `rule.security_severity_level`.

6. **Debt-marker grep sweep** (run and triage every hit). See `scripts/parp-baseline.mjs` for the canonical, copy-pastable sweep command — the case-insensitive pattern is `(TODO|FIXME|BUG|HACK|XXX|OPTIMIZE|DEPRECATED|WORKAROUND)` over `*.ts,*.tsx,*.py,*.js,*.mjs,*.cjs` under `src/`, `tests/`, `scripts/`, `mcop_cuda_server/`, `mcop_package/`, `packages/`, with `dist/` and `node_modules` excluded. Capture the full sweep to `artefacts/L1-debt-markers.txt` and a high-signal word-boundary subset to `artefacts/L1-debt-markers-high-signal.txt` — these are the items that demand immediate triage; the broader case-insensitive sweep includes substring matches inside identifiers (e.g. `debugHook`, `Optimize`) and is expected to be dominated by false positives.

7. **Open the tracking issue** titled `PARP v1.0 Execution Tracking — Baseline & Initial Sweep`, containing categorized L0 results, debt-marker counts, the code-scanning alert checklist, and a link to this document.

8. **Optional but recommended — reproducibility cross-check.** Run the entire L0 audit suite **twice** and diff the outputs. SBOMs and `audit:claims` proof-gate results MUST be byte-identical (timestamped ledger appends and `Timestamp:` headers are expected exceptions and may be normalized before diff).

**Exit gate (L0).** All baseline commands either succeed or are explicitly documented as pre-existing baseline failures (e.g. `cypress:run` fails when port 3000 has no server — this is an infrastructure precondition, not a code regression). Snapshot artifacts are committed under `artefacts/` (no secrets, no environment-specific data). Tracking issue is open.

---

### L1 — Static Analysis, Structural Hygiene & Debt Discovery

**Goal.** Surface every obvious and latent issue via automated and manual static review.

**Automated:**
- `pnpm lint`, `pnpm typecheck`
- `pnpm deps:check` (`pnpm outdated && pnpm audit --audit-level=high`)
- CodeQL — verify scheduled scans are current and triage all open alerts in `artefacts/L1-code-scanning-alerts-open.json`.

**Manual structural checks:**
- Lockfile hygiene — only `pnpm-lock.yaml` should exist; any stray `package-lock.json` / `yarn.lock` must be removed.
- `.github/workflows/` — caching, secret handling, GPU-job scaffolding, **explicit minimum `permissions:` blocks at job or workflow level** (Scorecard `TokenPermissionsID`).
- Dockerfiles, docker-compose, `.nvmrc`, `engines` alignment.
- License headers and `NOTICE.md` consistency across all source files.

**Priority file-review order** (deep manual + AI code review):

1. `src/ledger/` — reconciliation, async forwarders, DLQ, Redis paths. **Highest provenance risk.**
2. `src/orchestrator/MCOPOrchestrator.ts`
3. `src/core/` — NOVA-NEO, Stigmergy v5, Holographic Etch.
4. `src/adapters/` — especially `grokAdapter.ts` and the Universal Adapter Protocol.
5. `src/drift_sentinel/` or equivalent Drift Sentinel Kernel.
6. `src/proteome/`
7. `src/hardware/` and `mcop_cuda_server/`
8. `src/integrations/` — LangChain / LlamaIndex / Haystack shims (known coverage-gap risk).
9. `tests/` and `scripts/`
10. `docs/` cross-reference sync.

**Output.** A prioritized debt/issue list with **Severity** (Critical / High / Medium / Low) and **MCOP Impact score** (1–10 on verifiability / reproducibility / positive-resonance).

**L1 exit gate.** Every open GitHub Code Scanning alert is either (a) tracked with an explicit PARP ID and target branch, or (b) marked `inadmissible` with documented rationale. Zero CodeQL `critical`/`high` findings remain unowned.

---

### L2 — Functional, Integration & Bug Remediation

**Goal.** Achieve functional correctness and close execution gaps.

- Execute the full test matrix: `pnpm test:ci` / `pnpm test:hybrid`. ~757 jest tests + ~246 pytest tests baseline.
- Close coverage gaps, especially `src/integrations/`.
- Reproduce key benchmarks (`pnpm benchmark:refresh`) and validate against committed `docs/benchmarks/results.json`.

**Known-gap playbooks:**
- **CUDA productionization (v2.3 gaps).** Audit `mcop_cuda_server/`, `scripts/cuda*`, `src/hardware/CUDAHardwareLayer.ts`. If kernels are missing, either implement the minimal export pipeline or create `CUDA_PRODUCTION_STATUS.md` listing exact missing artifacts + owner. Add GPU-CI job scaffolding (skippable in absence of hardware).
- **Proteome / LS20 ARC (R6/R7).** Review current status; advance or explicitly document blockers.
- **Drift Sentinel.** Verify scope limitations are clearly documented; no over-claims.

**Per-bug workflow:**

1. Reproduce minimally.
2. Write or extend a test that fails.
3. Implement the minimal fix.
4. Verify: targeted test passes **and** full relevant suite is green.
5. Update `CHANGELOG.md`.
6. Etch the improvement (append to `audit/ledger.jsonl` / `audit/positive-resonance-ledger.md` via the existing self-audit hooks).

> **Rule.** No fix without a regression test, **or** a written justification of why one is impossible (recorded in the fix's PR description).

---

### L3 — Documentation, Claims & Narrative Synchronization

**Goal.** Eliminate drift between claims, code, tests, and docs.

- Systematic claim audit: every performance number, architectural claim, or "ships with" statement in `README.md`, `ARCHITECTURE.md`, `ROADMAP_TO_100.md` must verify against code/tests.
- Run `pnpm audit:claims` and address every WARN. Original L0 baseline WARN set (all now closed in L3 follow-ups — `pnpm audit:claims` reports zero claim-drift WARNs and zero package-metadata errors at the latest version-history locus below):
  - ~~Overclaiming production readiness~~ — resolved (#753, #754: hedged overclaim language + tightened pattern exclusions).
  - ~~License contradiction~~ — resolved: the Apache-2.0 relicense (#759) is now reflected end-to-end (audit tooling expects Apache-2.0; integration-shim headers and the README/NOTICE licensing footers are recognized as legitimate MIT carve-outs, not contradictions).
  - ~~Unproven benchmark claim~~ — resolved: `ROADMAP.md` coverage figure is allow-listed against its committed evidence (`docs/badges/coverage.svg`), consistent with the existing evidence-backed exclusion design.
  - ~~Version drift suspects~~ — resolved (no current-version claims drift; historical references are allow-listed).
- Ensure every public API surface has corresponding docs.
- Update `CHANGELOG.md` with all fixes (Conventional Commits or MCOP-structured entries).
- Sync `ROADMAP_TO_100.md` with actual post-remediation status.
- Review `PLAIN_ENGLISH_GLOSSARY.md`, `POSITIVE_EVOLUTION.md` for accuracy.
- Treat **this** PARP document as a living artifact in `docs/audits/`; bump the version in §6 on every meaningful revision.

---

### L4 — Security, Supply-Chain, License & Governance

**Goal.** Maintain or improve the existing strong security posture.

- `pnpm sbom && pnpm sbom:validate` — must remain green; SBOMs MUST validate against their declared CycloneDX schema.
- Review every `overrides` block in `package.json` — must remain necessary and minimal.
- Dependabot / manual outdated check — open PRs for high-severity updates.
- **License compliance sweep.** Apache-2.0 (repo-wide) vs MIT (integration shims + preserved legacy grant). No accidental mixing in new files; SPDX headers must match `NOTICE.md`.
- `.github/` security workflows, CodeQL config, Trojan-Source guards remain enabled.
- Review `SECURITY.md`, `TRUSTED_PUBLISHING_SETUP.md`, `GOVERNANCE.md`.
- No hardcoded secrets, weak randomness, or provenance-bypass paths.
- Python side (`mcop_cuda_server`, `mcop_package`): basic bandit / pip-audit equivalent if tools are available.
- **Close out the Code Scanning queue.** Every alert in `artefacts/L1-code-scanning-alerts-open.json` is fixed (preferred), dismissed with full justification, or has an issue/PR landing the fix.

---

### L5 — Prioritization, Remediation Tracking & Execution Loop

Use this matrix for every discovered item:

| ID | Description | Severity | MCOP Impact (Verif / Reprod / Pos-Res) | Effort | Status | Owner | Verification Command |
|----|-------------|----------|----------------------------------------|--------|--------|-------|----------------------|
| … | … | Critical / High / Medium / Low | 1–10 | Low / Med / High | Open / In Progress / Fixed / Deferred | AI / Human | `pnpm test:…` + manual |

**Remediation workflow per item:**

1. Create or update a GitHub issue with full evidence + PARP ID.
2. Branch: `fix/parp-<id>-short-desc`.
3. Implement a minimal, focused change.
4. Run targeted **and** full verification.
5. Update relevant docs / tests.
6. Commit message must contain:
   `PARP v1.0 | Impact: X | Verified: [commands] | Resonance delta: +Y`
7. Re-run `pnpm positive:audit` after a batch of fixes.
8. Merge only after CI is green **and** the positive-audit score is stable or improved.

**Priority order:**
Critical provenance / ledger bugs → security vulns → reproducibility breaks → documentation drift → coverage gaps → nice-to-have polish.

---

### L6 — Recursive Meta-Audit & Self-Improvement (Phoenix-DNA)

**Goal.** Apply MCOP primitives to the audit process itself, continuously.

- Encode key findings / decisions in NOVA-NEO style (even if simulated).
- Maintain the stigmergic log via `audit/ledger.jsonl` and `audit/positive-resonance-ledger.md` (already appended by `pnpm self:audit` and `pnpm positive:audit`).
- After a significant remediation phase, re-run `pnpm positive:audit` and compare scores against the baseline snapshot.
- Ask: *Did this batch of fixes increase overall repository negentropy and positive-resonance trajectory?* If not, investigate.
- If recurring patterns emerge (e.g. ledger reconciliation fragility), propose an architectural improvement or new kernel.
- Update this PARP protocol when audit-process gaps are discovered (version bump + changelog entry).

---

### L7 — Final Gate & Release Preparation

**Exit criteria — ALL must pass:**

- [ ] Zero open Critical / High severity issues.
- [ ] Test coverage ≥ baseline (ideally 100% on core paths; document justified exceptions).
- [ ] All known CUDA / Proteome gaps either addressed or explicitly roadmap'd with owner + timeline.
- [ ] `pnpm verify` and `pnpm positive:audit` pass cleanly.
- [ ] SBOM valid; no high-severity audit findings; `pnpm deps:audit` clean.
- [ ] Documentation fully synchronized; `pnpm audit:claims` WARN count ≤ baseline.
- [ ] `CHANGELOG.md` updated.
- [ ] Positive-resonance / eudaimonic metrics stable or improved.
- [ ] All open GitHub Code Scanning alerts closed or explicitly justified.
- [ ] CI workflows green (full matrix).
- [ ] This PARP execution is published as an issue or `docs/audits/PARP-execution-YYYYMMDD.md`.

**Post-exit:**
- Tag release if criteria met (or prepare v2.3.x / v2.4 patch).
- Update external badges / references.
- Archive baseline artifacts.
- Run a final "positive evolution" reflection.

---

## 2. Tooling & Command Reference (Leverage Existing)

| Concern | Command |
|---|---|
| Core verification | `pnpm verify` |
| Positive impact | `pnpm positive:audit`, `pnpm positive:verify` |
| Security / deps | `pnpm deps:audit`, `pnpm deps:check`, `pnpm sbom`, `pnpm sbom:validate` |
| Self-audit | `pnpm self:audit`, `pnpm audit:claims`, `pnpm audit:placement` |
| Tests | `pnpm test`, `pnpm test:coverage`, `pnpm test:ci` |
| Benchmarks | `pnpm benchmark:refresh`, `pnpm bench:smoke`, `pnpm determinism:test` |
| CUDA | `pnpm cuda:export-kernels*`, `pnpm cuda:serve` |
| Ledger | `pnpm ledger:verify`, `pnpm ledger:serve` |
| **PARP L0 baseline (this protocol)** | `pnpm audit:parp-baseline` |
| **Code Scanning snapshot** | `gh api /repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts` (state=open) |

Add new scripts to `package.json` **only** when they become permanent improvements.

---

## 3. Edge Cases & Failure Modes Handled by PARP

- **Over-auditing paralysis.** Time-box each phase; impact-score deprioritizes low-value items.
- **AI-proposed incorrect fix.** Mandatory verification harness + test requirement prevents silent breakage.
- **Scope creep.** Strict invariant preservation + minimal-change rule + per-finding branch isolation.
- **External dependency breakage (LLM providers).** Document adapter resilience tests; never assume API stability.
- **License boundary errors.** Explicit Apache-2.0 (repo-wide) vs MIT (integration shims) separation in every new file.
- **Ledger health / concurrency.** Extra scrutiny + chaos testing recommended in L2.
- **Cypress baseline failure when no dev server is running.** Treat as an infrastructure precondition, not a code regression — re-run after `pnpm dev` is up, or carry as a known L0 baseline state.
- **Node engine mismatch (`22.22.3` pinned, snapshot has `22.12.x`).** `pnpm` emits `Unsupported engine` WARN but still succeeds; verify reproducibility by diffing SBOMs across two passes — they MUST be byte-identical.

---

## 4. Success Metrics

- **Quantitative.** Coverage delta, number of closed debt markers, `positive:audit` score trend, benchmark stability, open code-scanning alert count.
- **Qualitative.** Reduced "known gaps" surface area, clearer provenance story, higher contributor-joy signals (`.github/metrics/positive-contributor-joy.json`).
- **Meta.** This protocol execution itself becomes a positive-resonance case study for the framework.

---

## 5. Phoenix-DNA Hook

Any future version of this protocol must itself be audited by running PARP against its own instructions **and** the repository state it helped create. Version bumps to this document MUST be accompanied by an updated execution log in `docs/audits/PARP-execution-YYYYMMDD.md` (or an equivalent GitHub issue) demonstrating that the new protocol can re-derive the previous baseline.

---

## 6. Version History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-05-25 | PARP integration PR | Initial integration. L0 baseline executed at HEAD `e65d486`. See `artefacts/` for full evidence and the tracking issue for the L1 follow-up plan. |
| 1.1 | 2026-05-28 | PARP L3 follow-up | Relicense-drift remediation at HEAD `1982166`. Aligned the `audit:claims` engine and PARP doc to the Apache-2.0 relicense (#759): package-metadata license check now expects Apache-2.0; the README license check validates the Apache-2.0 whole-project claim instead of failing on documented MIT carve-outs; stale `// Carve-out from repo-wide BUSL-1.1` headers in the TS+Python integration shims corrected to Apache-2.0 to match `NOTICE.md`. `pnpm audit:claims` now reports **0 claim-drift WARNs / 0 package-metadata errors** (was 1 FAIL + 2 WARNs). The 9 OSSF Scorecard `TokenPermissionsID` alerts (#9, #10, #44–#48) were closed in #751/#752 (job-scoped `permissions:` + documented `SECURITY-POSTURE-NOTES.md` justifications). Remaining backlog items #7 (BranchProtectionID) and #27 (CodeReviewID) are owner-only repo-settings changes outside the code surface. |

---

*This protocol is designed to be executed by a capable AI agent (or human + AI pair) in service of elevating MCOP-Framework-2.0 toward its stated vision of verifiable, reproducible, flourishing-oriented agentic reasoning infrastructure.*

*Next recommended action after reading: open the tracking issue listed in the latest PARP execution row above and start L1 with the static-analysis + code-scanning queue.*
