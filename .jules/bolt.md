## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Array.prototype.reduce and Math.pow Performance on Tensors]
**Learning:** Using `Array.prototype.reduce` and `Math.pow(val, 2)` for mathematical operations (like calculating variance) on large numeric arrays/tensors is significantly slower (e.g., ~5x slower in benchmarks) than standard `for` loops and direct multiplication (`val * val`) in Node.js/V8. The overhead comes from function allocation for the reduce callback and the generalized implementation of `Math.pow`.
**Action:** For performance-critical numerical paths involving arrays or tensors, prefer standard `for` loops and simple multiplication over array iteration methods and `Math.pow(..., 2)`.
