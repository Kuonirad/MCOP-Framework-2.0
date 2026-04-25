# Testing the KullAILABS-MCOP-Framework-2.0 frontend

This repo is a Next.js 16 + React 19 + Turbopack app with a jsdom-based jest
suite. The canonical proof-of-correctness for any **client component** change
(anything in `src/components/*` or anything with `"use client"` at the top of
the file) is the existing jest suite — it runs every component inside the same
React 19 reconciler the browser uses and currently has 119 tests across 19
suites.

## Commands

```bash
# Install (use this — `pnpm install --frozen-lockfile` sometimes silently
# skips installing newly-added deps in CI/agent environments):
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install

# Full test suite:
pnpm test            # → 119 passed / 119, 19 suites

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

## Where the real hydration coverage lives

`jest.config.js` runs every spec under `testEnvironment: 'jsdom'`, so
`useEffect`, `useState`, `useTransition`, `requestIdleCallback`, and
`PerformanceObserver` (polyfilled per-suite) all execute against the React 19
reconciler. The four UI-critical suites are:

- `src/__tests__/PerformanceHUD.test.tsx` — idle mount, toggle, metric rows,
  CLS-safe re-render gating, accessibility
- `src/__tests__/vitalsBus.test.ts` — `web-vitals` integration, replay, listener
  resilience under throw
- `src/__tests__/WebVitalsSentinel.test.tsx` — backend POST telemetry
- `src/__tests__/page.test.tsx` — landing-page SSR + client integration

If a change passes these and CI is green, it is shippable even when the
Devin VM cannot hydrate it in a real Chrome session.

## Devin Secrets Needed

None — testing is fully local against `pnpm test` and a `localhost:3000`
production server.
