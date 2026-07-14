/**
 * Version of the deterministic cross-runtime Triad wire/hash contract.
 *
 * This is deliberately independent from the npm package release version:
 * package features may advance without changing canonical tensors or hashes.
 * Keep the `src/core` and `packages/core/src` mirrors byte-for-byte aligned.
 */
export const TRIAD_PROTOCOL_VERSION = '2.4.0' as const;
