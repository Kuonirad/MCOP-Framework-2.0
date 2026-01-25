## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-02-21 - [Multiplication vs Division in Normalization Loops]
**Learning:** Replacing repeated division (`v / norm`) with multiplication by inverse (`v * (1/norm)`) yielded a ~4% performance improvement in a tight loop for `NovaNeoEncoder` (4096 dimensions). While V8 is smart, this classic optimization still holds for Float64 operations in large arrays.
**Action:** Always prefer multiplication by inverse for vector normalization loops.
