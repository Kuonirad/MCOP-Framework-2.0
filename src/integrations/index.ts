/**
 * Ecosystem integration shims for MCOP Framework 2.0.
 *
 * Each shim is **upstream-PR-ready** — it implements the upstream
 * library's protocol shape (LangChain `BaseChatMessageHistory`,
 * LlamaIndex `BaseVectorStore`, Haystack 2.x `DocumentStore`) without
 * taking a runtime dependency on the upstream library. So you can:
 *
 *   1. Drop the shim into a project that already imports the upstream
 *      library — it satisfies the protocol shape, your chain "just works"
 *      with MCOP backing it.
 *   2. Use the shim as the basis for an upstream PR contributing MCOP as
 *      a first-class memory layer to LangChain / LlamaIndex / Haystack.
 *
 * The triad backing every shim is the deterministic NOVA-NEO + Stigmergy
 * v5 + Holographic Etch core — so an integration adopter inherits
 * Merkle-rooted provenance, byte-identity-reproducible recall, and the
 * 4.4 ms / 22,700 ops/sec budget envelope that the v2.4 reproducible
 * benchmark badge attests to.
 */

export * from './triadHarness';
export * from './langchain';
export * from './llamaIndex';
export * from './haystack';
