## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Mathematical Array Operations in V8]
**Learning:** Using `Array.prototype.reduce` and `Math.pow(x, 2)` for mathematical operations on vectors/tensors is significantly slower (up to ~12x) than standard `for` loops and direct multiplication in Node.js (V8) due to function call and closure overhead.
**Action:** For performance-critical numerical paths, prefer standard `for` loops and direct mathematical operations over array iteration methods.
