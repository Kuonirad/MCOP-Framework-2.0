# MCOP Due-Diligence Register

**Status date:** 2026-05-08

This register closes the open evidence gaps that were previously recorded as
uncertainties. It does not turn external unknowns into unsupported claims; it
turns each one into a named source, command, owner, and residual risk so release
reviewers can make a logically complete decision.

## Closure matrix

| Prior uncertainty / limitation | Resolution | Residual risk | Verification source |
| --- | --- | --- | --- |
| Exact kernel source paths were partially obscured. | Canonical TypeScript, package TypeScript, and Python source paths are enumerated below. | Low: future moves must update this register. | `rg --files src packages/core mcop_package` |
| Full BUSL clause text was not extracted. | The controlling BUSL text is the repository root `LICENSE`; package mirrors are listed below. The operative parameters and terms are summarized without replacing the legal text. | Medium: legal interpretations still require counsel. | `LICENSE`, `packages/core/LICENSE`, `mcop_package/LICENSE` |
| Real PyPI/npm download/install metrics were unknown. | `scripts/registry-telemetry.mjs` now fetches current public registry metadata and npm last-month downloads. PyPI JSON still does not expose real download counts, so the script reports that limitation explicitly. | Medium: PyPI install counts require BigQuery, pepy.tech, or package-index analytics. | `pnpm registry:telemetry` |
| Long-term solo-maintainer risk was unquantified. | Risk is quantified as Bus Factor 1 today, with release-blocking mitigations and onboarding targets tracked below. | High until at least two additional maintainers have sustained review/release permissions. | `GOVERNANCE.md`, `.github/CODEOWNERS` |
| No independent security audit or production case studies were located. | The audit-response file, security policy, SBOM workflow, CodeQL/CI badges, and runnable case studies are mapped below. | Medium: automated/manual review is not a paid third-party penetration test, and fixture case studies are not customer references. | `docs/audits/independent-audit-response-2026-04-30.md`, `SECURITY.md`, `docs/CASE_STUDIES.md` |

## Canonical kernel source map

The framework is intentionally split across three substrates: the Next.js app
source, the publishable TypeScript core package, and the Python package.

| Kernel / boundary | App source | TypeScript package | Python package | Notes |
| --- | --- | --- | --- | --- |
| NOVA-NEO / context tensor encoder | `src/core/novaNeoEncoder.ts` | `packages/core/src/novaNeoEncoder.ts` | `mcop_package/mcop/triad.py`, `mcop_package/mcop/canonical_encoding.py` | Deterministic context-to-vector encoding and canonical parity helpers. |
| Stigmergy v5 / trace memory | `src/core/stigmergyV5.ts` | `packages/core/src/stigmergyV5.ts` | `mcop_package/mcop/triad.py`, `mcop_package/mcop/mycelial.py` | Merkle-linked trace persistence and recall. |
| Holographic Etch / confidence ledger | `src/core/holographicEtch.ts` | `packages/core/src/holographicEtch.ts` | `mcop_package/mcop/triad.py` | Append-only confidence/provenance ledger. |
| Provenance / hashing | `src/core/provenanceTracer.ts`, `src/core/universalCrypto.ts` | `packages/core/src/provenanceTracer.ts`, `packages/core/src/universalCrypto.ts` | `mcop_package/mcop/canonical_encoding.py` | Cross-runtime hashing, canonical JSON, and Merkle roots. |
| Tensor guard / drift checks | `src/core/tensorGuard.ts` | `packages/core/src/tensorGuard.ts` | `mcop_package/mcop/canonical_encoding.py` | Drift and canonicalization guardrails. |
| Embedding / vector math | `src/core/embeddingEngine.ts`, `src/core/vectorMath.ts` | `packages/core/src/embeddingEngine.ts`, `packages/core/src/vectorMath.ts` | `mcop_package/mcop/base.py`, `mcop_package/mcop/helpers.py` | Vector operations used by recall/scoring. |
| Dialectical synthesis / adapters | `src/adapters/dialecticalSynthesizer.ts`, `src/adapters/*Adapter.ts` | Public package exports through `packages/core/src/index.ts` | `mcop_package/mcop/engine.py`, `mcop_package/mcop/domain_base.py` | Human-in-the-loop refinement and adapter seams. |

## BUSL 1.1 operating facts

The legally controlling text is the complete top-level `LICENSE`; this section is
only an engineering summary for review checklists.

| Clause area | Repository fact |
| --- | --- |
| License family | Business Source License 1.1. |
| Licensor | Kevin John Kull / KullAILABS MCOP Framework 2.0. |
| Additional Use Grant | Production use is permitted for personal, internal-business, academic, or research purposes; non-production use is permitted. |
| Change Date | 2030-04-26T00:00:00Z, or the fourth anniversary rule described in the license, whichever is earlier for a specific BUSL version. |
| Change License | MIT License, with legacy MIT text retained in `LICENSE-MIT-LEGACY`. |
| Package mirrors | `packages/core/LICENSE` and `mcop_package/LICENSE` mirror the license for published artefacts. |
| Practical reviewer rule | If a use case is external commercial production outside the Additional Use Grant, escalate to the licensor before deployment. |

## Registry telemetry procedure

Run the command below before publishing claims about package availability or
adoption:

```bash
pnpm registry:telemetry
```

The command emits a JSON object with:

- npm package publication state, latest version, version count, latest publish
time, and last-month downloads when the npm APIs are reachable;
- PyPI package publication state and latest version;
- explicit limitation notes when a registry is unreachable or when an ecosystem
does not expose reliable install counts.

A live registry check performed on 2026-05-08 via the public npm and PyPI JSON
APIs observed:

| Package | Ecosystem | Observed latest | Observed public usage data |
| --- | --- | ---: | --- |
| `@kullailabs/mcop-core` | npm | `0.2.1` | npm downloads API reported 456 downloads for 2026-04-08 through 2026-05-07. |
| `mcop` | PyPI | `3.2.0` | PyPI JSON metadata confirmed the release, but real download counts were unavailable from that API. |

Do not cite PyPI `info.downloads` as an install metric; PyPI returns sentinel
values there rather than reliable adoption data.

## Maintainer continuity register

| Risk | Current quantified state | Control | Success condition |
| --- | --- | --- | --- |
| Bus factor | 1 lead maintainer is documented. | Governance process, CODEOWNERS, onboarding path, good-first-issue queue. | At least 3 maintainers with review rights and two release-capable maintainers. |
| Release-key concentration | Lead maintainer owns release escalation. | Require documented release playbook and two-person review for security-sensitive changes. | Secondary maintainer can cut a dry-run release from documented steps. |
| Domain knowledge concentration | Core kernel names and package boundaries are non-obvious. | This source map plus `PLAIN_ENGLISH_GLOSSARY.md` and `ARCHITECTURE.md`. | New maintainer can land a core fix without private context. |
| Security response concentration | SECURITY.md routes reports to project security contact and lead escalation. | 48-hour acknowledgement, 7-day confirmation, 90-day responsible disclosure policy. | At least two maintainers receive private advisories. |

## Security and assurance register

| Assurance item | Evidence in repo | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Independent audit response | `docs/audits/independent-audit-response-2026-04-30.md` | Findings were triaged and remediations were tracked. | It is not a formal SOC 2, ISO 27001, or paid penetration-test attestation. |
| Security policy | `SECURITY.md` | Vulnerability intake and disclosure process exists. | It does not guarantee response quality. |
| Supply-chain controls | `docs/SUPPLY_CHAIN_TRUST.md`, `docs/sbom/README.md`, `scripts/generate-sbom.mjs`, `scripts/validate-sbom.mjs` | SBOM and dependency-control procedures are documented and scriptable. | It does not eliminate dependency compromise risk. |
| CI/static checks | README build, CodeQL, coverage, release badges | Automated quality gates are advertised and linked. | Badge state can drift; check GitHub Actions for the exact commit. |
| Runnable case studies | `docs/CASE_STUDIES.md`, `examples/full_film_production_pipeline.ts`, `examples/onnx_embedding_backend.ts` | Fixture-backed flows can be executed without vendor credentials. | They are not independent customer production references. |

## Unsupported-claim guardrail

Marketing, benchmark, and integration text must not claim any of the following
unless a future release adds independently verifiable evidence:

- that MCOP is production-identical to a third-party model provider's private
runtime;
- that fleet-wide memory, etching, or global synchronization exists outside the
code and services shipped in this repository;
- that security has been independently certified beyond the audit-response and
CI evidence listed above;
- that PyPI downloads or installs are known without a cited external analytics
source.

