# MCOP × Haystack — Integration Guide

> **Status:** Shipped · upstream PR pending
> **TS shim:** `src/integrations/haystack.ts`
> **Python shim:** `mcop_package/mcop/integrations/haystack.py`
> **Phase:** v2.4 — Phase 4 (Ecosystem Integration Deepening)

## What this is

A drop-in Haystack 2.x `DocumentStore` implementation backed by the
MCOP triad. Every `writeDocuments` call funnels through encode → record
→ etch; every `recallByResonance` returns the best-matching document
along with `MCOPProvenance` (etch hash, Merkle root, UUID-v4 trace id,
ISO8601 timestamp).

The TS shim does **not** depend on any Haystack package; the Python
shim does **not** depend on `haystack-ai`. Both can be vendored into
upstream PRs verbatim.

## TypeScript usage

```ts
// Source checkout only; this shim is not a public npm subpath.
import {
  createMCOPHaystackDocumentStore,
  mcopHaystackDocumentFromContent,
} from './src/integrations/haystack';

const store = createMCOPHaystackDocumentStore({ resonanceThreshold: 0.05 });
await store.writeDocuments([
  mcopHaystackDocumentFromContent('alpha document', { tier: 'gold' }),
  mcopHaystackDocumentFromContent('beta document'),
]);

const golds = await store.filterDocuments({ tier: 'gold' });
const hit = await store.recallByResonance('alpha document');
console.log(hit.document?.id, hit.score);
```

## Python usage

```python
from mcop.integrations import (
    create_mcop_haystack_document_store,
    mcop_haystack_document_from_content,
)
from mcop.integrations.triad_harness import MCOPTriadOptions

store = create_mcop_haystack_document_store(
    triad_options=MCOPTriadOptions(resonance_threshold=0.05)
)
store.write_documents([
    mcop_haystack_document_from_content("alpha document", {"tier": "gold"}),
    mcop_haystack_document_from_content("beta document"),
])
print(store.recall_by_resonance("alpha document"))
```

## Surface mapping (Haystack → MCOP)

| Haystack method | MCOP behaviour |
|---|---|
| `count_documents()` | Size of the in-memory store. |
| `write_documents(docs, policy)` | Encode each doc, record + etch, honour the duplicate policy (`overwrite`/`skip`/`fail`). |
| `filter_documents(filters)` | Equality filter over `meta`. |
| `delete_documents(ids)` | Remove documents (Stigmergy chain remains append-only). |
| `recall_by_resonance(query)` | Encode the query, run Stigmergy resonance, return the best-matching document + score. |

## Upstream PR plan

Target: `deepset-ai/haystack`.

### Outline

1. Add `haystack.document_stores.mcop.MCOPDocumentStore` as a
   third-party-imported store.
2. Reference this repo — the shim is self-contained and trivially
   vendorable.
3. Add a parity-checked test fixture proving cross-runtime byte-identity
   of stored Merkle roots for the same input.

### Open issue to file

- `deepset-ai/haystack#new`: "Add MCOP as a built-in
  Merkle-rooted document store with eudaimonic provenance".

## Test coverage

| Layer | File | Cases |
|---|---|---|
| TS | `src/__tests__/integrations.haystack.test.ts` | 12 |
| Py | `mcop_package/tests/test_integrations.py::*haystack*` | 11 |
