# Stigmergic Trust Substrate Roadmap

**Status:** formal roadmap. This document separates shipped MCOP invariants from
future CUDA productionization, distributed cluster mode, and hosted provenance
ledger work. It avoids claiming that planned services, clusters, kernels, or
hosted ledgers already exist.

## Thesis

MCOP's asymmetric bet is not another planner wrapper. It is a stigmergic trust
substrate: agents leave replayable traces, the substrate ranks them by
resonance and eudaimonic score, and every accepted action carries
cryptographic lineage. Hardware choice, node membership, and service-rooted
ledger receipts become part of the auditable record rather than hidden
deployment context.

## Cross-cutting invariants

| Invariant | Required rule |
| --- | --- |
| Replayability | Any accepted trace or etch can be recomputed from canonical inputs, timestamps, parent roots, and deterministic metadata. |
| Human primacy | Vetoes are first-class trace events and supersede automated score-based conflict resolution inside their trust scope. |
| Positive orientation | Eudaimonic and resonance scores are additive audit fields, not replacements for canonical hashes. |
| Substrate lineage | Hardware provider, model digest, node ID, and ledger service root are recorded as heritable environment facts. |
| Deterministic fallback | CPU fallback, local ledger fallback, and offline cluster operation must be explicit in provenance. |
| Verifiable merge | Local, node, and service roots merge through sorted canonical roots so peers can reproduce the same global root. |

## Unified lineage envelope

The long-term provenance envelope extends the current accelerator fields without
breaking existing leaves:

```ts
interface TrustSubstrateLineage {
  traceId: string;
  parentTraceIds: string[];
  localMerkleRoot: string;
  substrateLineage?: string;
  resolvedFrom?: string;
  nodeLineage?: {
    nodeId: string;
    shardId?: string;
    capabilityRoot: string;
    previousNodeRoot?: string;
  };
  ledgerLineage?: {
    serviceId: string;
    tenantRoot: string;
    receiptId: string;
    anchoringRoot?: string;
  };
  eudaimonicScore?: number;
  resonanceScore?: number;
  humanVeto?: {
    by: string;
    reason: string;
    timestamp: string;
    signature?: string;
  };
}
```

The merge rule is intentionally small:

1. Reject leaves with invalid signatures, broken parent roots, or disallowed
   trust scopes.
2. Apply the newest signed human veto inside the veto scope.
3. Otherwise choose the higher eudaimonic score for competing accepted leaves.
4. Break exact score ties by canonical digest order.
5. Compute combined roots from sorted `{scope, root}` pairs.

## Track A: CUDA and hardware substrate

CUDA productionization turns `substrateLineage` and `resolvedFrom` into
hardware heredity that future MetaTuner or evolutionary strategies can condition
revival upon.

| Gate | Deliverable | Verification |
| --- | --- | --- |
| A0 audit | Run current smoke benchmark and verified-device canary; inventory all six ops against hot paths. | `pnpm benchmark:cuda-ops:smoke`, `pnpm soak:cuda-verified-device:canary`, and real-GPU full runs after models exist. |
| A1 kernel artifacts | Deterministic ONNX export pipeline, precision variants, model manifest, Merkle digest per artifact. | Manifest digest reproduces; every `models/mcop_*.onnx` maps to exactly one accelerator op. |
| A2 provider unification | Config selects `onnx` or `microservice`; all hot paths use one provenance-attached accelerator boundary. | Accelerated encode, recall, etch, evolve, and homeostasis leaves carry provider-specific lineage. |
| A3 Python server | `mcop_cuda_server` exposes health, capabilities, and `POST /cuda/{op}` with GhostGPU checks. | HTTP bridge returns the same shape and provenance as in-process ONNX. |
| A4 CI hardening | GPU-optional workflow, forced-CPU adversarial tests, benchmark artifacts. | CUDA-requested CPU execution raises GhostGPU detection; CPU-only CI remains green. |
| A5 docs and examples | README, architecture, and production docs are updated from committed evidence only. | Public speedup claims trace to checked-in benchmark artifacts. |

Detailed gates live in `docs/CUDA_PRODUCTION.md`; low-level implementation notes
live in `docs/CUDA_PHI1_PHI5.md`.

## Track B: Distributed cluster mode

Cluster mode turns single-node stigmergy into a shared pheromone memory while
preserving deterministic local behavior.

### Cluster invariants

- Eventual Merkle-root convergence for the same accepted trace window.
- No loss of single-node determinism when a node is offline.
- Human veto propagation before score-based merge.
- Comparable resonance scoring across nodes through versioned scoring metadata.
- Capability exchange records CUDA availability, provider, kernel manifest, and
  software version before a node accepts work for a shard.

### Sync options

| Option | Shape | Use when |
| --- | --- | --- |
| A: sharded StigmergyV5 plus gossip | Consistent hashing assigns trace shards; nodes gossip Merkle roots over NATS, Redis Streams, or libp2p. | Pragmatic team clusters need operational simplicity. |
| B: content-addressed traces | Trace bundles live in IPFS-like storage with light verifiable compute receipts. | Decentralization and offline verification matter more than latency. |
| C: hybrid core and edge | Core nodes run full Holographic Etch; edge nodes cache read replicas and submit periodic proofs. | Edge agents need low-latency reads without full write authority. |

### Implementation gates

| Gate | Deliverable | Verification |
| --- | --- | --- |
| B0 design | Finalize packet schemas, root merge, trust scopes, and veto semantics. | Schema examples round-trip through canonical digest tests. |
| B1 primitives | `ClusterStigmergy`, `writeTraceRemote`, `mergeRemoteRoots`, `ClusterProvenance`, and pub/sub adapter. | Inclusion proofs verify locally; root merge is byte-identical across peers. |
| B2 membership | Capability exchange, shard assignment, heartbeat, failure detection, and re-sharding. | Three nodes reassign a failed shard without losing accepted trace roots. |
| B3 replay | `cluster:replay` API or command verifies cross-node lineage for a time window. | Node C can replay and verify a trace written on node A through node B's gossip. |
| B4 production | mTLS, signed traces, backpressure, distributed tracing, and hot-shard scaling. | Security and observability tests cover rejected signatures and saturated shards. |

## Track C: Hosted provenance ledger

The hosted or self-hosted ledger gives teams zero-ops auditability while keeping
cryptographic sovereignty: tenants can export the complete Merkle forest and
replay it locally.

### Service API

| Operation | Request | Response |
| --- | --- | --- |
| `Etch` | `{ context, score, metadata, signature? }` | `{ id, tenantRoot, merkleRoot, timestamp, receipt }` |
| `Query` | `{ filters, timeWindow, resonanceFloor? }` | Trace bundle plus inclusion proofs. |
| `Verify` | `{ proof, root }` | Boolean verdict plus failure reason. |
| `ExportFullLedger` | `{ tenant, window? }` | Verifiable bundle with roots, leaves, proofs, and schema version. |

### Implementation gates

| Gate | Deliverable | Verification |
| --- | --- | --- |
| C0 design | REST and gRPC schemas, tenant-scoped Merkle forests, receipt shape, quotas. | OpenAPI/protobuf examples match canonical JSON fixtures. |
| C1 self-host | `mcop-ledger` service, Postgres or immutable object storage, Docker Compose, Helm chart. | Self-host stack performs etch, query, verify, and export without external services. |
| C2 hosted | Managed deployment, dashboard, webhooks or streaming, admin action etching. | Hosted receipt roots match exported tenant forest roots. |
| C3 trust layer | Public verification endpoint, CLI verifier, optional transparency-log anchor. | `mcop-ledger verify` validates a downloaded bundle offline. |
| C4 MCOP integration | `ledger: { type, endpoint, apiKey }` config with local fallback. | Hosted outage falls back to local etch and records source in provenance. |

## Success state

- A real GPU node using `enableCUDA: 'auto'` loads model artifacts, accelerates
  encode and recall, and records substrate lineage without GhostGPU errors.
- Three MCOP nodes share stigmergic memory, converge on one global root for the
  same time window, and replay each other's traces with inclusion proofs.
- A team can point MCOP at a self-hosted or managed ledger, receive etch
  receipts, query with proofs, and independently verify exported history.
- All three tracks preserve the same high-level promise: replayable flourishing
  trajectories with cryptographic lineage across silicon, network, and service
  substrate.
