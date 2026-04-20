# Changelog

All notable changes to this project will be documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
