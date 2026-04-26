# ADR — Hybrid testing strategy (Jest + Cypress, with optional Playwright)

- **Status:** Accepted
- **Date:** 2026-04-25
- **Updated:** 2026-04-26 — first real GH Actions Chromium signal in
  via PR #484: 8/9 Cypress specs passed against the standalone
  production server, hydration block did **not** reproduce on
  GitHub-hosted runners. See "CI signal update" below.
- **Context owners:** MCOP audit (v10 master prompt) — Performance HUD,
  SSR LCP preload contract, Test Mode badge.

## CI signal update (2026-04-26)

The first real GitHub Actions Chromium run (PR #484, run 24945364046,
job 73045794107) settled the open question this ADR flagged at
adoption time. Cypress booted, hydrated against
`node .next/standalone/server.js`, and ran the full suite — the
`Error: Connection closed` chunk-fetch failure that reproduces in
headless Chrome on Devin VMs **does not** reproduce on
GitHub-hosted runners. 8 of 9 specs pass; the one remaining failure
is a real spec-level INP-flush ordering issue rather than the
underlying hydration block.

The Cypress workflow stays at `continue-on-error: true` for one or
two more iterations to confirm the signal is stable across reruns,
then we ratchet to a blocking gate. The jest + jsdom + SSR HTML path
remains the canonical correctness gate independent of that ratchet.

## Context

The MCOP Visualizer ships on Next.js 16 with Turbopack and React 19. The
v10 master prompt audit converged on three findings that this ADR
formalises into a testing strategy:

1. **Live-Chrome hydration is blocked in dev mode.** The Turbopack
   runtime-chunk path raises `Error: Connection closed` from
   `/_next/static/chunks/<hash>.js` on Devin VMs and similar headless
   CI environments. The block reproduces on `main` with no local
   changes — it is environmental, not a regression in this repo.
   See [`.agents/skills/testing-frontend/SKILL.md`](../../.agents/skills/testing-frontend/SKILL.md).

2. **The production standalone build does not escape the
   constraint locally.** Empirically, hydration in headless Chrome
   on Devin VMs raises the same `Error: Connection closed` from
   `/_next/static/chunks/<hash>.js` against
   `node .next/standalone/server.js` as it does against
   `next dev --turbopack`. The block is therefore a Next.js 16 +
   headless-Chrome interaction, not a Turbopack-only dev-mode
   issue. Whether real GitHub Actions runners (different Chromium
   binary, different network stack) behave the same way is
   unknown until we have a CI signal.

3. **The current jest + jsdom suite is the canonical
   proof-of-correctness for client components.** It runs in <10 s,
   covers 166 specs across 25 suites, and has been audited end-to-end
   against the SSR HTML contract. Migrating it wholesale to Vitest
   Browser Mode would be a high-risk refactor with no immediate
   correctness gain, since jsdom + SSR HTML inspection already
   verifies every accessible invariant.

## Decision

We adopt a **hybrid testing strategy** with three layers, additive
rather than replacement:

| Layer | Tool | Scope | Runs in CI |
|---|---|---|---|
| L1 — unit / component | **jest** + jsdom | Pure logic, hooks, components, SSR HTML contract | Always, **blocking** (matrix on Node 20.x and 22.x) |
| L1.5 — SSR HTML invariants | `scripts/verify-ssr-lcp.mjs` | LCP preload contract on the live standalone server | Always, **blocking** (inside the Cypress workflow, before Cypress runs) |
| L2 — E2E (live browser) | **Cypress** against the **standalone production server** | Real hydration, Performance HUD interactions, self-verifying live LCP / INP / CLS / VSI | Always, **non-blocking** (`continue-on-error: true`) until we confirm whether real GitHub Actions Chromium hits the same hydration block as Devin VM headless Chrome |
| L3 — cross-browser (optional) | **Playwright** (not installed yet) | Future Firefox / WebKit coverage when the audit calls for it | Only when `PLAYWRIGHT_ENABLED=1` |

### What this resolves

- **Audit caveat #1 — live-Chrome hydration.** Cypress is wired
  against the production standalone server (which strips
  Turbopack's dev hot-reload runtime) but the underlying
  Next.js 16 / headless-Chrome chunk-fetch failure still
  reproduces locally on Devin VMs. The Cypress workflow is
  therefore wired as a **non-blocking exploratory CI signal**
  (`continue-on-error: true`); if real GitHub Actions Chromium
  hydrates cleanly, we tighten the gate. If it doesn't, the
  Cypress specs still serve as documentation of the contract
  the HUD must satisfy and run cleanly the moment the upstream
  issue is resolved. The jest + jsdom + SSR HTML path remains
  the canonical correctness gate either way.
- **Audit caveat #2 — the SSR vs. live distinction.** The Test Mode
  badge auto-detects `live` against real Chrome (because
  `PerformanceObserver.supportedEntryTypes` is populated) and `ssr`
  in jsdom. The Cypress spec asserts the live state explicitly, so
  any regression in the auto-detection logic surfaces immediately.
- **Audit caveat #3 — vitals provenance.** The new
  `cypress/e2e/self-verifying-vitals.cy.ts` reads each metric's
  `aria-label` directly off the HUD, parses it back into a numeric
  value, and asserts both the parsed value and the rendered status
  against the published Core Web Vitals budgets. This turns the HUD
  itself into the test oracle — the *displayed* numbers and the
  *underlying* classifier cannot drift apart without a CI failure.
- **Audit caveat #4 — automated SSR validation.** The pre-existing
  `scripts/verify-ssr-lcp.mjs` continues to run as a smoke-test
  invariant inside the Cypress workflow, before the browser specs.

### What this does *not* change

- **No Jest → Vitest Browser Mode migration.** Deferred. The hybrid
  layout makes that migration optional rather than required, so we
  schedule it only if a future audit identifies a concrete gap that
  jsdom cannot close.
- **No Playwright install.** The hybrid script wires Playwright
  behind a `PLAYWRIGHT_ENABLED=1` opt-in; until that flag is set
  in CI, only jest and Cypress run. This keeps the install path
  small and avoids paying for a tool the repo does not yet use.
- **No replacement of existing specs.** Every jest spec stays as-is;
  Cypress is purely additive.

## Consequences

### Positive

- The repo gains a real-browser CI signal on Performance HUD
  behaviour without losing the fast jsdom suite.
- The Performance HUD becomes self-verifying: it cannot publish a
  status that contradicts its rendered value, because Cypress
  re-parses the value back through the same classifier.
- The Turbopack dev-mode caveat becomes a documented constraint
  with an automated workaround, not an open audit item.
- Future contributors who can't run the dev server can still
  validate their changes end-to-end via the standalone build.

### Negative

- Cypress install adds ~1 GB of devDependencies and a binary cache
  step in CI. Mitigated by `actions/cache` keyed on the lockfile.
- The Cypress workflow adds ~3-5 minutes to PR feedback time.
  Mitigated by running it in parallel with the existing
  `Build and Test` workflow rather than serially.
- A future Next.js / Turbopack release that broke production
  hydration would silently break Cypress without affecting jest.
  Mitigated by keeping `verify-ssr-lcp.mjs` as the dependency-free
  invariant that runs *before* the Cypress browser specs.

### Neutral

- The hybrid script (`pnpm test:hybrid`) provides a one-command
  developer ergonomics path. The sequential `pnpm test:ci` target
  is the conservative fallback when concurrency is undesired.

## Implementation references

- `cypress.config.ts` — config pointing Cypress at
  `http://localhost:3000`.
- `cypress/e2e/performance-hud.cy.ts` — HUD interaction contract
  (toggle, ARIA, panel open/close, Alt+P, Escape, Test Mode badge).
- `cypress/e2e/self-verifying-vitals.cy.ts` — live LCP / INP / CLS /
  VSI assertion using the HUD as oracle.
- `.github/workflows/cypress.yml` — build → stage standalone →
  serve → run Cypress.
- `package.json` — `cypress:run`, `cypress:open`, `test:hybrid`,
  `test:ci`, `test:ssr-lcp` scripts.

## Status

Accepted. Ratchet the strategy upward (e.g. enable Playwright,
revisit the Vitest migration) only on the back of a future audit.
