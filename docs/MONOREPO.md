# Monorepo layout

This repository hosts three sibling artefacts that ship to three different
registries, plus the live Next.js app:

| Path                | Artefact                                   | Registry          |
| ------------------- | ------------------------------------------ | ----------------- |
| `/` (root)          | `@kuonirad/mcop-framework` Next.js + app   | GitHub Packages   |
| `packages/core/`    | `@kullailabs/mcop-core` library            | npm (public)      |
| `mcop_package/`     | `mcop` Python SDK                          | PyPI              |

The audit recommendation #2 ("consolidate duplication via pnpm workspaces")
is implemented in two non-disruptive layers:

## 1. pnpm workspace declaration

`pnpm-workspace.yaml` registers `packages/*` as a workspace. After
`pnpm install`, `packages/core/` is hoisted into a single shared
`node_modules` and resolves like a normal workspace package. No runtime
behavior changes — the published `@kullailabs/mcop-core` is still built
from `packages/core/src/` by `tsup` with its own zero-dependency surface.

The Python sibling `mcop_package/` is intentionally **not** a pnpm
workspace member; it has its own `pyproject.toml` / `setup.py` and is
published independently to PyPI.

## 2. Cross-package doc / parity hygiene

Three CI-visible scripts now police drift across the three artefacts:

| Script                     | What it polices                                                   |
| -------------------------- | ----------------------------------------------------------------- |
| `pnpm parity:check`        | TS↔Py wire-format / fingerprint parity (existing).                |
| `pnpm docs:guard`          | LICENSE byte-identity across root, `packages/core/`, `mcop_package/`. NOTICE / LEGACY-LICENSE drift is reported as INFO (intentional per-package). |
| `pnpm triad:fingerprint`   | Deterministic-triad SHA fingerprint (existing).                   |

Run them locally before opening a PR that touches `packages/core/`,
`mcop_package/`, or any of the legal / governance files at the root.

## Intentional code divergence between root and `packages/core/`

`src/core/*.ts` (root, used by the Next.js app) and
`packages/core/src/*.ts` (the published library) are **not** byte-identical
by design. The published library is zero-dependency: it does not import
`pino` or any of the root app's utilities. For example, `novaNeoEncoder.ts`
in the published library replaces the root's pino-based `logger.debug({…})`
with an opt-in `setNovaNeoDebugHook(hook)` callback so consumers wire their
own logger.

Future work (out of scope for this PR): factor the byte-identical helpers
(`circularBuffer`, `vectorMath`, `canonicalEncoding`, `types`) into a
single source of truth and have the root import them through the workspace
package, leaving only the genuinely-divergent thin shells in each location.
