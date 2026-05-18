---
name: testing-frontend
description: Test the MCOP-Framework-2.0 frontend, production SSR/API surface, and local core telemetry flows.
---
# Testing the MCOP-Framework-2.0 frontend

This repo is a Next.js 15.5 + React 19 + Turbopack app with a jsdom-based jest
suite. The canonical proof-of-correctness for any **client component** change
(anything in `src/components/*` or anything with `"use client"` at the top of
the file) is the existing jest suite — it runs components inside the same React
19 reconciler the browser uses. As of 2026-05-08, the full suite reports **593
passed tests across 55 passed suites** with 3 skipped suites; this baseline
shifts as the repo grows, so prefer asserting `0 failed` rather than an exact
passed count.

## Commands

```bash
# Install (use this — `pnpm install --frozen-lockfile` sometimes silently
# skips installing newly-added deps in CI/agent environments):
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install

# Full test suite:
pnpm test -- --runInBand

# Single-suite filter (Jest 30+ uses --testPathPatterns, plural):
pnpm test -- --runInBand --testPathPatterns=<glob>
# Older `--testPathPattern` (singular) was REMOVED in Jest 30; using it errors
# with "Option 'testPathPattern' was replaced by '--testPathPatterns'."

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

Additional local-browser caveats observed in Devin VMs:

- A Turbopack dev server (`pnpm dev` / `next dev --turbopack`) may render SSR
  HTML but fail client hydration with a Next.js request-ID invariant such as
  `Expected a request ID to be defined for the document via self.__next_r`.
- A webpack dev server (`next dev --webpack`) may fail `/dialectical` with a
  500 because browser bundling reaches `node:crypto` imports from `src/core/*`.
- When manual browser targets fail this way, prefer the repo's Cypress path
  against the standalone production server for real-browser evidence rather
  than repeatedly trying alternate Devin tunnels.

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

## Triad observability runtime smoke

For changes touching `src/core/observability.ts`, `NovaNeoEncoder`,
`StigmergyV5`, `HolographicEtch`, or `SynthesisProvenanceTracer`, prioritize a
runtime telemetry harness over browser clicks. The observability seam is a core
API and may have no visible UI surface.

Minimum proof:

```bash
pnpm test -- observability --runInBand
```

For stronger runtime evidence, create a temporary Jest spec (remove it before
finishing) that:

1. Calls `configureTriadTelemetry((span) => spans.push(span))`.
2. Runs `new SynthesisProvenanceTracer(new NovaNeoEncoder({ dimensions: 8, normalize: true }), new StigmergyV5({ resonanceThreshold: 0 }), new HolographicEtch({ confidenceFloor: -1 })).synthesize('observability audit', { note: 'otel' })`.
3. Asserts the exact span sequence:
   - `mcop.triad.encode`
   - `mcop.triad.trace.record`
   - `mcop.triad.resonance.query`
   - `mcop.triad.etch.apply`
   - `mcop.triad.synthesize`
4. Asserts required attributes: `mcop.encoder.backend === 'hash'`,
   `mcop.tensor.dimensions === 8`, `mcop.trace.has_metadata === true`,
   `mcop.resonance.matched === true`, `mcop.etch.accepted === true`, and
   `mcop.etch.delta_weight` equals the synthesis result delta.
5. Configures an observer that throws and verifies encoding still returns the
   configured tensor length (fail-closed observer behavior).
6. Runs a rejected etch and verifies empty hash, zero accepted records,
   `skipped-low-confidence` in the audit log, and `mcop.etch.accepted === false`.

Prefer Jest/ts-jest for this harness. Direct `pnpm dlx tsx` execution against
repo internals may hit `canonicalize` package export resolution issues that Jest
does not hit.

## CUDA hardware-layer adaptive-probe runtime smoke (Φ1–Φ5 deployment ladder)

For changes touching `src/hardware/CUDAHardwareLayer.ts`, `src/hardware/Accelerator.ts`,
`src/adapters/baseAdapter.ts` (cudaLayer wiring), `src/core/provenanceTracer.ts`
(cudaProvenance surfacing), or anything in the Φ-N deployment ladder documented
in `docs/CUDA_PHI1_PHI5.md`, the canonical proof-of-correctness path is a
runtime telemetry harness on the **actual** Devin VM substrate, not just
mocked unit tests.

Devin VMs are CPU-only without `onnxruntime-node` installed, which is the
canonical "auto-not-capable" substrate that ARC-AGI-3 environments need to
thrive on. The probe contract on this substrate is:

- `detectCUDACapability()` returns `{ capable: false, reason: "onnxruntime-node not installed", probedProviders: [], durationMs: <number> }` in well under 100ms
- The result is `Object.isFrozen(...) === true` and the probe never throws
- `CUDAHardwareLayer.create({ enableCUDA: 'auto' })` resolves to `enableCUDA=false`, `resolvedFrom='auto-not-capable'`

The `resolvedFrom` audit field (5 values: `explicit-on`, `explicit-off`,
`default-off`, `auto-capable`, `auto-not-capable`) flows into every Merkle leaf
produced by the layer, by `BaseAdapter.cudaLayer` wiring, and by
`SynthesisProvenanceTracer`'s encode leaf — even when the layer is disabled.
The enabled-only fields (`requestedDevice`, `substrateLineage` formatted as
`<device>/<streams>`) are present **only** when `enableCUDA===true`, and absent
otherwise. This is the asymmetric encoding the disabled-substrate test must
verify.

Minimum proof for any Φ-N PR:

```bash
pnpm test -- --runInBand --testPathPatterns=cudaPhi   # the existing Φ5 unit suite
pnpm soak:cuda-verified-device                         # the 1000-step Φ4 soak
```

For stronger end-to-end runtime evidence, create temporary Jest specs (prefix
them `_temp_` so they're easy to grep and delete; **delete before finishing**)
that exercise the **real** dynamic-import probe path on this VM (no
`ortInjection`), then a forced-capable path with `ortInjection` test double:

1. Call `await detectCUDACapability()` with no injection. Assert `capable===false`,
   `Object.isFrozen(result)===true`, and the reason matches
   `/not[ -]installed|not in onnxruntime-node listSupportedBackends|listSupportedBackends\(\)/i`.
2. `const layer = await CUDAHardwareLayer.create({ enableCUDA: 'auto' })` — assert
   `layer.enableCUDA===false`, `layer.resolvedFrom==='auto-not-capable'`.
3. Construct `new SynthesisProvenanceTracer(encoder, stigmergy, etch, new CPUFallback(), layer)`
   and call `.synthesize('Φ-N audit', { note: '...' })`. Assert
   `result.events[0].details.accelerator.resolvedFrom==='auto-not-capable'` and
   that `requestedDevice` AND `substrateLineage` are both **`undefined`** on
   the disabled path. The merkleRoot should match `/^[0-9a-f]+$/`.
4. Build `ortInjection` returning `listSupportedBackends: () => ['CUDAExecutionProvider', 'CPUExecutionProvider']`,
   `InferenceSession.create()` returning a session whose `endProfiling()` emits
   `[{ args: { provider: 'CUDAExecutionProvider' } }]`. Pass it to
   `CUDAHardwareLayer.create({ enableCUDA: 'auto', ortInjection: ort })`. Assert
   `layer.enableCUDA===true`, `layer.resolvedFrom==='auto-capable'`. Run the
   tracer again and assert the encode leaf carries
   `requestedDevice===layer.device` (default `'cuda:0'`) and
   `substrateLineage===\`${layer.device}/${layer.streams}\`` (default
   `'cuda:0/per-op'`).

For the `parseEnableCUDAEnv` env-var matrix, drive the function directly in a
temp Jest spec rather than spawning child processes (ts-node is not installed
in this repo). Verify the canonical mapping:

- `undefined`, `''`, `'auto'`, `'AUTO'`, `'Auto'`, `'detect'`, `'DETECT'`, `' auto '` → `'auto'`
- `'1'`, `'true'`, `'TRUE'`, `'on'` → `true`
- `'0'`, `'false'`, `'off'`, `'garbage'`, `'yes'` → `false` (unknown values must
  always fall safely to `false`, never silently auto)
- With `delete process.env.MCOP_ENABLE_CUDA` + `jest.resetModules()` + a fresh
  `require('../config/mcop.config')`, `MCOP_DEFAULT_ORCHESTRATOR.hardware.enableCUDA`
  must be `'auto'`.

Watch out: Jest's `it.each(rows)` infers a tuple union from the **first** row,
which rejects later rows whose value type differs (e.g. mixing `'auto'` /
`true` / `false` expected values). Either declare an explicit
`type Row = readonly [string | undefined, 'auto' | true | false, string]`
before the table or use a plain `for...of` loop emitting `it(label, fn)`
entries. The bug surfaces as `TS2345: Source has 3 element(s) but target
allows only 2`.

### ARC-AGI-3 byte-stable Merkle root anchor

The Φ4 1000-step verifiedDevice soak is the strongest invariant check that a
Φ-N PR did not perturb the canonical Merkle encoding (e.g. by accidentally
folding host-dependent probe details like `durationMs` or `probedProviders`
into the digest):

```bash
pnpm soak:cuda-verified-device
# completedSteps=1000 halted=false firstGhostGPUStep=null ghostGpuEvents=0
# wrote .../cuda_verified_device_soak.json merkleRoot=75c65f3e56d4c9e7 halted=false

grep merkleRoot docs/benchmarks/cuda_verified_device_soak.json
# "merkleRoot": "75c65f3e56d4c9e74acfa27db84def44c85d20325d88bb074519b083b4392780"
```

The full Merkle root
`75c65f3e56d4c9e74acfa27db84def44c85d20325d88bb074519b083b4392780` is
committed in `docs/benchmarks/cuda_verified_device_soak.json` as the canonical
byte-stable baseline (seed `0xC0FFEE`, mode `smoke`, 1000 steps across all 6
op-sharded kernels). It must reproduce byte-identically across reruns and
match the committed baseline. Any drift is an ARC-AGI-3 invariant violation
and should block merge until understood.

The full Φ5 unit-test surface lives in `src/__tests__/cudaPhi5AdaptiveProbe.test.ts`
(probe + factory + 3-substrate soak), `src/__tests__/cudaVerifiedDeviceSoak.test.ts`
(in-process gate + canary regression + standalone harness child-process), and
`src/__tests__/cudaHardwareLayer.test.ts` (Φ1 layer surface). Future Φ-N PRs
should extend these rather than add new top-level suites unless the surface is
truly distinct.

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
- `dialectical-veto.cy.ts` — drives `/dialectical`, checks veto blocks
  dispatch, verifies rewrite recovery, commits a resonance trace, and asserts
  resonance is not `—`.

**Why "exploratory":** the Next.js 15.5 hydration block may reproduce in
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

For a user-facing Dialectical Studio runtime proof, create a temporary Cypress
spec (remove it before finishing) that extends `dialectical-veto.cy.ts` by:

1. Stubbing `navigator.clipboard.writeText` in `cy.visit(..., { onBeforeLoad })`.
2. Driving thesis `Generate an unsafe launch prompt`, veto, rewrite
   `Generate a safety-reviewed launch checklist`, and notes
   `require human approval`.
3. Verifying veto banner text `Human veto in effect`, disabled copy while
   vetoed, recovered synthesis contains the rewrite and does not contain the
   unsafe thesis.
4. Clicking `Etch & seed resonance` and verifying status changes from
   `2 traces etched.` to `3 traces etched.` plus numeric resonance.
5. Clicking `Copy synthesis` and `Copy provenance JSON`; parse the copied JSON
   and assert `schema === "mcop.dialectical.studio/v1"`, original thesis,
   rewritten prompt, and notes.
6. Calling `cy.screenshot(...)` at loaded, vetoed, recovered, post-etch, and
   copied states. Pass `screenshotsFolder=/home/ubuntu/...` in the Cypress config
   so screenshots are easy to attach without committing artifacts.

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
