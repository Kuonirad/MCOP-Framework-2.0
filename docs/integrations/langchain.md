# MCOP × LangChain — Integration Guide

> **Status:** Shipped · upstream PR pending
> **TS shim:** `src/integrations/langchain.ts`
> **Python shim:** `mcop_package/mcop/integrations/langchain.py`
> **Phase:** v2.4 — Phase 4 (Ecosystem Integration Deepening)

## What this is

A drop-in `BaseChatMessageHistory` (LangChain's modern message-history
protocol) that funnels every recorded message through the MCOP triad
**without taking a runtime dependency on `langchain` / `@langchain/core`**.

Behind the protocol shape, every `addMessages` call:

1. Encodes the message content with the deterministic **NOVA-NEO**
   encoder.
2. Records a Stigmergy v5 trace, extending the per-session Merkle chain.
3. Etches a Holographic Etch confidence delta over the
   (context, synthesis) pair.
4. Returns a Merkle-rooted `MCOPProvenance` block — SHA-256 etch hash +
   Merkle root + UUID-v4 trace id + ISO8601 timestamp — that the host
   chain can persist or audit later.

## TypeScript usage

```ts
// Source checkout only; this shim is not a public npm subpath.
import { createMCOPLangChainMemory } from './src/integrations/langchain';

const memory = createMCOPLangChainMemory({ sessionId: 'agent-007' });
await memory.addMessages([
  { type: 'human', content: 'who is paul atreides' },
  { type: 'ai', content: 'a deterministic resonance lattice' },
]);

const recent = await memory.getMessages();
console.log(recent[0].provenance?.merkleRoot);
//=> "f3c1e7…"   ←  byte-identical with mcop_package Python shim

const hit = await memory.recallByResonance('who is paul atreides');
console.log(hit.score, hit.message?.content);
```

## Python usage

```python
from mcop.integrations import (
    BaseLangChainMessage,
    create_mcop_langchain_memory,
)

memory = create_mcop_langchain_memory(session_id="agent-007")
memory.add_messages([
    BaseLangChainMessage(type="human", content="who is paul atreides"),
    BaseLangChainMessage(type="ai", content="a deterministic resonance lattice"),
])
print(memory.get_messages()[0].provenance.merkle_root)
```

## Cross-runtime forensic equivalence

The TS and Python shims share the same RFC 8785 canonical-JSON Merkle
chain. So a message recorded through the TypeScript shim and a message
recorded through the Python shim produce **byte-identical etch hashes**
when the inputs (text, metadata, parent hash) are identical.

This is the same parity guardrail that `tests/parity/` enforces for the
deterministic benchmark snapshot.

## Upstream PR plan

Target: `langchain-ai/langchain` and `langchain-ai/langchainjs`.

### Outline

1. Add `langchain.memory.MCOPMemory` (Python) and
   `@langchain/core/memory/MCOPMemory` (TS) as a third-party-imported
   memory implementation.
2. Reference this repo as the source of truth (the shim file is
   intentionally self-contained — it can be vendored verbatim into the
   PR).
3. Add a parity-checked test fixture proving cross-runtime
   byte-identity.

### Open issues to file

- `langchain-ai/langchainjs#new`: "Add MCOP as a built-in memory layer
  with Merkle-rooted provenance".
- `langchain-ai/langchain#new`: "Python sibling of the MCOP memory
  layer (parity-checked)".

Both issues should link this guide and the reproducible benchmark
[badge](../badges/reproducible-benchmark.svg).

## Test coverage

| Layer | File | Cases |
|---|---|---|
| TS | `src/__tests__/integrations.langchain.test.ts` | 9 |
| Py | `mcop_package/tests/test_integrations.py::*langchain*` | 8 |
