# MCOP × LlamaIndex — Integration Guide

> **Status:** Shipped · upstream PR pending
> **TS shim:** `src/integrations/llamaIndex.ts`
> **Python shim:** `mcop_package/mcop/integrations/llamaindex.py`
> **Phase:** v2.4 — Phase 4 (Ecosystem Integration Deepening)

## What this is

A drop-in LlamaIndex `BaseVectorStore` implementation backed by the
MCOP triad. Every `add` call funnels through encode → record → etch;
every `query` runs a Stigmergy resonance scan and returns the matching
node along with `MCOPProvenance` (etch hash, Merkle root, UUID-v4 trace
id, ISO8601 timestamp).

The TS shim does **not** depend on `llamaindex`; the Python shim does
**not** depend on `llama_index`. Both can be vendored into upstream PRs
verbatim.

## TypeScript usage

```ts
// Source checkout only; this shim is not a public npm subpath.
import {
  createMCOPLlamaIndexVectorStore,
  mcopLlamaIndexNodeFromText,
} from './src/integrations/llamaIndex';

const store = createMCOPLlamaIndexVectorStore({ resonanceThreshold: 0.05 });
await store.add([
  mcopLlamaIndexNodeFromText('the nova-neo encoder is deterministic'),
  mcopLlamaIndexNodeFromText('the holographic etch is rank-1'),
]);
const result = await store.query({ queryStr: 'rank-1 etch', similarityTopK: 1 });
console.log(result.ids[0], result.similarities[0], result.nodes[0].provenance?.merkleRoot);
```

## Python usage

```python
from mcop.integrations import (
    MCOPLlamaIndexQuery,
    create_mcop_llamaindex_vector_store,
    mcop_llamaindex_node_from_text,
)
from mcop.integrations.triad_harness import MCOPTriadOptions

store = create_mcop_llamaindex_vector_store(
    triad_options=MCOPTriadOptions(resonance_threshold=0.05)
)
store.add([
    mcop_llamaindex_node_from_text("the nova-neo encoder is deterministic"),
    mcop_llamaindex_node_from_text("the holographic etch is rank-1"),
])
result = store.query(
    MCOPLlamaIndexQuery(query_str="rank-1 etch", similarity_top_k=1)
)
print(result.ids[0], result.similarities[0])
```

## Surface mapping (LlamaIndex → MCOP)

| LlamaIndex method | MCOP behaviour |
|---|---|
| `add(nodes)` | Encode each node's text, record into Stigmergy, etch into Holographic Etch. Return node ids. |
| `query(query)` | Encode `query.queryStr`, run resonance against recorded traces, return the best-matching node + similarity. |
| `delete(refDocId)` | Remove the node and its trace mapping. The Stigmergy chain itself is append-only. |
| `persist()` | No-op for the in-memory shim. |

## Upstream PR plan

Target: `run-llama/llama_index` (Python) and `run-llama/LlamaIndexTS`.

### Outline

1. Add `llama_index.vector_stores.mcop.MCOPVectorStore` (Python) and
   the TS sibling.
2. Reference this repo as the source of truth — the shim is
   self-contained.
3. Add a parity-checked test fixture proving cross-runtime
   byte-identity of stored Merkle roots for the same input.

### Open issues to file

- `run-llama/llama_index#new`: "Add MCOP as a built-in
  Merkle-rooted vector store".
- `run-llama/LlamaIndexTS#new`: "TypeScript port of the MCOP vector
  store (parity-checked)".

## Test coverage

| Layer | File | Cases |
|---|---|---|
| TS | `src/__tests__/integrations.llamaIndex.test.ts` | 11 |
| Py | `mcop_package/tests/test_integrations.py::*llamaindex*` | 8 |
