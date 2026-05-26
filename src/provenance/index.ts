/**
 * Provenance primitives: the RFC 6962 Merkle tree, the Merkle-rooted
 * model manifest, and Proof-of-Useful-Work receipts.
 *
 * These power the CUDA productionization integrity story — every shipped
 * ONNX kernel is pinned by `model_id = SHA-256(model bytes)` into a
 * Merkle-rooted manifest, and accelerated runs can emit PoUW receipts
 * whose Merkle proof a verifier checks against an on-chain anchored root.
 */

export * from './merkleTree';
export * from './modelManifest';
export * from './pouwReceipt';
