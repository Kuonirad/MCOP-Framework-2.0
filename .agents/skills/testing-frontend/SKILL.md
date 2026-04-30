# Testing the MCOP-Framework-2.0 frontend

This repo is a Next.js 16 + React 19 + Turbopack app with a jsdom-based jest
suite. The canonical proof-of-correctness for any **client component** change
(anything in `src/components/*` or anything with `"use client"` at the top of
the file) is the existing jest suite — it runs every component inside the same
React 19 reconciler the browser uses and currently has **164 tests across 25
suites** (post-final-audit phase).

## Commands

```bash
# Install (use this — `pnpm install --frozen-lockfile` sometimes silently
# skips installing newly-added deps in CI/agent environments):
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install

# Full test suite:
pnpm test            # → 164 passed / 164, 25 suites

# Lint / typecheck / build (all enforce zero warnings):
pnpm lint            # eslint --max-warnings 0
pnpm typecheck       # tsc -p tsconfig.json --pretty
pnpm build           # next build --turbopack

# Coverage:
pnpm test:coverage
```

`pnpm install --frozen-lockfile` may report "Already up to date" and yet leave
freshly-added dependencies missing from `node_modules/`. If `pnpm test` fails
with `Cannot find module '<dep>'`, run a plain `pnpm install` to repair the
store.

## Browser testing — known Turbopack hydration block

At the time of writing, Next 16's Turbopack runtime chunk
(`/_next/static/chunks/<hash>.js`) throws `Error: Connection closed` from the
asset/deployment-ID resolution step on the production builds we serve from
Devin VMs (both `next start` and the standalone `node .next/standalone/server.js`
entrypoint). React therefore never hydrates and no client component mounts.

**This reproduces on `main` with no local changes**, so before assuming a PR
broke something, verify the same hydration error appears on `main`:

```js
JSON.stringify({
  hudCount: document.querySelectorAll('[data-testid="performance-hud"]').length,
  buttons: document.querySelectorAll('button').length,
  errors: window.__chisel_uncaught_errors,
})
```

If you get `{hudCount: 0, buttons: 0, errors: [Connection closed]}` on `main`,
you are hitting the environmental Turbopack issue. Fall back to:

1. `pnpm test` (jsdom is the canonical client-component test env)
2. SSR HTML inspection — `curl http://localhost:3000/ | grep -c '<selector>'`
   proves what the browser will paint first (LCP-relevant)
3. Static source checks for behavioural guarantees (e.g. "this file imports X
and contains zero `new PerformanceObserver(...)`")

This combination is the project's accepted substitute for headless-browser
testing in CI environments.

## Production server

`next.config.ts` sets `output: "standalone"`. To run a true production
simulation:

```bash
pnpm build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 PORT=3000 node .next/standalone/server.js
```

Using `pnpm start` directly emits a warning that `next start` does not work
with `output: "standalone"`; it still serves but uses the regular `.next/`
build artefact and not the standalone bundle. For SSR-HTML inspection (LCP
proof) either entrypoint is fine.

## Automated SSR validation (LCP preload contract)

`scripts/verify-ssr-lcp.mjs` is the canonical automated check that the SSR
HTML still satisfies the LCP preload contract:

- `fetchPriority="high"` appears exactly **2** times in the SSR HTML.
- One is the hero `<img>` (`/og-image.svg`).
- One is the `<link rel="preload" as="image" href="/og-image.svg" fetchPriority="high">`
  that React 19 auto-emits for any image rendered with `fetchPriority="high"`
  during the server pass.

Run it after the standalone server is live on port 3000:

```bash
node scripts/verify-ssr-lcp.mjs
# SSR LCP preload verification
#   target: http://localhost:3000/
#   fetchPriority="high" count: 2 (expected 2)
#   preload link with fetchPriority=high: true
#   <img> with fetchPriority=high: true
# PASS — LCP preload contract satisfied.
```

The shared `verifyLCPPreload` utility lives at `src/core/testing-utils.ts`
and is reusable from any jest spec that produces markup via
`react-dom/server` — see the unit tests at
`src/__tests__/testingUtils.test.ts` for the supported HTML shapes.

## The Performance HUD "Test Mode" badge

The live Performance HUD now renders a small `Test Mode` pill next to the
"Live vitals" header. The badge auto-detects the runtime via
`PerformanceObserver.supportedEntryTypes`:

- `SSR` (amber) — server render, jsdom test environment, or any browser
  without a real `PerformanceObserver`. Metrics shown are deterministic
  fixtures or empty.
- `Live` (emerald) — real browser session against a real
  `PerformanceObserver`-backed `vitalsBus`.

When reading a screenshot, always look at the badge first to decide whether
the HUD numbers are real-user telemetry or test fixtures.

## Cypress E2E (exploratory, non-blocking in CI)

The repo also ships a Cypress layer (`cypress/e2e/`) that drives the
standalone production server in a real browser:

- `performance-hud.cy.ts` — toggle / panel / ARIA / `Test Mode` badge.
- `self-verifying-vitals.cy.ts` — uses the HUD as the test oracle by
  reading each metric's `aria-label` (`LCP 1.42 s good` → parsed value
  + status), and asserts both halves against the published Core Web
  Vitals budgets. The HUD therefore cannot publish a status that
  contradicts its rendered value without a CI failure.

**Why "exploratory":** the Next.js 16 hydration block reproduces in
headless Chrome on Devin VMs against the standalone production build
too, not just the Turbopack dev server. Cypress is therefore wired in
`.github/workflows/cypress.yml` with `continue-on-error: true` until we
have a real GitHub Actions Chromium signal that says whether the
constraint is environment-specific or repo-wide. The jest + jsdom +
SSR HTML inspection path remains the canonical correctness gate.

Local reproduction:

```bash
pnpm build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
PORT=3000 node .next/standalone/server.js &
pnpm cypress:run
```

Hybrid invocation that wraps jest + Cypress (and Playwright when
`PLAYWRIGHT_ENABLED=1` is set):

```bash
pnpm test:hybrid   # concurrent
pnpm test:ci       # sequential CI fallback
```

The strategy is documented in
[`docs/adr/2026-04-25-testing-strategy.md`](../../../docs/adr/2026-04-25-testing-strategy.md).

## Where the real hydration coverage lives

`jest.config.js` runs every spec under `testEnvironment: 'jsdom'`, so
`useEffect`, `useState`, `useTransition`, `requestIdleCallback`, and
`PerformanceObserver` (polyfilled per-suite) all execute against the React 19
reconciler. The four UI-critical suites are:

- `src/__tests__/PerformanceHUD.test.tsx` — idle mount, toggle, metric rows,
  CLS-safe re-render gating, accessibility, Test Mode badge
- `src/__tests__/vitalsBus.test.ts` — `web-vitals` integration, replay, listener
  resilience under throw
- `src/__tests__/WebVitalsSentinel.test.tsx` — backend POST telemetry
- `src/__tests__/page.test.tsx` — landing-page SSR + client integration
- `src/__tests__/testingUtils.test.ts` — `verifyLCPPreload` invariants for
  the SSR LCP preload contract

If a change passes these and CI is green, it is shippable even when the
Devin VM cannot hydrate it in a real Chrome session.

## Devin Secrets Needed

None — testing is fully local against `pnpm test` and a `localhost:3000`
production server.
