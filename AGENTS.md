# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MCOP Framework 2.0 is a Next.js 16 + React 19 monorepo with a TypeScript core library (`packages/core/`) and a Python package (`mcop_package/`). It is stateless — no database or external infrastructure is required. All commands are documented in `package.json` scripts and the `justfile`.

### Node.js / pnpm

- Node.js version is pinned to **22.12.0** via `.nvmrc`; any Node `>=22.9.0` works per `engines` in `package.json`.
- pnpm **9.15.0** is pinned via `packageManager` in `package.json`. Enable it with `corepack enable && corepack prepare pnpm@9.15.0 --activate`.
- `.npmrc` has `engine-strict=true` — mismatched engines will hard-fail.
- Use `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install` (not `--frozen-lockfile`) in agent environments; the lockfile variant may silently skip newly-added deps.

### Key commands (TypeScript / Next.js)

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` (Turbopack, port 3000) |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Tests | `pnpm test -- --runInBand` |
| Build | `pnpm build` |
| Full verify | `pnpm verify` (lint + typecheck + test + SBOM) |

### Key commands (Python `mcop_package/`)

| Task | Command |
|---|---|
| Install | `pip install -e './mcop_package[dev]'` |
| Tests | `cd mcop_package && python3 -m pytest -q` |
| CLI | `mcop --help` |

### Dev server caveats

- `pnpm dev` starts a Turbopack dev server on port 3000. Client hydration may fail in headless/VM environments due to a known Next.js 16 Turbopack runtime issue (`Error: Connection closed`). This is an upstream issue, not a repo bug. See `.agents/skills/testing-frontend/SKILL.md` for the accepted workaround: use `pnpm test -- --runInBand` (jsdom) as the canonical client-component correctness gate, and SSR HTML inspection (`curl localhost:3000`) for LCP/rendering verification.
- The `/api/health` endpoint returns `{"status":"ok","timestamp":"..."}` and is a quick way to confirm the server is running.
- The Dialectical Studio is at `/dialectical`.

### Testing notes

- Jest 30+ uses `--testPathPatterns` (plural). The singular `--testPathPattern` was **removed** and will error.
- The test suite runs ~757 tests across 68 suites under jsdom. Expect 5 skipped suites.
- Python tests run ~246 tests via pytest; no external services needed.
- Cypress e2e tests exist but are exploratory/non-blocking (hydration issue in headless environments). See the testing-frontend skill for details.

### Python path note

`pip install` in agent environments installs to `~/.local/bin` which may not be on PATH. Use `python3 -m pytest` instead of bare `pytest` to avoid PATH issues.
