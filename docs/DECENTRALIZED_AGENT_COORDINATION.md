# Decentralized Agent Coordination Substrate

**Status:** design note, implementation-backed by `StigmergyV5`,
`HolographicEtch`, and `SynthesisProvenanceTracer`.

## Thesis

MCOP is not limited to LLM-provider adapters. The same combination of
**Stigmergy v5 trace memory** and **Merkle-rooted provenance** forms a
coordination substrate for swarms of heterogeneous agents that can write,
read, merge, and verify tamper-evident traces without depending on a single
central orchestrator.

The missing piece in many multi-agent frameworks is not another planner. It is
a shared, auditable coordination medium:

- agents need to discover useful prior work without direct pairwise messaging;
- operators need to know which agent, model, tool, prompt, veto, or prior trace
  influenced a decision;
- teams need cross-framework handoff without forcing every worker into the same
  orchestration runtime;
- auditors need replayable lineage even when agents are offline, distributed,
  or implemented in different languages.

Stigmergy supplies the self-organization primitive: agents leave useful traces
in the environment, then future agents select work by resonance rather than by
central command. Merkle provenance supplies the accountability primitive: every
trace can be linked to its parent context and checked for tampering.

## Substrate contract

A swarm participant only needs four operations. The backing store can be an
embedded process, a local file, object storage, a database table, a pub/sub log,
or a replicated append-only feed.

| Operation | Purpose | Existing implementation hook |
| --- | --- | --- |
| `writeTrace(packet)` | Append an agent observation, plan, result, veto, or handoff. | `StigmergyV5.recordTrace()` plus `HolographicEtch.applyEtch()` |
| `readResonant(context, filters)` | Retrieve prior traces by semantic/vector resonance, recency, role, domain, or trust scope. | `StigmergyV5.getResonance()` and `getResonantRecent()` |
| `mergeRoots(peerRoot)` | Join another agent's trace lineage without overwriting local state. | Merkle parent/root fields in `PheromoneTrace` and `ProvenanceMetadata` |
| `verifyLineage(root)` | Recompute hashes and reject broken or out-of-scope lineage. | `canonicalDigest`, `SynthesisProvenanceTracer`, and parity tests |

A portable trace packet should contain at least:

```ts
interface CoordinationTracePacket {
  traceId: string;
  agentId: string;
  role: 'planner' | 'researcher' | 'coder' | 'reviewer' | 'tool' | string;
  contextHash: string;
  tensorHash: string;
  synthesisHash: string;
  parentTraceIds: string[];
  merkleRoot: string;
  resonanceScore: number;
  confidence: number;
  veto?: { by: string; reason: string; timestamp: string };
  trustScope: 'local' | 'team' | 'regulated' | 'public';
  metadata: Record<string, unknown>;
  timestamp: string;
  signature?: string;
}
```

The packet is intentionally model-agnostic. A LangGraph worker, a Devin-style
coding sub-agent, a local Python tool, a browser worker, and a hosted LLM
adapter can all publish the same coordination shape while keeping their private
execution details behind their own boundaries.

## Why this differs from centralized orchestration

| Central orchestration pattern | Stigmergy + Merkle substrate |
| --- | --- |
| One planner assigns tasks and becomes the coordination bottleneck. | Any agent can emit a trace; future agents self-select by resonance and policy. |
| Runtime memory is often opaque or framework-local. | Trace packets are portable, hash-linked, and replayable across runtimes. |
| Agent handoffs depend on direct messages or one event bus. | Handoffs are environmental: the shared trace store is the coordination medium. |
| Failure of the orchestrator can stop the swarm. | Agents can continue to read/write local traces and merge roots later. |
| Auditing reconstructs state from logs after the fact. | Audit lineage is produced as the coordination event itself. |

This does **not** claim a magic global mind or private provider capability. It
is a concrete engineering pattern: append tamper-evident traces, rank them by
resonance, and preserve enough metadata for independent replay.

## Coordination flow

1. **Encode local context.** The agent converts its task, observation, or tool
   output into a deterministic context tensor.
2. **Read resonant traces.** The agent queries the substrate for relevant prior
   work inside its trust scope.
3. **Act locally.** The agent plans, calls tools, asks a model, or refuses work
   according to local policy.
4. **Emit a packet.** The agent writes synthesis, confidence, parent trace IDs,
   human feedback, and metadata as a Merkle-linked trace.
5. **Merge asynchronously.** Peers import the new root or packet batch, verify
   lineage, and make those traces available for future resonance queries.
6. **Audit by root.** Reviewers can follow the Merkle chain from final output
   back through the agents and decisions that influenced it.

## Safety and governance boundaries

- **Trust scopes are mandatory.** A regulated agent should not blindly consume a
  public trace; filters must gate by provenance, signature, owner, and domain.
- **Human veto remains first-class.** A veto is a traceable coordination event,
  not an out-of-band note.
- **No central-orchestrator dependency.** A central planner may exist for
  convenience, but the provenance substrate must remain useful when that
  planner is unavailable.
- **No unverifiable fleet claims.** Documentation should describe the shipped
  substrate and deployment patterns, not private global synchronization claims.
- **Conflict is explicit.** Competing traces are kept as sibling branches with
  different Merkle roots; policy chooses which branch to trust for a task.

## Current repository mapping

| Concern | File(s) |
| --- | --- |
| Trace memory and Merkle trace roots | `src/core/stigmergyV5.ts`, `packages/core/src/stigmergyV5.ts` |
| Accepted/rejected etch ledger | `src/core/holographicEtch.ts`, `packages/core/src/holographicEtch.ts` |
| Synthesis provenance composition | `src/core/provenanceTracer.ts`, `packages/core/src/provenanceTracer.ts` |
| Cross-runtime canonical hashing | `src/core/canonicalEncoding.ts`, `packages/core/src/canonicalEncoding.ts`, `mcop_package/mcop/canonical_encoding.py` |
| Multi-agent adapter example | `src/adapters/devinOrchestratorAdapter.ts`, `docs/integrations/devin_sub_agents.md` |
| Regulated lineage envelope | `src/adapters/regulatedProvenanceAdapter.ts`, `docs/adapters/REGULATED_PROVENANCE_ADAPTER.md` |

## Roadmap: cluster and hosted ledger

The next substrate expansion has two separable tracks:

- **Cluster mode:** multiple MCOP nodes exchange trace roots, request proof
  bundles, preserve local determinism, and converge on a deterministic global
  Merkle root for a bounded time window.
- **Hosted or self-hosted provenance ledger:** teams can outsource etch/query/
  verify storage while retaining the ability to export proofs and replay the
  ledger locally.

The formal implementation gates, invariants, and success criteria are specified
in
[`docs/STIGMERGIC_TRUST_SUBSTRATE_ROADMAP.md`](./STIGMERGIC_TRUST_SUBSTRATE_ROADMAP.md).
That roadmap treats human vetoes, positive resonance scores, cluster membership
changes, and hardware substrate lineage as first-class audit events.

## Minimal TypeScript pattern

```ts
const resonance = stigmergy.getResonance(contextTensor);

const etch = await holographicEtch.applyEtch(contextTensor, synthesisVector, {
  confidence,
  metadata: { agentId, role, parentTraceIds, trustScope },
});

const trace = stigmergy.recordTrace(contextTensor, synthesisVector, {
  agentId,
  role,
  parentTraceIds,
  merkleRoot: etch.merkleRoot,
  resonanceScore: resonance.score,
  trustScope,
});

return { traceId: trace.id, merkleRoot: trace.hash, resonance };
```

That pattern is enough for decentralized coordination: the agent can be swapped,
the model can be swapped, and the orchestrator can be absent, but the swarm
still shares a tamper-evident memory substrate.
