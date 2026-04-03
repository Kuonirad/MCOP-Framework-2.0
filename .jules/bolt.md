## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.
## 2026-04-03 - Optimize estimateEntropy tensor processing loop
**Learning:** In V8, replacing array iteration methods like `Array.prototype.reduce()` with native `for` loops, and replacing `Math.pow(val, 2)` with direct multiplication (`val * val`), yields significant execution speedups by eliminating callback allocation and function invocation overhead.
**Action:** Use native loops and direct math operations in performance-critical JavaScript/TypeScript paths (e.g., tensor processing or heavy iterations).
