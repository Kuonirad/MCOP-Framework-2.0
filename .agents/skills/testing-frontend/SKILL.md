# Testing the MCOP-Framework-2.0 frontend

This repo is a Next.js 16 + React 19 + Turbopack app with a jsdom-based jest
suite. The canonical proof-of-correctness for any **client component** change
(anything in `src/components/*` or anything with `"use client"` at the top of
the file) is the existing jest suite — it runs components inside the same React
19 reconciler the browser uses. As of 2026-05-01, the full suite reports **424
passed tests across 43 passed suites** with 3 skipped suites.

## Commands

```bash
# Install (use this — `pnpm install --frozen-lockfile` sometimes silently
# skips installing newly-added deps in CI/agent environments):
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install

# Full test suite:
pnpm test -- --runInBand  # current baseline: 424 passed / 427 total, 43 passed suites

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

**This may reproduce on `main` with no local changes**, so before assuming a PR
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

1. `pnpm test -- --runInBand` (jsdom is the canonical client-component test env)
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

For a minimal browser smoke of the public app surface, open `http://localhost:3000/`
and verify:

- `MCOP Framework 2.0` appears in the hero.
- `Universal Adapter Protocol v2.1` appears in the page copy.
- The `Health endpoint` link opens `/api/health` and returns JSON with
  `"status":"ok"` plus a `timestamp` field.

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

## Credential-free examples and Universal Adapter Protocol smoke tests

When docs/examples touch case studies, ONNX/GPU runbooks, or the Universal
Adapter Protocol, run the fixture examples directly. They should not require
vendor credentials or make external API calls.

```bash
pnpm dlx tsx --tsconfig tsconfig.json examples/full_film_production_pipeline.ts
```

Expected film-pipeline evidence:

- `MCOP full film production case study`
- scene IDs `scene-001`, `scene-014`, and `scene-031`
- fixture asset schemes `case-study://frames/`, `case-study://shots/`, and
  `case-study://audio/`
- `rough cut: case-study://edl/`
- `audit ready: true`
- non-empty `final merkle root:` and `stigmergy root:` lines

For the JSON-RPC-over-stdio MCP reference server:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' \
  | pnpm dlx tsx --tsconfig tsconfig.json examples/universal_adapter_mcp_server/server.ts

printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mcop.adapter.generate","arguments":{"prompt":"aurora-lit cathedral trailer frame","domain":"graphic","metadata":{"demo":true}}}}\n' \
  | pnpm dlx tsx --tsconfig tsconfig.json examples/universal_adapter_mcp_server/server.ts
```

Expected MCP evidence:

- `tools/list` includes `mcop.adapter.capabilities`, `mcop.adapter.generate`,
  and `mcop.adapter.prepare`.
- `tools/call` returns `assetUrl":"mcp-reference://aurora-lit-cathedral-trailer-frame"`.
- `tools/call` returns `"promptLength":34` plus `merkleRoot`, `provenance`, and
  `resonanceScore`.

## The Performance HUD "Test Mode" badge

The live Performance HUD renders a small `Test Mode` pill next to the
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

**Why "exploratory":** the Next.js 16 hydration block may reproduce in
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
reconciler. The UI-critical suites include:

- `src/__tests__/PerformanceHUD.test.tsx` — idle mount, toggle, metric rows,
  CLS-safe re-render gating, accessibility, Test Mode badge
- `src/__tests__/vitalsBus.test.ts` — `web-vitals` integration, replay, listener
  resilience under throw
- `src/__tests__/WebVitalsSentinel.test.tsx` — backend POST telemetry, when present
- `src/__tests__/page.test.tsx` — landing-page SSR + client integration
- `src/__tests__/testingUtils.test.ts` — `verifyLCPPreload` invariants for
  the SSR LCP preload contract

If a change passes these and CI is green, it is shippable even when the
Devin VM cannot hydrate it in a real Chrome session.

## Devin Secrets Needed

None — testing is fully local against `pnpm test`, a `localhost:3000`
production server, and credential-free fixture examples. Vendor credentials are
only needed if intentionally replacing fixture clients with real production SDKs.
