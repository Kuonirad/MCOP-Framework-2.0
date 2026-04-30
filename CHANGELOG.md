# Changelog

All notable changes to this project will be documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.0] — 2026-04-30

**Framework v2.2.0** — supply-chain hardening, public benchmarks, expanded
test coverage. Ships alongside `@kullailabs/mcop-core@0.2.0` (npm) and
`mcop@3.2.0` (PyPI).

### Added
- **CycloneDX SBOM generation + schema validation in publish
  workflows.** `.github/workflows/publish-npm.yml` and
  `publish-pypi.yml` now run `pnpm sbom` + `pnpm sbom:validate`
  before publishing, then attach the two generated SBOMs
  (`mcop-framework.cdx.json` and `mcop-core.cdx.json`) to the GitHub
  Release via `softprops/action-gh-release@v2.6.2`. Closes Phase 2 ②
  of the post-audit roadmap; `docs/sbom/README.md` updated to drop
  the previous "Devin's GitHub OAuth lacks workflow scope" caveat
  and link directly to the workflow files.

- **Targeted branch-coverage tests for the four roadmap-flagged hot
  files** (`src/__tests__/coverage-gaps.test.tsx`, +14 cases).
  Addresses Phase 2 ① of the post-audit roadmap: lifts branch coverage
  on `usePerformanceCoach.ts` 67.85% → 89.28%, `useVSIPredictor.ts`
  74.07% → 81.48%, `DialecticalStudio.tsx` 79.36% → 84.74%, and
  `promptingModes.ts` 62.96% → 70.37%. Project-wide branch coverage
  rises 81.96% → 84.57% and project-wide line coverage rises 94.24% →
  96%. Genuinely-unreachable browser-only paths (real-Worker callback,
  `execCommand` clipboard fallback for non-secure contexts) are tagged
  with `/* istanbul ignore next */` and a one-line justification rather
  than tested through jsdom.
- **CycloneDX SBOM schema validation.** New `pnpm sbom:validate`
  script (`scripts/validate-sbom.mjs`) validates each generated SBOM
  against the official CycloneDX JSON schema bundled with
  [`@cyclonedx/cyclonedx-library`](https://www.npmjs.com/package/@cyclonedx/cyclonedx-library).
  The script auto-detects each SBOM's declared `specVersion` (1.0 –
  1.7) and exits non-zero on schema violations. Replaces the
  previously-suggested `@cyclonedx/cyclonedx-cli` recipe, which is not
  published to npm (the OWASP CLI ships as a Rust binary on GitHub
  releases). `docs/sbom/README.md` updated accordingly.
- **CycloneDX SBOM generation.** `pnpm sbom` runs
  [`@cyclonedx/cdxgen`](https://www.npmjs.com/package/@cyclonedx/cdxgen)
  (OWASP-maintained, pnpm-lockfile aware) against both the root
  `@kuonirad/mcop-framework` workspace and the publishable
  `packages/core/` (`@kullailabs/mcop-core`) workspace, emitting
  CycloneDX JSON SBOMs to `docs/sbom/*.cdx.json` (gitignored,
  regenerated on demand). Documented at `docs/sbom/README.md`,
  including the recommended one-line addition for the maintainer to
  attach SBOMs to GitHub releases. Pairs with the existing Sigstore
  provenance attestations from npm Trusted Publishing.
- **Runnable ONNX `IEmbeddingBackend` example** at
  `examples/onnx_embedding_backend.ts`. Demonstrates wrapping
  `onnxruntime-node` against an `all-MiniLM-L6-v2` ONNX export to
  produce 384-d sentence embeddings, mean-pooling over tokens, and
  projecting into MCOP's configured `dimensions` budget via
  signed-bucket folding so the rest of the triad needs no changes.
  Uses dynamic `import()` so the file typechecks and runs the
  fallback path even when `onnxruntime-node` is not installed —
  doubles as executable documentation. Header comment includes the
  exact `curl` setup commands.

- **pnpm workspaces.** `pnpm-workspace.yaml` registers `packages/*` so
  `packages/core/` (`@kullailabs/mcop-core`) is now a first-class workspace
  member, hoisted into a single shared `node_modules`. `pnpm install`,
  `pnpm -r typecheck`, and `pnpm --filter @kullailabs/mcop-core build` all
  work end-to-end. The Python sibling `mcop_package/` remains an
  independent PyPI project. See `docs/MONOREPO.md` for the full layout
  and intentional code-divergence map.
- **Shared-docs guardian** — `scripts/shared-docs-guard.mjs` (invokable
  via `pnpm docs:guard`). Hard-fails when the BUSL `LICENSE` text drifts
  between root, `packages/core/`, and `mcop_package/`. Advisory-only
  reporting for `NOTICE.md` and `LICENSE-MIT-LEGACY` (legitimately
  divergent per-package).
- **Public benchmarks refresh CLI** — `pnpm benchmark:refresh` regenerates
  `docs/benchmarks/results.json` from `runPromptingBenchmark` against the
  canonical fixture. Existing test guards keep the snapshot reproducible
  in CI; the new script provides a one-line refresh affordance for
  fixture changes. The benchmarks page (`/benchmarks`) and methodology
  doc (`docs/benchmarks/methodology.md`) already wire this dataset.
- **TypeDoc API docs** — `pnpm typedoc` (root alias) generates static
  HTML for `@kullailabs/mcop-core` into `docs/api/core/` (gitignored,
  regenerable). `packages/core/typedoc.json` controls entry points and
  branding. See `docs/api/README.md` for local-generation +
  publishing-to-Pages instructions.
- **Coverage badge** — `pnpm coverage:badge` reads
  `coverage/coverage-summary.json` (Jest `json-summary` reporter) and
  writes a self-contained SVG to `docs/badges/coverage.svg`. README links
  to it. No external service (no shields.io, no Codecov) needed.

### Changed
- **Repo rename hygiene.** Updated all GitHub URLs, badges, clone
  instructions, sitemap entries, and package metadata to the canonical
  repository name `Kuonirad/MCOP-Framework-2.0` (previously
  `Kuonirad/KullAILABS-MCOP-Framework-2.0`; GitHub continues to redirect
  the old slug). The published npm scope `@kullailabs/mcop-core` and the
  PyPI package `mcop` are unchanged so no consumer action is required.

### Added
- **NOVA-NEO Embedding Backend.** `NovaNeoConfig` now accepts `backend: 'hash' | 'embedding'`. The default `'hash'` preserves byte-identical v1.x behavior. The new `'embedding'` backend uses n-gram feature hashing (the "hashing trick") to produce vectors where semantically similar prompts have correlated activations — a zero-dependency, deterministic, cross-platform semantic encoder. See `src/core/embeddingEngine.ts` and `src/__tests__/novaNeoEncoder.embedding.test.ts`.
- **Independent Audit Response.** `docs/audits/independent-audit-response-2026-04-30.md` documents findings (316 `bolt-*` branches, bus factor ~1, florid terminology, unverified claims, scope creep risk) and registers remediation status for each. Includes a formal Scope Lock limiting core additions to the deterministic triad only.

### Changed
- **Docs consolidation: single canonical MCOP expansion.** Replaced the two
  historical variants ("Multi-Cognitive Optimization Protocol" in
  `ARCHITECTURE.md`, "Meta-Cognitive Operating Protocol" in
  `packages/core/`, `mcop_package/`, and the Python CLI/demo strings) with
  the canonical **Meta-Cognitive Optimization Protocol** across all
  documentation and package metadata. Identifiers, exports, package names
  (`@kullailabs/mcop-core`, `mcop`), wire formats, and the deterministic
  triad's behavior are unchanged — this is a prose-only change.
- **Contributor tiers labeled legacy.** `CONTRIBUTOR_ONBOARDING.md` now
  carries an explicit legacy-disclaimer banner above the
  `Seedling / Sapling / Canopy / Keystone` tiers, pointing at
  `GOVERNANCE.md` for the operative contribution and maintainer model.
  The tiers are preserved for continuity with prior recognition.
- **Bootstrap Compression Kernel labeled conceptual.**
  `docs/whitepapers/MCOP_Blueprint_Supplement_Volume_II.md` and
  `PLAIN_ENGLISH_GLOSSARY.md` §7 now mark the Bootstrap Compression Kernel
  / Algorithm as conceptual design vocabulary with no shipping counterpart
  in `src/core/` or `mcop_package/mcop/`. None of the deterministic-triad
  guarantees depend on it.
- **Glossary §1 and §11 rewritten.** §1 now states the canonical expansion
  up front and lists historical variants as a discoverability aid; §11
  ("Uncertainties / open items") becomes "Resolved items" reflecting the
  three changes above.

## [2.1.0] — 2026-04-19

### Added
- `release-drafter` workflow for automated, label-driven release-notes
  assembly on every merge to `main`.
- Scheduled `stale` workflow to prevent PR/issue backlog regression.
- `auto-close-bot-prs` workflow to consolidate duplicate automated PRs.
- `delete-merged-branches` workflow to keep the branch list clean after merge.
- `GOVERNANCE.md` documenting the maintainer roster, lazy-consensus decision
  model, release process, and security escalation path.
- `.github/FUNDING.yml` for GitHub Sponsors integration.
- Dedicated release-notes files under `docs/releases/`.

### Changed
- NovaNeoEncoder `estimateEntropy` rewritten with native `for` loops instead of
  `Array.reduce` / `Math.pow` for measurable throughput gains on large
  contexts.
- StigmergyV5 resonance search caches vector magnitudes (~O(N) speedup).
- Pino logger hardened with explicit `redact` array to suppress sensitive
  payloads in structured logs.
- CI pipeline migrated from npm to pnpm and pinned to SHA-addressed actions.
- README badge set replaced with CI / CodeQL / Releases / License /
  Contributors / Maintained — removed the obsolete eco-fitness and
  bus-factor badges that no longer reflect project state.

### Fixed
- `actions/upload-artifact` pinned to `@v4` (resolved broken SHA).
- CodeQL alert on sensitive data exposure in CLI logs.
- Accessibility: decorative icons marked `aria-hidden`, alt text tightened on
  File / Window / Globe icons in `src/app/page.tsx`.
- ESLint configuration reconciled with Next.js 16.

## [2.0.2] — 2026-04-09

### Added
- Crypto-strong (`crypto.randomUUID`) trace identifiers in StigmergyV5.
- Container health-check endpoint for Docker orchestration.
- Eco-fitness audit script (`npm run eco:audit`).

### Changed
- Security headers expanded (CSP, HSTS, frame-options).
- Docker base image pinned to a specific digest.
- Composite CI setup action extracted; checkout moved to workflow level to fix
  loading failure.

### Fixed
- CodeQL sensitive-logging alert in CLI utilities.
- `publish.yml` syntax error.
- `eco-fitness` math utility error.

## [2.0.1] — 2025-12-31

### Added
- `CONTRIBUTOR_ONBOARDING.md` — 30-minute runway for new contributors.
- `ROADMAP_TO_100.md` — historical aspirational roadmap (now archived).
- Automated eco-fitness scoring system and self-referential meta-trace.
- `package-lock.json` produced from dependency audit.

### Changed
- Dependency surface optimized and syntax errors resolved.
- CI actions bumped to v6 (`checkout`, `setup-node`, `codeql-action`,
  `upload-artifact`).
- `next` bumped from 16.0.10 to 16.1.0.

### Fixed
- Docs-button accessibility: removed fixed width, added hover/animation.
- Dark-mode icon visibility and responsive sizing.

## [2.0.0] — 2025-12-19

### Added
- Complete MCOP v3.1 reasoning engine.
- TypeScript orchestration frontend.
- Secure Docker & CI/CD automation.
- CodeQL, Trojan-source guard, and reproducible Makefile.
- Code of Conduct, SECURITY.md, and PR/issue templates.

### Changed
- Full documentation refresh (API, Usage, Architecture).
- Multi-domain reasoning surface (General, Medical, Scientific).
- Compliance with GitHub Community Standards.

## [1.x.x] — Internal prototypes

Early MCOP logic and triad experiments. Not publicly released.
