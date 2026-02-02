## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [NovaNeoEncoder Loop Fusion]
**Learning:** Fusing the array filling and normalization loops in `NovaNeoEncoder` combined with using `val * (1/norm)` instead of `val / norm` yielded a ~40% performance improvement (624ms vs 1091ms for 50k iterations). V8 optimizes the single pass and multiplication better than separate passes and division.
**Action:** When filling and normalizing large arrays, pre-calculate the inverse norm and apply it during the filling loop to avoid a second pass and expensive division operations.
