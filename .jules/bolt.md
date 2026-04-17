## 2025-12-19 - [Pino Logger Payload Overhead]
**Learning:** Pino logger calls (e.g., `logger.debug`) evaluate their arguments even when the log level is disabled. This causes significant performance overhead if the arguments involve expensive computations like `JSON.stringify` or hashing.
**Action:** Always wrap expensive log payloads in `if (logger.isLevelEnabled('level'))` to ensure they are lazily evaluated.

## 2025-12-19 - [Array.prototype.copyWithin Performance on Holey Arrays]
**Learning:** Using `copyWithin` on an array initialized with `new Array(n)` (holey) was 10x slower than a simple assignment loop in V8 (Node.js 22). This is likely due to de-optimization or the overhead of handling holey arrays in the implementation of `copyWithin`.
**Action:** Prefer simple assignment loops over `copyWithin` for filling new arrays, or verify performance with benchmarks. V8 optimizes simple loops heavily.

## 2025-12-19 - [Array.prototype.reduce Overhead in Tight Loops]
**Learning:** Using `Array.prototype.reduce` for simple numerical calculations (like mean and variance) introduces significant overhead compared to native `for` loops (e.g., 511ms vs 49ms in micro-benchmarks). This is due to the function call overhead for every element.
**Action:** When performing calculations on large arrays or tensors, especially in hot paths, prefer native `for` loops and inline calculations (like `diff * diff` instead of `Math.pow`) to maximize JS engine optimization.

## 2025-12-19 - [JSON.stringify Performance Overhead on Tensors for Crypto Hashing]
**Learning:** Using `JSON.stringify` to serialize large arrays or `ContextTensor` directly into `crypto.createHash('sha256').update()` adds significant overhead and CPU cost in Node.js. Benchmarks showed converting large context tensors natively via `JSON.stringify` was ~7x slower than directly processing numerical buffers.
**Action:** When calculating cryptographic hashes for objects containing large mathematical tensors/arrays, extract the arrays, construct a `Float64Array`, and run `hash.update(new Float64Array(tensor))` directly, while continuing to `JSON.stringify` only the non-array scalars or metadata.

## 2025-12-19 - [Single-Pass Variance Calculation for Large Tensors]
**Learning:** Calculating variance on large tensors by calculating the mean in one pass and the squared differences in a second pass adds unnecessary overhead due to traversing the array twice.
**Action:** When calculating variance or entropy over large arrays, prefer a single-pass loop that accumulates both the sum of absolute values (`sumAbs`) and the sum of squares (`sumSq`), and then compute the variance analytically using `Var(X) = E[X^2] - (E[X])^2`. This reduced execution time by approximately 50% in `estimateEntropy`.
