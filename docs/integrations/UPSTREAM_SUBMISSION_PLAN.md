# Upstream Submission Plan — v2.4 Phase 4

> **Phase:** Ecosystem Integration Deepening
> **Status:** Infrastructure shipped · upstream PRs pending

## Overview

Phase 4 of the v2.4 Logical Efficacy Escalation ships **MCOP-as-a-memory-layer
shims** for the three reference agent frameworks (LangChain,
LlamaIndex, Haystack), plus a stdio **MCP Memory server** for any
MCP-aware client. Each shim is intentionally framework-agnostic so it
can be vendored verbatim into an upstream PR — that is the path from
shipping infrastructure here to landing MCOP as a first-class ecosystem
integration.

## Inventory

| Target | TypeScript shim | Python shim | Doc | Status |
|---|---|---|---|---|
| **LangChain** | `src/integrations/langchain.ts` | `mcop_package/mcop/integrations/langchain.py` | [`langchain.md`](./langchain.md) | Shipped |
| **LlamaIndex** | `src/integrations/llamaIndex.ts` | `mcop_package/mcop/integrations/llamaindex.py` | [`llamaindex.md`](./llamaindex.md) | Shipped |
| **Haystack** | `src/integrations/haystack.ts` | `mcop_package/mcop/integrations/haystack.py` | [`haystack.md`](./haystack.md) | Shipped |
| **MCP Memory Server** | `examples/mcop_memory_mcp_server/server.ts` | — | [`mcp-memory-server.md`](./mcp-memory-server.md) | Shipped |

## Cross-runtime parity

Every shim shares the deterministic NOVA-NEO encoder + RFC 8785
canonical-JSON Merkle chain with the existing `triad.py` parity layer.
A message recorded through the TS shim and the same message recorded
through the Python shim produce **byte-identical etch hashes**.

This is the same forensic equivalence the deterministic benchmark
[badge](../badges/reproducible-benchmark.svg) attests for
`docs/benchmarks/results.json` — extended now to ecosystem traffic.

## Upstream PR sequencing

> **Ready-to-file PR drafts** for each step below live in
> [`UPSTREAM_PR_KIT.md`](./UPSTREAM_PR_KIT.md) — copy the title and body
> verbatim.

Submission is staggered to maximise signal density per PR:

1. **MCOP MCP Memory Server** — already a reference example; no upstream
   PR needed. Communities adopt by adding the server entry to their MCP
   client config.
2. **LangChain (Python first, TS second)** — Python community is larger
   and the LangChain memory protocol is most stable in Python. Open the
   issue [tracker](https://github.com/langchain-ai/langchain/issues/new),
   then submit the PR vendoring `mcop_package/mcop/integrations/langchain.py`.
   Once Python lands, port the TS shim verbatim into `langchainjs`.
3. **LlamaIndex (Python + TS in parallel)** — both LlamaIndex SDKs share
   the same `BaseVectorStore` shape, so the PRs can ship together.
4. **Haystack** — Python-only target. Single PR vendoring the shim plus
   the parity test.

Each PR will:

- Reference this guide as the canonical source of truth.
- Cite the [reproducibility badge](../badges/reproducible-benchmark.svg)
  for byte-identity guarantees.
- Include a parity-checked test fixture proving cross-runtime
  Merkle-root identity.
- State that the vendored shim is MIT-licensed (per the
  [`LICENSE-MIT-INTEGRATIONS`](../../LICENSE-MIT-INTEGRATIONS)
  carve-out and the `SPDX-License-Identifier: MIT` header on each shim
  file), keeping the upstream project's licence compatibility
  (LangChain: MIT, LlamaIndex: MIT, Haystack: Apache-2.0) intact.

## License compatibility

The repository as a whole is BUSL-1.1, with a scheduled MIT conversion
on 2030-04-26. To unblock upstream contribution well before that date,
the six integration shim files (three TS + three Python) are carved
out under MIT via [`LICENSE-MIT-INTEGRATIONS`](../../LICENSE-MIT-INTEGRATIONS).
Each carved-out file carries an `SPDX-License-Identifier: MIT` header
so automated licence scanners (REUSE, FOSSA, GitHub's licence
detection) classify the vendored copy correctly.

This carve-out applies **only** to verbatim, byte-identical copies of
those six files. Derivative changes contributed back to this repo
become BUSL-1.1 unless a contributor explicitly invokes the MIT grant
in their commit. Upstream forks remain MIT in their own tree.

## Invariants preserved

- BUSL-1.1 license text untouched (Change Date: 2026-04-26 → 2030-04-26).
- Deterministic snapshot byte-identity: `docs/benchmarks/results.json`
  unchanged.
- Cryptographic lineage: SHA-256 etch hashes, RFC 8785 canonical JSON,
  Merkle parent-linked traces.
- `pnpm positive:audit` continues to register all 9 resonance checks as
  Radiating.
- `pnpm audit:placement` reports 0 violations.

## Linked artefacts

- v2.4 milestone in [`ROADMAP_TO_100.md`](../../ROADMAP_TO_100.md).
- Reproducible benchmark bundle: [`examples/reproducible-benchmark/`](../../examples/reproducible-benchmark/).
- Universal Adapter Protocol MCP reference server: [`examples/universal_adapter_mcp_server/`](../../examples/universal_adapter_mcp_server/).
