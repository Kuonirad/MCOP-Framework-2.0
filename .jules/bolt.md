## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Math.abs vs Manual Ternary Optimization in V8]
**Learning:** In modern V8 environments (like Node.js 22+), attempting to optimize `Math.abs(val)` by replacing it with a manual ternary check (`val < 0 ? -val : val`) actually resulted in a massive performance regression (~3x slower). V8 heavily optimizes built-ins like `Math.abs`, and manual reimplementations can defeat these optimizations or cause deoptimizations in tight loops.
**Action:** Trust V8's optimization of standard `Math` functions like `Math.abs` instead of trying to micro-optimize them with manual logic. Always benchmark micro-optimizations in the target runtime environment before committing them.
