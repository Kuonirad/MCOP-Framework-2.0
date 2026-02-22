## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Loop Fusion on Standard Arrays]
**Learning:** Fusing array filling and normalization loops for standard JS Arrays (`number[]`) yielded a ~26% speedup (1297ms -> 963ms) compared to separate passes. Since `NovaNeoEncoder` relies on `number[]` for hashing compatibility, reducing array traversals is critical for performance.
**Action:** When working with large standard arrays where TypedArrays cannot be used (e.g., due to serialization constraints), always fuse loops to minimize memory access overhead.
