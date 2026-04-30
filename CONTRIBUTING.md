# Contributing to MCOP Framework 2.0

Thanks for advancing the triad. This guide keeps contributions deterministic,
auditable, and easy to review.

> The repository is a **multi-language monorepo**: a Next.js 16 / React 19
> TypeScript surface, a `packages/core/` ESM+CJS distribution, and a Python
> implementation under `mcop_package/`. Coordination across these boundaries
> is the central concern of this document.

---

## Table of contents

1. [Code of conduct](#-code-of-conduct)
2. [Contribution philosophy](#-contribution-philosophy-stigmergic)
3. [Reporting bugs and proposing enhancements](#-reporting-bugs-and-proposing-enhancements)
4. [Development setup](#-development-setup)
5. [Repository layout](#-repository-layout)
6. [Local workflows by surface](#-local-workflows-by-surface)
7. [Coding standards](#-coding-standards)
8. [Testing requirements](#-testing-requirements)
9. [Changesets and release flow](#-changesets-and-release-flow)
10. [Pull request checklist](#-pull-request-checklist)
11. [Merging and production deployment](#-merging-and-production-deployment)
12. [Commit conventions](#-commit-conventions)
13. [Security and supply chain](#-security-and-supply-chain)
14. [Documentation expectations](#-documentation-expectations)
15. [Getting help](#-getting-help)

---

## 🌟 Code of Conduct

Participation implies agreement with our [Code of Conduct](./CODE_OF_CONDUCT.md).
Report unacceptable behavior to the maintainers via the contact channel listed
in [GOVERNANCE.md](./GOVERNANCE.md).

---

## 🧭 Contribution philosophy (stigmergic)

The framework rewards small, traceable interventions:

- **Pheromone drops** — keep commits focused; each one should be reviewable
  in isolation. If your change touches three concerns, ship three commits.
- **Provenance first** — link related issues, prior PRs, or design notes in
  the commit body. Reviewers should not need to reconstruct your reasoning.
- **Replayability** — prefer deterministic tests, fixed seeds, and pure
  functions. Anything that depends on wall-clock time, network state, or
  ordering of events must be quarantined behind a clear seam.
- **Audit-friendly mutations** — touching state? Add or update the
  corresponding Merkle/etch test so the audit ring still verifies cleanly.

---

## 🐛 Reporting bugs and proposing enhancements

### Reporting bugs
- Provide reproduction steps, expected vs. actual behavior, and environment
  details (Node version, pnpm version, OS).
- Attach logs or trace hashes if applicable. Trace hashes uniquely identify
  a triad invocation; including one lets us replay the exact failure.
- Mark security-sensitive reports per [SECURITY.md](./SECURITY.md) — do not
  open public issues for vulnerabilities.

### Suggesting enhancements
- Outline the **problem** first, the **proposal** second.
- If the proposal touches the protocol surface (Universal Adapter Protocol,
  triad kernel APIs), open a discussion before a PR — these surfaces are
  versioned and contract-tested.
- Link related traces (issues, discussions, prototypes).

---

## 🛠️ Development setup

The repository uses **pnpm@9.15.0** (pinned via `packageManager` in
`package.json`) and **Node.js 20.11.0** (pinned via `.nvmrc`). The Python
surface targets **3.11+**.

```bash
# Clone your fork
git clone https://github.com/<YOUR_USER>/KullAILABS-MCOP-Framework-2.0.git
cd KullAILABS-MCOP-Framework-2.0

# Activate the pinned Node version (recommended: nvm or Volta)
nvm use                              # picks 20.11.0 from .nvmrc

# Activate pnpm via corepack (first time only)
corepack enable
corepack prepare pnpm@9.15.0 --activate

# Install JS/TS dependencies for the entire workspace
pnpm install                         # use plain install, not --frozen-lockfile,
                                     # for fresh clones; CI uses frozen lockfile.

# Optional: Python development environment
python -m venv .venv && source .venv/bin/activate
pip install -e mcop_package[dev]
```

### Daily commands

```bash
pnpm dev                # Next.js dev server (Turbopack)
pnpm build              # Production build (standalone output)
pnpm start              # Serve the production build
pnpm test               # Jest suite (currently 146 tests / 22 suites)
pnpm test:watch         # Jest in watch mode
pnpm test:coverage      # Jest + coverage report
pnpm lint               # ESLint, --max-warnings=0
pnpm typecheck          # tsc --noEmit (strict)
pnpm deps:check         # pnpm outdated + audit (moderate+)
pnpm parity:check       # Cross-runtime parity guardian
pnpm triad:fingerprint  # Deterministic triad fingerprint
```

---

## 📁 Repository layout

```
.
├── src/
│   ├── app/             Next.js 16 App Router routes + server components
│   ├── components/      Client components (HUD, VSI Coach, hooks)
│   ├── core/            Triad kernels (Encoder, Stigmergy, Etch)
│   ├── adapters/        TypeScript Universal Adapter Protocol implementations
│   ├── utils/           Cross-cutting utilities
│   └── __tests__/       Jest suites (jsdom for client, node for core)
├── packages/core/       Multi-module (ESM/CJS) TS distribution package
├── mcop_package/        Python implementation (mycelial reasoning, Higgsfield)
├── docs/                Long-form architecture + protocol docs
├── examples/            Runnable adapter examples
├── public/              Static assets, robots.txt, llms.txt, og-image
├── scripts/             eco-audit, parity-guardian, triad-fingerprint
├── .github/workflows/   CI: lint, typecheck, test, security, codeql
├── .agents/skills/      Reproducible Devin/agent procedures
└── .jules/              Architectural sentinel logs
```

---

## 🔁 Local workflows by surface

### Frontend (Next.js + React 19)

Anything in `src/app/` (RSC + routes) and `src/components/` (client). The
canonical proof of correctness for client components is the jest suite under
`src/__tests__/`. Hydration is exercised via `testEnvironment: "jsdom"`.

- Always wrap state writes triggered by external streams (vitals, layout
  shifts, web sockets) in `useTransition` so React can interrupt the
  reconcile when the user interacts. INP must stay under 200ms.
- High-frequency input streams (text fields, vitals) should be debounced
  via `useDebouncedValue` (300ms default) before display.
- Honour `prefers-reduced-motion`: use the `useReducedMotion` hook to gate
  animation amplitude, announcement frequency, and any motion-driven UX.

### Triad core (TypeScript)

`src/core/` and `packages/core/`. Determinism is the only acceptance criterion
that matters here — every public function must be a pure transformation of
its inputs.

- Mutations must hash into the Merkle chain so the audit ring catches drift.
- Avoid `Math.random()`; use the seeded RNG facilities in `src/utils/`.
- Run `pnpm parity:check` before opening a PR that touches encoder weights,
  resonance scoring, or etch accumulation.

### Python (`mcop_package/`)

Mycelial reasoning network and the Higgsfield adapter. Tests use `pytest`.

```bash
source .venv/bin/activate
pip install -e mcop_package[dev]
pytest mcop_package/tests
ruff check mcop_package
mypy mcop_package
```

---

## ✅ Coding standards

### TypeScript / React

- **Strict TS only** — `tsconfig.json` enables `strict`, `noImplicitAny`,
  `noUncheckedIndexedAccess`. Do not silence with `any`, `as unknown as T`,
  `getattr`/`setattr`-style indirection, or `// @ts-expect-error` without a
  linked issue.
- Explicit return types on exported functions/components.
- Functional components only; no class components.
- Co-locate small helpers; lift to `src/utils/` once shared.
- Imports ordered: external → `@/*` aliases → relative → CSS.
- File header comments document **why**, not **what**. Inline comments are
  reserved for non-obvious invariants.
- Keep components under ~250 lines. Split when a single component grows
  more than two distinct concerns.

### CSS / Tailwind

- Tailwind utility classes by default. Custom CSS only for global rules
  (typography, motion preferences, containment) under `src/app/globals.css`.
- Honour `prefers-reduced-motion: reduce` — `globals.css` ships a global
  short-circuit; component-level animations must not bypass it.
- Avoid arbitrary z-index values; the HUD owns z-40.

### Python

- `ruff` for lint/format (line length 100), `mypy --strict` for typing.
- Follow PEP 8 + PEP 257 docstrings; prefer dataclasses over dicts for
  internal records.

### Accessibility (WCAG 2.2 AA target)

- Every interactive control must be keyboard reachable, with a visible
  `focus-visible` ring on dark backgrounds.
- Live regions (`role="status"`, `aria-live="polite"`) for any
  non-modal status change. Throttle announcements so SR users are not
  spammed during state storms.
- Use semantic landmarks (`<main>`, `<nav>`, `<section>` with
  `aria-labelledby`).
- Decorative imagery must use `alt=""` and `role="presentation"`.
- Reserve box dimensions for any async-loaded media to keep CLS below 0.1.

---

## 🧪 Testing requirements

- **Every behaviour change ships with a test.** No exceptions for "trivial"
  fixes — most regressions come from the trivial-looking ones.
- Jest suites must run fully under `jsdom` for client components and `node`
  for core kernels. Do not introduce real network calls; mock at the
  fetch/SDK boundary.
- Maintain a green `pnpm test`, `pnpm lint`, `pnpm typecheck` before
  requesting review. CI enforces all three with `--max-warnings 0`.
- For performance-critical paths (encoder hot loops, resonance scoring),
  add a micro-benchmark or an O(n) reasoning paragraph in the PR body.

### Browser testing constraints (Next.js 16 + Turbopack)

The framework deliberately accepts a **jsdom + SSR HTML inspection** path as
the canonical proof-of-correctness for client components. Live-Chrome
hydration is currently blocked by a Next.js 16 / Turbopack runtime-chunk
issue (`Error: Connection closed` from
`/_next/static/chunks/<hash>.js` on Devin VMs and similar headless CI
environments — both `next start` and the standalone `node .next/standalone/server.js`
entrypoint are affected). React therefore never hydrates and no client
component mounts in those environments. **This reproduces on `main` with no
local changes**, so before assuming a PR broke something, verify the same
hydration error appears on `main`.

The accepted substitute for headless-browser testing is:

1. **Jest under `jsdom`** — the canonical client-component test environment;
   every spec runs against the real React 19 reconciler.
2. **SSR HTML inspection** — `curl http://localhost:3000/ | grep -c '<selector>'`
   proves what the browser will paint *first* (the LCP-relevant surface),
   which is exactly what every Core Web Vitals optimisation targets.
3. **Static source checks** — assert behavioural guarantees structurally
   (e.g. "this file imports X and contains zero `new PerformanceObserver(...)`").

The `Performance HUD` exposes a `Test Mode` badge at runtime so reviewers
can tell at a glance whether a screenshot reflects SSR / jsdom output (`SSR`)
or a real browser session (`Live`). See
[`src/components/PerformanceHUD.tsx`](./src/components/PerformanceHUD.tsx).

### Automated SSR validation

Every PR that touches LCP-critical surfaces (the hero accent, font preloads,
or the `<head>` shape) MUST keep `scripts/verify-ssr-lcp.mjs` green. The
script fetches the SSR HTML of the production server and asserts the LCP
preload contract via the shared `verifyLCPPreload` utility in
`src/core/testing-utils.ts`:

- `fetchPriority="high"` appears exactly **2** times in the SSR HTML —
  once on the hero `<img>`, once on the matching
  `<link rel="preload" as="image" href="/og-image.svg" fetchPriority="high">`
  that React 19 auto-emits for any image rendered with `fetchPriority="high"`
  during the server pass (see the
  [React docs](https://react.dev/reference/react-dom/components/img#preloading-an-image-with-fetchpriority)).
- The preload `<link>` and `<img>` both reference the same `href` / `src`.

Run it locally against a built standalone server:

```bash
pnpm build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
PORT=3000 node .next/standalone/server.js &
sleep 3
node scripts/verify-ssr-lcp.mjs
# PASS — LCP preload contract satisfied.
```

The same `verifyLCPPreload` utility is reusable from any jest spec that has
already produced markup via `react-dom/server`:

```ts
import { renderToString } from "react-dom/server";
import { verifyLCPPreload } from "@/core/testing-utils";

const html = renderToString(<RootLayout><Page /></RootLayout>);
expect(verifyLCPPreload(html).passed).toBe(true);
```

### Cypress E2E (exploratory live-browser layer)

The repo ships an optional **Cypress** layer that drives the standalone
production server (`node .next/standalone/server.js`) in a real browser.
It is **additive** — the jest + jsdom + SSR HTML inspection path remains
the canonical correctness gate. Cypress is wired as a **non-blocking
exploratory CI signal** (`continue-on-error: true` in
`.github/workflows/cypress.yml`) because the Next.js 16 hydration block
described above empirically reproduces in headless Chrome against the
standalone build too, not just the Turbopack dev server. Whether real
GitHub Actions runners hit the same constraint is the open question
that signal is meant to answer.

The two specs encode contract assertions, not visual snapshots:

- `cypress/e2e/performance-hud.cy.ts` — toggle button ARIA wiring, panel
  open/close, three Core Web Vitals rows, the `Test Mode` badge resolves
  to `live` against real Chrome, `Escape` closes the panel, `Alt+P`
  re-opens it.
- `cypress/e2e/self-verifying-vitals.cy.ts` — uses the Performance HUD
  itself as the test oracle. Reads each metric's `aria-label`, parses
  the formatted value back into a number, and asserts both the parsed
  value and the rendered `good | needs-improvement | poor` status
  against the published Core Web Vitals budgets. A status that drifts
  from the underlying value cannot pass this spec.

Local reproduction:

```bash
pnpm build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
PORT=3000 node .next/standalone/server.js &
pnpm cypress:run
```

Hybrid invocation (jest + Cypress + optional Playwright):

```bash
# Concurrent (developer ergonomics)
pnpm test:hybrid
# Sequential (CI fallback)
pnpm test:ci
# Opt into Playwright once it is added
PLAYWRIGHT_ENABLED=1 pnpm test:hybrid
```

The strategy is documented end-to-end in
[`docs/adr/2026-04-25-testing-strategy.md`](./docs/adr/2026-04-25-testing-strategy.md).

---

## 📦 Changesets and release flow

The framework uses [Changesets](https://github.com/changesets/changesets)
to manage versioning across the Next.js app, the published
`@kuonirad/mcop-framework` package, and the Python distribution.

1. After making user-visible changes, run:

   ```bash
   pnpm changeset
   ```

   Select the affected packages, choose the SemVer bump (`patch` / `minor`
   / `major`), and write a short, end-user-readable summary. Avoid
   internal jargon — this prose ships in the changelog.

2. Commit the generated `.changeset/*.md` file alongside your code changes.

3. CI verifies that any PR touching publishable code includes a changeset
   entry (or an explicit `--empty` marker for refactors / docs-only
   changes).

4. On merge to `main`, a release PR is opened by the changesets bot. It
   batches accumulated entries, bumps versions, regenerates `CHANGELOG.md`,
   and — once approved — publishes to the GitHub Package Registry under
   `@kuonirad/mcop-framework`.

5. Python releases are coordinated manually via
   `mcop_package/pyproject.toml` until the changesets-python bridge lands.

> **Refactors and docs-only PRs**: still run `pnpm changeset --empty` so the
> CI gate has an explicit signal that the omission was intentional.

---

## 📋 Pull request checklist

Before requesting review:

- [ ] Branch from `main` using a descriptive prefix:
      `feature/<topic>`, `bugfix/<topic>`, `docs/<topic>`,
      `chore/<topic>`, `perf/<topic>`.
- [ ] `pnpm lint` passes with zero warnings.
- [ ] `pnpm typecheck` passes (strict TS, no `any` introductions).
- [ ] `pnpm test` passes; new behaviour is covered.
- [ ] `pnpm changeset` entry committed (or `--empty` for refactors).
- [ ] PR description follows: **Context → Change → Validation → Risk**.
- [ ] Documentation updated for any user-visible behaviour change
      (README / ARCHITECTURE / docs/adapters/*.md).
- [ ] Screenshots / recordings attached for UI changes.
- [ ] No secrets, tokens, or `.env` files staged.
- [ ] No `--no-verify`, `--no-gpg-sign`, or amended public commits.

Reviewers verify:

- Tests pass and code is typed/linters clean.
- Security posture is unchanged or improved (no secrets, pinned actions).
- Documentation matches behavior.
- Performance-sensitive code paths are benchmarked or reasoned about.
- Provenance: PR links related issues/discussions, commit messages explain
  the *why*.

---

## 🚦 Merging and production deployment

The `main` branch is protected by **two independent gates**: standard
GitHub branch protection (CI checks must pass) **and** a GitHub
*Environments*-based deployment requirement. Both must be satisfied
before a PR can merge.

### What you will see on a freshly opened PR

Even with every required CI check green, GitHub will display:

> ⚠️ **Merging is blocked**
> Missing successful active production deployment.

This is **not** a CI failure. It is the deployment-environment gate
attached to `main` via repo settings → *Environments* → `production`.
The gate is configured in GitHub's UI rather than in any
`.github/workflows/*.yml` file, so you will not find a triggering
workflow by grepping the repo.

### How the gate is satisfied

A maintainer with access to the `production` environment triggers a
deployment against the PR's head commit (typically by approving the
GitHub Environments review request, or by re-running the deployment
workflow in the maintainer's separate publish pipeline). Once that
deployment is recorded as `success`, the merge button unblocks.

For regular contributors:

- Make sure every required CI check is green (`build`, `test`,
  `Cypress against standalone production server`, `Analyze` (CodeQL,
  both languages), `Python package tests`, `npm package`,
  `test-malicious-load`, `trojan-source-scan`, `update_release_draft`).
- Address any review-bot comments (Devin Review, CodeQL, Dependabot).
- Then **ping a maintainer** in the PR thread asking for the
  production-environment deployment to be triggered. Do not attempt
  to bypass the gate (e.g. by force-pushing or by toggling repo
  settings) — the gate exists to keep the published artifact in
  lock-step with `main`.

### Who has the credentials

- **`@Kuonirad`** holds the `production` environment approval
  permission and the npm/PyPI publish credentials.
- **`@KullAILABS`** is the stewarding org account that the
  release-drafter and the published packages resolve against.

If neither is available, the PR simply waits — there is no fallback
path, by design. Crystalline determinism extends to the supply chain.

### Why this gate exists

The `main` branch is the source of truth for the published
`@kullailabs/mcop-core` (npm) and `mcop-framework` (PyPI) packages,
and for the GitHub Pages mirror at
`https://kuonirad.github.io/KullAILABS-MCOP-Framework-2.0`. Tying
merge to a successful deployment guarantees those public surfaces
never drift behind a green CI but still-broken artifact build.

---

## ✍️ Commit conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <subject>

<body — what + why, wrap at 72 cols>

<footer — refs / breaking-change notes>
```

- **type**: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`,
  `build`, `ci`, `revert`.
- **scope** (optional but encouraged): `hud`, `vsi`, `encoder`, `stigmergy`,
  `etch`, `adapter:magnific`, `adapter:freepik`, `adapter:utopai`, `mcop`, `seo`, `a11y`,
  `monorepo`, `release`.
- **subject**: imperative, ≤ 72 chars, no trailing period.

Examples:

```
feat(hud): add 300ms debounced metric display

The Performance HUD was reconciling on every CLS sub-tick during a
shift storm. Wrapping the displayed sample state in `useDebouncedValue`
coalesces the trailing edge into a single transition-wrapped commit,
restoring the INP-safe budget.

Refs #312
```

```
fix(stigmergy): bound circular buffer reads to active capacity
```

---

## 🔒 Security and supply chain

- Never commit credentials, API keys, or `.env` files. The CI security
  suite scans for these patterns.
- Pin all GitHub Actions to a SHA, not a tag.
- Direct dependency upgrades go through `pnpm deps:check` first; any
  moderate+ advisory must be triaged in the PR body.
- Reproduce supply-chain reports against `pnpm audit --audit-level=moderate`
  before claiming "no impact".

See [SECURITY.md](./SECURITY.md) for the responsible-disclosure process.

### Verifying the Sigstore provenance on `@kullailabs/mcop-core`

Both registry uploads use **OIDC-only trusted publishing** — no long-lived
tokens are stored anywhere. Every release is signed by Sigstore's keyless
signing pipeline (Fulcio short-lived cert → Rekor transparency log) and
ships a [SLSA v1.0](https://slsa.dev/spec/v1.0/provenance) build provenance
attestation that cryptographically binds the tarball to:

- The **source repository** — `Kuonirad/KullAILABS-MCOP-Framework-2.0`.
- The **commit / tag** — e.g. `refs/tags/npm-v0.1.1`.
- The **workflow file** — `.github/workflows/publish-npm.yml`.
- The **GitHub-hosted runner** — `https://github.com/actions/runner/github-hosted`.
- The **specific run id** — e.g. `actions/runs/24964396730/attempts/1`.

Read more about the underlying primitives at
[sigstore.dev/how-it-works](https://www.sigstore.dev/how-it-works).

#### One-liner verification (npm)

```bash
mkdir -p /tmp/audit && cd /tmp/audit
echo '{"name":"audit","version":"0.0.0","private":true,"dependencies":{"@kullailabs/mcop-core":"latest"}}' > package.json
npm install --no-audit --no-fund
npm audit signatures
```

Expected output:

```
1 package has a verified registry signature
1 package has a verified attestation
```

For the full attestation payload (Rekor log entry, inclusion proof,
SLSA provenance, GitHub Actions claims):

```bash
npm audit signatures --json --include-attestations
```

#### Inspecting the SLSA provenance directly

```bash
curl -fsS "https://registry.npmjs.org/-/npm/v1/attestations/@kullailabs%2fmcop-core@LATEST_VERSION" \
  | jq -r '.attestations[] | select(.predicateType=="https://slsa.dev/provenance/v1") | .bundle.dsseEnvelope.payload' \
  | base64 -d \
  | jq '.predicate.buildDefinition.externalParameters.workflow, .predicate.runDetails.metadata.invocationId'
```

This prints the `repository`, `ref`, `path` of the workflow that built the
package, plus the GitHub Actions run URL — exactly the values listed above.
If any of these don't match what you expect (e.g. wrong repo, unsigned tag,
non-`main` branch), do not trust the artifact.

#### PyPI parity

The Python package follows the same pattern: PyPI's Trusted Publishing
issues attestations via the same Sigstore stack. Verify with:

```bash
pip install --require-hashes --upgrade mcop  # honors PyPI's signed metadata
```

or inspect the per-release "Verified" badge on the
[mcop project page](https://pypi.org/project/mcop/).

#### Bootstrap (one-time, completed)

The npm package required a single manual `npm publish` (with a short-lived
`Bypass 2FA` granular token) before Trusted Publishing could attach to it —
npm doesn't support PyPI's "pending publisher" pattern. That bootstrap was
performed on `2026-04-26` for `0.1.0`; from `0.1.1` onward the workflow
publishes via OIDC with no manual step. See
[`packages/core/BOOTSTRAP.md`](./packages/core/BOOTSTRAP.md) for the
historical record.

---

## 📚 Documentation expectations

- Update **README.md** when you add, change, or remove a top-level surface
  (kernel, adapter, public API).
- Update **ARCHITECTURE.md** when triad behaviour or data flow changes.
- Update **`docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md`** when the adapter
  contract version changes; bump the protocol version explicitly.
- Add or extend a `.agents/skills/<topic>/SKILL.md` when you discover a
  reproducible procedure (testing flow, debug recipe) that future
  contributors or agents will need.
- For E-E-A-T parity, ensure new authors are added to the structured-data
  bios in `src/app/page.tsx` *and* to `.all-contributorsrc`.

---

## ❓ Getting help

- **Bugs / requests** → [GitHub Issues](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/issues).
- **Open-ended design discussion** → [GitHub Discussions](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/discussions).
- **Security** → [SECURITY.md](./SECURITY.md).
- **Onboarding playbook** → [CONTRIBUTOR_ONBOARDING.md](./CONTRIBUTOR_ONBOARDING.md).

Maintainers watch all three channels.

---

## ⚖️ Licensing and Contributions

As of 2026-04-26, this project is licensed under the **Business Source License 1.1**. By contributing to this repository, you agree that your contributions will be licensed under the same terms.

By submitting a contribution you also grant **Kevin John Kull** (the sole licensor of record, GitHub `@Kuonirad`) a perpetual, irrevocable right to relicense your contribution under the Change License — currently the MIT License — on the BUSL Change Date (`2030-04-26`) documented in [`NOTICE.md`](./NOTICE.md), so that the eventual MIT transition does not require per-contributor outreach.

### Developer Certificate of Origin (DCO)

To ensure clear provenance and licensing authority, we require all contributors to certify their changes via the **Developer Certificate of Origin (DCO)**. This is the same mechanism used by the Linux Kernel and many other major projects.

By adding a `Signed-off-by` line to your commit message, you certify the following:

> Developer Certificate of Origin
> Version 1.1
>
> Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
>
> Everyone is permitted to copy and distribute verbatim copies of this
> license document, but changing it is not allowed.
>
> Developer's Certificate of Origin 1.1
>
> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I
>     have the right to submit it under the open source license
>     indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best
>     of my knowledge, is covered under an appropriate open source
>     license and I have the right under that license to submit that
>     work with modifications, whether created in whole or in part
>     by me, under the same open source license (unless I am
>     permitted to submit under a different license), as indicated
>     in the file; or
>
> (c) The contribution was provided directly to me by some other
>     person who certified (a), (b) or (c) and I have not modified
>     it.
>
> (d) I understand and agree that this project and the contribution
>     are public and that a record of the contribution (including all
>     personal information I submit with it, including my sign-off) is
>     maintained indefinitely and may be redistributed consistent with
>     this project or the open source license(s) involved.

### How to Sign Off

Add the following line to the end of your commit message:

```text
Signed-off-by: Random J Developer <random@developer.example.org>
```

You can automate this by using the `-s` or `--signoff` flag with `git commit`:

```bash
git commit -s -m "Your commit message"
```

### SPDX headers (new files only)

New source files SHOULD start with a single-line SPDX identifier so the
licence is discoverable from the file alone — useful for downstream
licence scanners and for the eventual MIT transition. Use:

```ts
// SPDX-License-Identifier: BUSL-1.1
```

```js
// SPDX-License-Identifier: BUSL-1.1
```

```python
# SPDX-License-Identifier: BUSL-1.1
```

A repo-wide backfill is intentionally **not** required by this protocol —
the canonical licence statement still lives in the top-level `LICENSE`
file. The CI `License Guard` workflow soft-warns when a *newly added*
source file omits the header but does not fail the build for it.
