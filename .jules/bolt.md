## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Object Shape and Property Access in Hot Loops]
**Learning:** Adding an optional property (`invMagnitude`) to a class (`PheromoneTrace`) and checking for it inside a hot loop (O(N*D)) caused a 25% performance degradation, even with the goal of replacing division with multiplication.
**Action:** Avoid adding optional properties or branching logic based on object shape changes inside extremely tight loops. The V8 JIT optimizes stable object shapes and simple arithmetic better than conditional logic with potentially polymorphic objects.
