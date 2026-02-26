## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Breaking Changes in Hashing]
**Learning:** Replacing `JSON.stringify` with binary hashing for generating record IDs in `HolographicEtch` was a 6.6x speedup but was rejected as a BREAKING CHANGE because it alters the hash output, potentially invalidating existing data or external contracts.
**Action:** When optimizing hashing or serialization, ensure the output format remains identical unless a breaking change is explicitly authorized and planned for (e.g., with a version bump or migration).

## 2025-12-19 - [Manual Loop Unrolling in V8]
**Learning:** Manual loop unrolling (4x) for dot products in `StigmergyV5` yielded only a marginal ~5% speedup (424ms -> 404ms) over V8's optimization of simple `for` loops. V8 is already highly efficient at vectorizing/unrolling simple numeric loops.
**Action:** Use manual loop unrolling only when profiling shows a clear bottleneck or when loop overhead is significant. However, centralizing the logic in a `dotProduct` helper improves maintainability regardless of performance.
