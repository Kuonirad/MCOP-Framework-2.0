## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Fused Loops & Inverse Multiplication]
**Learning:** Fusing array filling and normalization loops in `NovaNeoEncoder`, combined with analytic sum-of-squares and inverse multiplication, yielded a ~64% performance improvement (1108ms vs 400ms for 50k iterations @ 4096 dimensions). Separation of loops caused unnecessary O(N) iteration overhead.
**Action:** When filling and normalizing large arrays, perform normalization on-the-fly if the norm can be pre-calculated analytically, and prefer multiplication by inverse (`* (1/norm)`) over division.
