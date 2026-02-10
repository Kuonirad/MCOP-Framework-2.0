## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Multiplication vs Division Micro-optimization Surprise]
**Learning:** Replacing `dot / (A * B)` with `dot * (1/A) * (1/B)` (using cached inverses) in the `StigmergyV5` hot loop resulted in a ~10-20% slowdown (4.0ms -> 5.3ms) in V8 (Node 22), despite theoretical instruction cost savings. This might be due to increased property access overhead, object shape complexity, or V8's efficient handling of the original division.
**Action:** Always benchmark micro-optimizations like instruction replacement. V8's JIT is often smarter or differently optimized than simple cycle counting suggests.

## 2025-12-19 - [GitHub Action SHA Verification]
**Learning:** An outdated/missing SHA `507695404364bd5b5d159487a4f94a83b603570c` for `actions/upload-artifact` caused a CI pipeline failure (`An action could not be found at the URI`).
**Action:** Always verify GitHub Action SHAs against tags using `git ls-remote --tags <repo_url>` before pinning them in workflows. Never assume a SHA is valid without checking.

## 2025-12-19 - [Lockfile Drift Causing Missing Binaries in CI]
**Learning:** A drift between `package.json`, `package-lock.json`, and `pnpm-lock.yaml` caused `npm ci` in CI to install a different tree than `pnpm install` locally, resulting in missing binaries (like `eslint`) and `exit code 127` errors. This happened because `npm ci` strictly follows `package-lock.json`, which was outdated relative to the pnpm-driven development environment.
**Action:** Always ensure `package-lock.json` and `pnpm-lock.yaml` are synchronized before pushing, especially when CI uses `npm ci` but development uses `pnpm`. Use `pnpm install` to update pnpm's lockfile, and `npm install --package-lock-only` to sync npm's lockfile.

## 2025-12-19 - [CI Workflow Workspace Cleaning]
**Learning:** `actions/checkout` defaults to `clean: true`. Invoking it *mid-job* (e.g., explicitly or inside a composite action like `setup-project`) after dependency installation deletes `node_modules`, causing subsequent steps like `npm run lint` to fail with missing binaries.
**Action:** Design workflows to checkout code *once* at the start. If using composite actions that might checkout, ensure they are called before expensive setup steps, or verify their inputs. Avoid redundant checkouts.
