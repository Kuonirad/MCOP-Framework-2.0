## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.
## 2024-03-29 - Array.prototype.reduce overhead in mathematical calculations
**Learning:** In performance-critical JavaScript/TypeScript paths (e.g., tensor processing or heavy iterations), replacing array iteration methods like `Array.prototype.reduce()` with native `for` loops yields significant execution speedups (nearly 10x in this case) by eliminating callback allocation and invocation overhead in the V8 engine. Replacing `Math.pow(val, 2)` with direct multiplication (`val * val`) is also a highly effective micro-optimization that reduces function allocation overhead.
**Action:** Always favor native `for` loops over `reduce` / `map` / `forEach` and direct multiplication over `Math.pow` for simple squares in hot paths dealing with large arrays or tensors.
