## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2026-03-28 - Optimizing tensor entropy estimation
**Learning:** In performance-critical JavaScript/TypeScript paths involving tensor processing, replacing array iteration methods like `Array.prototype.reduce()` with native `for` loops and replacing `Math.pow(val, 2)` with direct multiplication (`val * val`) yields significant execution speedups (~80% faster) by eliminating callback allocation and invocation overhead in the V8 engine.
**Action:** Always prefer native `for` loops and direct mathematical operations over array helper methods and complex Math functions in high-frequency numerical computing paths.
