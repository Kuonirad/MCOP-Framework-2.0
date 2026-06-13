# MCOP Comparison Notes

Last updated: 2026-05-24

This is a living orientation document, not a winner-take-all benchmark. Use it
to decide whether MCOP is the right substrate for a job, then verify upstream
framework docs before making architecture commitments.

## Sources to Re-check

- MCOP: [`README.md`](./README.md), [`docs/benchmarks/results.json`](./docs/benchmarks/results.json), [`examples/reproducible-benchmark/README.md`](./examples/reproducible-benchmark/README.md)
- LangChain: [official overview](https://docs.langchain.com/oss/python/langchain/overview)
- Microsoft Agent Framework / AutoGen successor path: [official overview](https://learn.microsoft.com/agent-framework/overview/agent-framework-overview) and [AutoGen migration guide](https://learn.microsoft.com/agent-framework/migration-guide/from-autogen/)
- CrewAI: [official docs](https://docs.crewai.com/) and [introduction](https://docs.crewai.com/introduction)

## What MCOP Optimizes For

MCOP is strongest when the problem requires deterministic replay, Merkle-linked
provenance, reproducible benchmark artifacts, and small reversible changes to a
reasoning substrate. It is intentionally less optimized for rapid no-code agent
composition or broad ecosystem integrations.

## Comparison Table

| Question | MCOP 2.0 | LangChain | Microsoft Agent Framework / AutoGen path | CrewAI |
| --- | --- | --- | --- | --- |
| Main optimization target | Deterministic meta-cognitive substrate with replayable provenance. | Flexible agent and tool integration across model ecosystems. | Production agent and multi-agent workflows aligned with Microsoft SDKs. | Role-based multi-agent teams and workflows. |
| Best first experiment | Re-run the reproducible benchmark bundle and inspect the manifest. | Build a tool-using agent from official templates. | Port or build an agent workflow from the official SDK examples. | Model a small crew or flow with explicit roles. |
| Provenance default | Merkle-linked traces and ledger-aware etches are core claims. | App-level tracing is available through LangSmith/LangGraph patterns, not MCOP-style core Merkle lineage. | Framework-level observability depends on selected runtime and services. | Flow and crew execution can be structured, but MCOP-style Merkle lineage is not the primary abstraction. |
| Reader-verifiable receipts | Each claim ships an O(log n) Merkle Mountain Range inclusion proof a reader's browser folds locally to a published root ([`/verify`](src/app/verify), `docs/VERIFIABLE_RECEIPTS.md`). | Not a built-in primitive; tracing is server-side and trusted, not reader-folded. | Not a built-in primitive. | Not a built-in primitive. |
| Provenanced generation (film) | Long-form video ships a sidecar where every shot is Merkle-traceable to its prompt/seed/adapter and the Direct-Forcing fingerprint of the prior clip; the credits are a root hash a viewer verifies locally ([`/film`](src/app/film), `docs/PROVENANCED_FILM.md`). | Not a built-in primitive. | Not a built-in primitive. | Not a built-in primitive. |
| Benchmark posture | Committed regression baseline plus Docker/Jupyter reproduction bundle. | Project benchmarks vary by application. | Project benchmarks vary by application. | Project benchmarks vary by application. |
| When to choose it | You need auditability, deterministic replay, and substrate evolution as the research object. | You need the broadest agent integration surface quickly. | You are already building inside Microsoft's agent ecosystem or migrating from AutoGen. | You want concise multi-agent role orchestration and workflow ergonomics. |
| When not to choose it | You only need a thin wrapper around LLM calls or the fastest path to a demo. | You need cryptographic provenance as a built-in invariant. | You are avoiding platform-aligned SDK assumptions. | You need deterministic Merkle replay as the first-order primitive. |

## Revision Rules

- Update this file when MCOP changes its benchmark harness, provenance model,
  license posture, or adapter surface.
- Update this file when any linked upstream framework changes its positioning
  enough to invalidate a row above.
- Preserve negative findings. A disconfirming comparison is useful if it names
  the exact version, source, and reproduction path.

