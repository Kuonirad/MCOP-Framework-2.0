## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.reduce vs For Loop Performance]
**Learning:** In performance-critical JavaScript/TypeScript paths (like tensor variance calculation), `Array.prototype.reduce()` combined with `Math.pow()` incurs massive overhead compared to native `for` loops and simple multiplication (`val * val`). This is primarily due to the constant allocation and invocation of callback functions in V8.
**Action:** When iterating over large arrays in hot paths, default to native `for` loops and basic arithmetic operators over functional array methods and built-in Math functions.
