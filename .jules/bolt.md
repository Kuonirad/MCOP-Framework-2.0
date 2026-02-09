## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Fused Loop Optimization in NovaNeoEncoder]
**Learning:** Fusing array filling and normalization loops for `normalize: true` yielded a ~28% performance improvement (39.5k to 50.8k ops/sec). Previous memory suggested ~43%, indicating machine variance, but the gain is consistently significant.
**Action:** When normalizing large vectors, calculate the inverse norm upfront and fuse the normalization multiplication into the filling loop to save a full array traversal.
