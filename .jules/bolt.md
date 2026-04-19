## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Array reduce and Math.pow overhead]
**Learning:** Array iteration methods like `reduce` allocate callbacks and incur overhead, while `Math.pow` has higher allocation overhead than direct multiplication. This can cause significant overhead in performance-critical calculation paths.
**Action:** Replace `Array.prototype.reduce()` and `Math.pow()` with native `for` loops and direct multiplication (`val * val`) for execution speedups in hot paths.
## 2025-12-19 - [Array.prototype.reduce Overhead in Tight Loops]
**Learning:** Using `Array.prototype.reduce` for simple numerical calculations (like mean and variance) introduces significant overhead compared to native `for` loops (e.g., 511ms vs 49ms in micro-benchmarks). This is due to the function call overhead for every element.
**Action:** When performing calculations on large arrays or tensors, especially in hot paths, prefer native `for` loops and inline calculations (like `diff * diff` instead of `Math.pow`) to maximize JS engine optimization.