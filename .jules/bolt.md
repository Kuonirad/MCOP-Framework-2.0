## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.
## 2026-03-19 - Array Iteration and Math.pow Overhead in V8
**Learning:** Using `Array.prototype.reduce` for mathematical operations on vectors/tensors is significantly slower (up to ~5-12x) than standard `for` loops in Node.js (V8) due to function call and closure overhead. Additionally, replacing `Math.pow(val, 2)` with direct multiplication (`val * val`) reduces function allocation overhead.
**Action:** For performance-critical numerical paths, standard `for` loops and direct arithmetic should be preferred over array iteration methods and Math functions.
