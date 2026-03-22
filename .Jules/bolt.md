## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Math loops overhead in V8]
**Learning:** Using `Array.prototype.reduce` with `Math.pow(diff, 2)` for mathematical operations (like calculating variance) is ~4x slower than standard `for` loops with `diff * diff` in Node.js (V8) due to function call allocation and closure overhead.
**Action:** Replace functional array methods like `reduce` with simple `for` loops, and use multiplication `x * x` instead of `Math.pow(x, 2)`, in performance-critical numerical paths.
