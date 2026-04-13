## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Redundant CI Setup Steps Overwrite Environment]
**Learning:** In GitHub Actions workflows, multiple duplicated executions of setup steps like `actions/checkout` or local composite actions (`.github/actions/setup-project`) can overwrite the environment PATH and clear the workspace state, causing subsequent commands (e.g., `npm run lint`) to fail with exit codes like 127 (`eslint: not found`) even if dependencies were successfully installed in a prior step.
**Action:** Always ensure each job contains exactly one sequence of repository checkout and environment setup to maintain workspace consistency.

## 2025-12-19 - [Conditionally Skipping Steps for Incompatible Environments]
**Learning:** Next.js >= 15 requires Node.js >= 20.9.0. When executing a CI `test` job matrix across multiple Node versions, removing older versions like `18.x` from the matrix to "fix" `next build` failures reduces test coverage significantly.
**Action:** Instead of removing incompatible Node versions from the testing matrix, explicitly conditionally skip only the incompatible steps (e.g., `if: matrix.node-version != '18.x'` on the build step) so that standard unit tests can continue to execute and maintain coverage on older environments.
