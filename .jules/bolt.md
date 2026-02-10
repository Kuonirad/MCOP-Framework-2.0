## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Multiplication vs Division Micro-optimization Surprise]
**Learning:** Replacing `dot / (A * B)` with `dot * (1/A) * (1/B)` (using cached inverses) in the `StigmergyV5` hot loop resulted in a ~10-20% slowdown (4.0ms -> 5.3ms) in V8 (Node 22), despite theoretical instruction cost savings. This might be due to increased property access overhead, object shape complexity, or V8's efficient handling of the original division.
**Action:** Always benchmark micro-optimizations like instruction replacement. V8's JIT is often smarter or differently optimized than simple cycle counting suggests.
