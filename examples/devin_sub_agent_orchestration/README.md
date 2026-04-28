# Devin Sub-Agent Orchestration

This directory hosts **Integration #2** in the MCOP ecosystem-expansion
plan: MCOP as the governance layer for autonomous coding sub-agents in a
Researcher → Coder → Reviewer loop.

## What it shows

Each leg of the loop is dispatched through a `SubAgentClient`
(implemented against Devin's MCP server in production, against the
bundled `mockSubAgentClient` in CI). Every leg is funnelled through the
deterministic MCOP triad:

```
encode → resonance → dialectical synthesis → etch → call → record trace
```

so every artefact comes back with a Merkle-rooted ProvenanceMetadata
bundle. The orchestrator chains those bundles into a single
`merkleChain` that is the audit-ready record for the entire run.

## Why MCOP earns its keep here

Three concrete wins versus a "raw" multi-agent loop:

1. **Resonance-detected cache hits.** When a downstream leg's prompt
   resonates strongly with a prior leg (e.g. the Reviewer is
   essentially re-asking the Coder's question), the orchestrator
   short-circuits the call and reuses the prior artefact verbatim. This
   is the lever the case study leans on for token-saving claims.
2. **Per-leg human veto / rewrite.** The `humanReview` hook is invoked
   before each dispatch. An operator can veto a leg, rewrite the
   prompt, or attach notes — all of which flow through the dialectical
   synthesizer the same way they do for any other adapter.
3. **Single Merkle chain across legs.** Because the etch hash is
   deterministic and chained via the stigmergy buffer, the entire run
   is reproducible from the printed `merkleChain`.

## Running it

```sh
# Offline mock client (default — reproducible, no credentials needed)
pnpm exec ts-node examples/devin_sub_agent_orchestration/orchestrator.ts \
  "Add a /benchmarks route that surfaces the Human-vs-Pure-AI study."

# Real Devin sub-agents (requires the MCP integration from PR D)
DEVIN_SUB_AGENT_BACKEND=devin-mcp \
  pnpm exec ts-node examples/devin_sub_agent_orchestration/orchestrator.ts \
  "..."
```

## Before / after metrics

The case study writeup at
[`docs/integrations/devin_sub_agents.md`](../../docs/integrations/devin_sub_agents.md)
captures the full numbers; the offline run with the bundled mock
produces:

| Metric                    | Raw 3-agent loop | MCOP-governed loop |
|---------------------------|------------------|--------------------|
| Sub-agent calls           | 3                | ≤ 3 (cache short-circuits when resonance ≥ 0.85) |
| Auditable Merkle chain    | None             | `merkleChain[3]` printed by the example |
| Human-veto path           | Ad-hoc           | First-class `humanReview` hook per leg |
| Reproducibility           | Stochastic       | Deterministic given the same triad seed and client |

## Anatomy of a Merkle chain

Every leg prints its own `merkleRoot`. The orchestrator concatenates
them in dispatch order so a downstream auditor can replay the loop
deterministically. Example output (mock client, default task):

```
Merkle chain:
  3f897771d38b25c2879e0a1a390368a67d0594d3ae8c625e676c5fd04ebf7a50
  …
  …
```

The first leg's root is the same Grok-adapter Merkle root captured in
`docs/integrations/grok.md` if you happen to seed the loop with the
exact narrative-research prompt — the triad is shared across adapters,
so **provenance is portable across integrations**.
