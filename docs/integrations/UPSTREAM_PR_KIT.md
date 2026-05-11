# Upstream PR Kit — v2.4 Phase 4

Ready-to-file PR drafts for the five upstream contributions sequenced in
[`UPSTREAM_SUBMISSION_PLAN.md`](./UPSTREAM_SUBMISSION_PLAN.md). All six
shim files were re-licensed to MIT in commit
[`1376290`](https://github.com/Kuonirad/MCOP-Framework-2.0/commit/1376290)
via the [`LICENSE-MIT-INTEGRATIONS`](../../LICENSE-MIT-INTEGRATIONS)
carve-out, so the upstream projects' license compatibility (MIT for
LangChain & LlamaIndex, Apache-2.0 for Haystack) is intact.

## Submission checklist (per PR)

Before opening each PR:

- [ ] Fork the target repo, branch named `feat/mcop-memory-shim`.
- [ ] Copy the shim file verbatim — **do not** modify the
      `SPDX-License-Identifier: MIT` header.
- [ ] Add the parity test fixture (see "Parity proof" inside each draft).
- [ ] Sign the upstream project's CLA if required (LangChain: yes;
      LlamaIndex: yes via `cla-assistant`; Haystack: DCO sign-off).
- [ ] Reference the
      [reproducible-benchmark badge](../badges/reproducible-benchmark.svg)
      in the PR body to anchor byte-identity claims.
- [ ] Link this kit and `UPSTREAM_SUBMISSION_PLAN.md` from the PR body.

## Sequencing rationale

Per `UPSTREAM_SUBMISSION_PLAN.md` §"Upstream PR sequencing":

1. **LangChain Python** — largest community, most stable memory protocol.
2. **LangChain JS** — port after Python lands.
3. **LlamaIndex Python + TS** — `BaseVectorStore` shape is symmetrical;
   parallel PRs OK.
4. **Haystack Python** — single PR, Python-only target.

Wait for #1 to merge (or at least pass first review round) before
opening #2 — reviewer feedback on the Python shim usually applies to
the JS port as well, and re-submitting against changes wastes cycles.

---

## PR 1 — LangChain Python

| Field | Value |
|---|---|
| **Target repo** | `langchain-ai/langchain` |
| **Vendor source** | `mcop_package/mcop/integrations/langchain.py` |
| **Vendor destination** | `libs/community/langchain_community/chat_message_histories/mcop.py` |
| **Test source** | `mcop_package/tests/test_integrations.py` (LangChain section) |
| **Test destination** | `libs/community/tests/unit_tests/chat_message_histories/test_mcop.py` |
| **Optional dep** | `mcop>=3.3.0` (added under `[tool.poetry.extras]` as `mcop`) |
| **License** | MIT (carved-out) → compatible with LangChain MIT |

### PR title

```
community: add MCOPChatMessageHistory (Merkle-rooted message history)
```

### PR body

````markdown
## Description

This PR adds `MCOPChatMessageHistory` — a drop-in
`BaseChatMessageHistory` implementation that records every message
through the [MCOP Framework](https://github.com/Kuonirad/MCOP-Framework-2.0)
deterministic reasoning triad (NOVA-NEO encoder → Stigmergy v5 trace →
Holographic Etch). Users get:

- **Merkle-rooted conversational history** — each `add_messages` call
  extends a SHA-256 Merkle chain rooted in the session id; tampering is
  detectable in O(log n) without re-reading the whole history.
- **Resonance recall** — `recall_by_resonance(query)` returns the
  semantically nearest prior message ranked by Stigmergy resonance
  (RFC 8785 canonical-JSON cosine over NOVA-NEO embeddings).
- **Cross-runtime byte-identity** — a message recorded through this
  Python class and the same message recorded through the
  [TS sibling shim](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/src/integrations/langchain.ts)
  produce **byte-identical Merkle roots**, verified by the
  [reproducible-benchmark
  badge](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/docs/badges/reproducible-benchmark.svg).

The shim has **zero runtime dependency on MCOP at import time** — it
funnels into `mcop` lazily, behind the existing
`BaseChatMessageHistory` shape, so adding it costs nothing for users
who don't enable it.

## Issue

Closes <issue-id-once-filed>.

## Dependencies

- `mcop>=3.3.0` (optional; added under `[tool.poetry.extras] mcop`).
  Install as `pip install langchain-community[mcop]`.

## Testing

```
poetry run pytest libs/community/tests/unit_tests/chat_message_histories/test_mcop.py
```

Parity is asserted against an upstream-vendored fixture
(`mcop-langchain-parity.json`) shipped in the test file. The fixture
contains: `{session_id, messages[], expected_merkle_root}`. Any
behavioural drift in either runtime will flip the Merkle root and fail
the test.

## License

The vendored file carries `SPDX-License-Identifier: MIT` per
[`LICENSE-MIT-INTEGRATIONS`](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/LICENSE-MIT-INTEGRATIONS).
Compatible with LangChain's MIT license.

## Maintainer ping

@hwchase17 @baskaryan — flagging per `community/CODEOWNERS` for
`chat_message_histories/`.
````

### Parity proof

Fixture to include in the upstream test file:

```json
{
  "session_id": "mcop-parity-fixture-v1",
  "messages": [
    {"type": "human", "content": "ping"},
    {"type": "ai",    "content": "pong"}
  ],
  "expected_merkle_root": "<copy from results.json>"
}
```

Source: `docs/benchmarks/results.json` already pins this root; copy the
value verbatim. If the upstream maintainers ask for a re-run script,
point them at `examples/reproducible-benchmark/`.

---

## PR 2 — LangChain JS

| Field | Value |
|---|---|
| **Target repo** | `langchain-ai/langchainjs` |
| **Vendor source** | `src/integrations/langchain.ts` |
| **Vendor destination** | `libs/langchain-community/src/chat_message_histories/mcop.ts` |
| **Test destination** | `libs/langchain-community/src/chat_message_histories/tests/mcop.test.ts` |
| **Optional dep** | `@kullailabs/mcop-core@^0.2.1` |
| **License** | MIT (carved-out) → compatible |

### PR title

```
community[chat-message-history]: add MCOPChatMessageHistory
```

### PR body

Same body as PR 1 with these swaps:

- `Python class` → `TS class`
- `pip install langchain-community[mcop]` →
  `pnpm add @langchain/community @kullailabs/mcop-core`
- `BaseChatMessageHistory` Python protocol reference →
  `@langchain/core/chat_history` TS protocol reference
- Maintainer ping: `@jacoblee93 @hwchase17`

The fixture file is the same JSON; the test loads it identically.

---

## PR 3 — LlamaIndex Python

| Field | Value |
|---|---|
| **Target repo** | `run-llama/llama_index` |
| **Vendor source** | `mcop_package/mcop/integrations/llamaindex.py` |
| **Vendor destination** | `llama-index-integrations/vector_stores/llama-index-vector-stores-mcop/llama_index/vector_stores/mcop/base.py` |
| **Test destination** | `llama-index-integrations/vector_stores/llama-index-vector-stores-mcop/tests/test_base.py` |
| **Optional dep** | `mcop>=3.3.0` |
| **License** | MIT (carved-out) → compatible |

### PR title

```
llama-index-vector-stores-mcop: new integration (Merkle-rooted vector store)
```

### PR body

````markdown
## Description

New LlamaIndex integration package
`llama-index-vector-stores-mcop` adding `MCOPVectorStore` — a
`BasePydanticVectorStore` that funnels every `add()` call through the
deterministic [MCOP Framework](https://github.com/Kuonirad/MCOP-Framework-2.0)
triad. Every node gets a Merkle-rooted `MCOPProvenance` block; `query()`
returns nodes ranked by Stigmergy resonance over NOVA-NEO embeddings.

Identical cross-runtime semantics to the
[TS sibling shim](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/src/integrations/llamaIndex.ts).
Cross-runtime Merkle-root identity is verified by the
[reproducible-benchmark badge](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/docs/badges/reproducible-benchmark.svg).

## Type of Change

- [x] New integration package

## How Has This Been Tested?

```
cd llama-index-integrations/vector_stores/llama-index-vector-stores-mcop
poetry run pytest tests/
```

## Suggested Checklist

- [x] My code follows the style guidelines of this project
- [x] I have added unit tests covering my changes
- [x] I have updated the documentation accordingly
- [x] My changes generate no new warnings

## License

`SPDX-License-Identifier: MIT` per
[`LICENSE-MIT-INTEGRATIONS`](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/LICENSE-MIT-INTEGRATIONS).
````

---

## PR 4 — LlamaIndex TS

| Field | Value |
|---|---|
| **Target repo** | `run-llama/LlamaIndexTS` |
| **Vendor source** | `src/integrations/llamaIndex.ts` |
| **Vendor destination** | `packages/llamaindex/src/vector-store/MCOPVectorStore.ts` |
| **Test destination** | `packages/llamaindex/tests/vector-store/MCOPVectorStore.test.ts` |
| **Optional dep** | `@kullailabs/mcop-core@^0.2.1` |

### PR title

```
feat(vector-store): add MCOPVectorStore (Merkle-rooted)
```

### PR body

Mirror PR 3 body, swapping Python→TS, `pip install`→`pnpm add`, and the
`BasePydanticVectorStore` reference for `BaseVectorStore` (TS).

---

## PR 5 — Haystack Python

| Field | Value |
|---|---|
| **Target repo** | `deepset-ai/haystack` (core integrations live in `deepset-ai/haystack-integrations`) |
| **Vendor source** | `mcop_package/mcop/integrations/haystack.py` |
| **Vendor destination** | `integrations/mcop/src/haystack_integrations/document_stores/mcop/document_store.py` |
| **Test destination** | `integrations/mcop/tests/test_document_store.py` |
| **Optional dep** | `mcop>=3.3.0` |
| **License** | MIT shim into Apache-2.0 project → compatible (MIT is more permissive) |

### PR title

```
feat: mcop-haystack integration (Merkle-rooted DocumentStore)
```

### PR body

````markdown
## Related Issues

Closes <issue-id-once-filed>.

## Proposed Changes

Adds the `mcop-haystack` integration package providing
`MCOPDocumentStore` — a Haystack 2.x `DocumentStore` implementation
that funnels `write_documents()` through the
[MCOP Framework](https://github.com/Kuonirad/MCOP-Framework-2.0) triad
for Merkle-rooted provenance. `filter_documents()` returns the
metadata-filtered subset; `recall_by_resonance()` exposes the
Stigmergy retrieval surface for callers who want resonance-ranked
search.

## How did you test it?

```
hatch test integrations/mcop
```

## Notes for the reviewer

The shim is intentionally framework-agnostic (no `haystack-ai` runtime
import at module load) and is vendored from
[MCOP-Framework-2.0](https://github.com/Kuonirad/MCOP-Framework-2.0)
under the MIT carve-out — see the file's `SPDX-License-Identifier`
header and
[`LICENSE-MIT-INTEGRATIONS`](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/LICENSE-MIT-INTEGRATIONS)
for the licence chain. MIT is compatible with Haystack's Apache-2.0.

## Checklist

- [x] I have read the contributors guideline
- [x] I have updated the related issue with new insights and changes
- [x] I added unit tests and updated the docstrings
- [x] I've used [DCO](https://developercertificate.org/) sign-off on
      every commit
````

---

## After-merge follow-through (this repo)

Once an upstream PR merges, update this repo:

1. Bump the integration doc (`docs/integrations/<target>.md`) to add an
   "Upstream:" line linking the merged PR.
2. Flip the row in `UPSTREAM_SUBMISSION_PLAN.md` from "Shipped · upstream
   PR pending" to "Shipped · upstream merged · <link>".
3. Increment the v2.4 milestone exit-criteria counter in
   `ROADMAP_TO_100.md` (Phase 4 progress).
4. Add a CHANGELOG entry under the unreleased section noting the
   upstream landing — this is a force-multiplier for the bus-factor
   mitigation story (audit finding B-21).
