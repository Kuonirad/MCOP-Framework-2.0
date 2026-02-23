## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [JSON.stringify vs Binary Hashing]
**Learning:** `JSON.stringify` on large arrays of numbers (e.g., 4096 floats) is extremely slow (~1.5s per op) due to string conversion and allocation. Hashing the binary representation (via `Float64Array`) is ~8x faster (~200ms) and avoids the serialization bottleneck.
**Action:** When hashing large numerical datasets for internal integrity/logging, prefer binary hashing (buffer updates) over JSON serialization, provided that binary compatibility (endianness) is acceptable or managed.
