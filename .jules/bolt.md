## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Loop Unrolling in V8]
**Learning:** Even with V8's advanced JIT, manual 4x loop unrolling on simple arithmetic loops (like dot products) yielded a ~24% speedup (426ms -> 325ms). This suggests that for tight computational kernels, breaking dependency chains to enable Instruction Level Parallelism (ILP) is still effective.
**Action:** Consider loop unrolling for high-frequency numerical loops, but verify with benchmarks as results can vary by engine version.
