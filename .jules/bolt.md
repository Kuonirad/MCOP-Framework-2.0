## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2024-03-26 - Optimized estimateEntropy in NovaNeoEncoder
**Learning:** The V8 engine has significant overhead when using array iteration methods like `reduce` with callbacks, especially in performance-critical areas like tensor processing. Furthermore, `Math.pow(val, 2)` incurs unnecessary function allocation overhead compared to direct multiplication (`val * val`).
**Action:** Replace `Array.prototype.reduce` with native `for` loops and `Math.pow(val, 2)` with direct multiplication (`val * val`) for heavy iteration paths.
