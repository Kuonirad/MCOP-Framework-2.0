## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2026-01-17 - [Single-Pass Variance Calculation]
**Learning:** Calculating variance in a single pass using explicit loops ($E[X^2] - (E[X])^2$) was ~13.6x faster than a two-pass `reduce` implementation in V8.
**Action:** Replace statistical `reduce` chains with explicit single-pass loops, ensuring results are clamped (e.g., `Math.max(0, variance)`) to handle floating-point instability.
