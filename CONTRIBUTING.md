# Contributing to MCOP Framework 2.0

Thanks for advancing the triad. This guide keeps contributions deterministic, auditable, and easy to review.

## 🌟 Code of Conduct
Participation implies agreement with our Code of Conduct. Report unacceptable behavior to the maintainers.

## 🧭 Contribution Philosophy (Stigmergic)
- **Pheromone drops**: Small, traceable commits with clear intent.
- **Provenance**: Reference issues in commits and PRs; include context tensors (problem statements) in descriptions when relevant.
- **Replayability**: Prefer deterministic tests and scripts; avoid non-reproducible benchmarks.

## 🚀 How Can I Contribute?
### Reporting Bugs
- Provide reproduction steps, expected vs. actual behavior, and environment details.
- Attach logs or trace hashes if applicable.

### Suggesting Enhancements
- Outline the problem first, then the proposal.
- Link to related traces (issues, discussions, or prototypes).

### Pull Requests
1. Fork and branch from `main` (`feature/...`, `bugfix/...`, `docs/...`).
2. Add or update tests for any behavior changes.
3. Run `pnpm test` locally; ensure `pnpm lint` and `pnpm typecheck` also pass.
4. Include a short changelog in the PR description (context → change → validation).
5. Request review; respond to feedback and keep commits cohesive.

## 🛠️ Development Setup
```bash
git clone https://github.com/YOUR_USERNAME/KullAILABS-MCOP-Framework-2.0.git
cd KullAILABS-MCOP-Framework-2.0
corepack enable                    # first-time only; activates pnpm@9.15.0
pnpm install --frozen-lockfile
pnpm dev                           # dev server
pnpm test                          # unit + coverage
pnpm typecheck                     # strict TS check
pnpm build                         # next build (standalone output)
```

## 📋 Guidelines
- **TypeScript-first**: Use TS/TSX; keep functions small with explicit return types.
- **No secrets**: Do not commit credentials or tokens. Tests enforce this.
- **Docs**: Update README/ARCHITECTURE when you add or change triad behavior.
- **Tests**: Prefer deterministic inputs; avoid network calls in CI.
- **Commit style**: Imperative mood, ≤72 chars in the subject. Example:
```
feat: add holographic etch accumulator

- implement rank-1 delta tracking
- expose audit-friendly retrieval API
- add unit tests for weight accumulation
```

## 🔬 Review Checklist
Reviewers verify:
- Tests pass and code is typed/linters clean.
- Security posture is unchanged or improved (no secrets, pinned actions).
- Documentation matches behavior.
- Performance-sensitive code paths are benchmarked or reasoned about.

## 🎯 Priority Areas
- Triad kernel enhancements (encoding, resonance, etching).
- Observability and provenance tooling.
- Security hardening and supply-chain hygiene.
- Documentation and tutorials.

## ❓ Questions
Use GitHub Issues for bugs/requests and Discussions for open-ended design topics. Maintainers watch both.
