# Stigmergic Trust Substrate Roadmap

**Status:** formal implementation roadmap. This document consolidates the CUDA
hardware layer, distributed cluster substrate, and optional hosted provenance
ledger into one verifiable delivery contract.

## Thesis

MCOP's asymmetric bet is not another agent framework. It is a stigmergic trust
substrate: a replayable coordination layer where agent traces, hardware
execution choices, human vetoes, and eudaimonic scores are part of the same
cryptographic lineage.

Most agent frameworks optimize speed, convenience, or orchestration ergonomics.
MCOP optimizes for auditable flourishing trajectories:

- every state transition is Merkle-linked;
- every accelerated result records the substrate that produced it;
- every beneficial trace can receive bounded positive resonance;
- every contested or vetoed event remains replayable;
- every future tuner can condition revival on operational lineage, not only on
  model or prompt lineage.

The unifying pattern is simple: silicon, network, ledger, and human feedback are
not background infrastructure. They are part of the evolving record.

## Definitions

| Term | Formal meaning |
| --- | --- |
| Stigmergic trace | A durable coordination packet written into `StigmergyV5` or a compatible remote substrate. |
| Etch | A confidence-gated state transition written by `HolographicEtch`. |
| Accelerator provenance | The `_provenance` envelope attached by `attachAcceleratorProvenance`. |
| Substrate lineage | A heritable execution-environment tag such as `CUDAExecutionProvider/per-op` or `node-a/CUDAExecutionProvider/per-op`. |
| Resolved-from | The audited reason a hardware path was enabled or disabled, currently recorded as `resolvedFrom`. |
| Cluster root | A deterministic Merkle root over node-local roots for a bounded time window. |
| Ledger receipt | A signed or hash-linked proof that an etch/query/verify operation was accepted by a hosted or self-hosted ledger. |

## Non-negotiable invariants

1. **Replay before throughput.** Acceleration is valid only when the produced
   result carries enough provenance to replay the device, provider, kernel, and
   fallback decision.
2. **No ghost GPU lineage.** If CUDA is requested and the runtime profiler shows
   CPU execution, the path must fail with `GhostGPUError` rather than record a
   false CUDA lineage.
3. **Single-node determinism survives clustering.** Cluster mode may add remote
   roots and signatures, but it must not make local `StigmergyV5`,
   `HolographicEtch`, or canonical hashing nondeterministic.
4. **Human vetoes are traces.** A veto is not an out-of-band annotation; it is a
   first-class event that participates in root convergence and replay.
5. **Positive resonance is bounded.** Eudaimonic scoring and
   `PositiveResonanceAmplifier` may lift useful traces, but raw trace weights and
   canonical hashes remain inspectable.
6. **Hosted services never become trust oracles.** A hosted ledger can provide
   zero-ops auditability, but tenants must be able to export proofs and replay
   them locally.

## Track A: CUDA and hardware substrate

### Current repository baseline

| Capability | Current state | Evidence |
| --- | --- | --- |
| Six kernel operation names | Shipped for `encode`, `graphAggregate`, `holographicUpdate`, `cosineRecall`, `evolveScore`, `homeostasis`. | `src/hardware/CUDAHardwareLayer.ts`, `docs/CUDA_PHI1_PHI5.md` |
| In-process CUDA layer | Shipped as optional `CUDAHardwareLayer` with tri-state `enableCUDA`. | `src/hardware/CUDAHardwareLayer.ts` |
| HTTP CUDA bridge | TypeScript client shipped as `CUDAProvider`; Python sidecar remains unimplemented. | `src/hardware/Accelerator.ts`, `package.json` `cuda:serve` |
| Provenance fields | `requestedDevice`, `verifiedDevice`, `substrateLineage`, `durationMs`, and `resolvedFrom` are available. | `src/hardware/Accelerator.ts` |
| Benchmarks and soak harness | Smoke baselines and structural soak exist; real GPU artifacts remain a production gate. | `scripts/benchmark-cuda-graph.mjs`, `scripts/cuda-verified-device-soak.mjs` |
| Kernel artifacts | `models/mcop_*.onnx` exports are not committed and remain supply-chain inputs. | `docs/CUDA_PHI1_PHI5.md` |

### Delivery phases

#### A0. Audit and baseline

**Goal:** confirm the shipped in-process path and document the production gaps.

**Required work:**

- run `pnpm benchmark:cuda-ops:smoke` on CPU-only CI and preserve Merkle-stable
  smoke records;
- run `pnpm benchmark:cuda-graph` and `pnpm soak:cuda-verified-device` on real
  GPU hardware when available;
- map each of the six kernels to the hot paths it may accelerate:
  `vectorMath`, `NovaNeoEncoder`, `StigmergyV5`, `HolographicEtch`,
  `SynthesisProvenanceTracer`, and future orchestrator flows;
- keep `docs/CUDA_PHI1_PHI5.md` as the detailed Phi ladder and link production
  decisions back to this roadmap.

**Exit gate:** current-state matrix is accurate, benchmark smoke roots
reproduce byte-identically, and real-GPU gaps are explicit rather than implied
as shipped.

#### A1. Kernel artifact pipeline

**Goal:** make CUDA kernels versioned supply-chain artifacts rather than
untracked files.

**Required work:**

- create `scripts/export_cuda_kernels/` or extend the existing benchmark/export
  tooling to generate `mcop_<op>.onnx` for all six ops;
- emit a manifest containing op name, precision, exporter, source commit,
  shape contract, model digest, and Merkle root;
- support full precision and quantized variants without changing the public
  `CUDAKernelOp` names;
- reject a kernel artifact when its manifest digest does not match the model
  bytes loaded by `CUDAHardwareLayer`.

**Exit gate:** a clean checkout can regenerate or verify all six kernel
artifacts and produce a stable manifest that downstream provenance can quote.

#### A2. Orchestrator and dual-provider unification

**Goal:** expose one hardware policy while preserving both provider
implementations.

**Required work:**

- extend config toward `hardware: { enableCUDA, provider, kernelDir, endpoint }`
  where `provider` selects `onnx` or `microservice`;
- wire `CUDAHardwareLayer.create(...)` for in-process execution and
  `CUDAProvider` for remote execution;
- route encode, recall, holographic update, graph aggregate, evolution score,
  and homeostasis hot paths through the selected accelerator only when the
  selected layer is capable;
- ensure every accelerated or fallback result flows through
  `attachAcceleratorProvenance`.

**Exit gate:** `enableCUDA: 'auto'` selects CUDA only on capable hosts, explicit
off pins CPU, explicit on either verifies CUDA or fails with `GhostGPUError`,
and the provider choice is visible in provenance.

#### A3. Python CUDA microservice

**Goal:** make `pnpm cuda:serve` a real out-of-process provider with parity to
the TypeScript bridge.

**Required work:**

- implement `mcop_cuda_server` with `POST /cuda/{op}`, `GET /health`, and
  `GET /capabilities`;
- support the same six operation names and canonical input/output shapes used
  by `CUDAProvider`;
- use `onnxruntime-gpu` first; allow a CuPy/custom-kernel implementation only
  behind the same operation contract;
- return provenance-ready payloads including requested device, verified
  provider, kernel digest, duration, and fallback decision;
- provide Dockerfile and docker-compose examples for a stateless deployment;
- keep any session pooling internal and deterministic at the response boundary.

**Exit gate:** the TypeScript `CUDAProvider` can call the Python service for all
six ops, canary CPU fallbacks trigger the expected error path, and service
responses are replayable against the kernel manifest.

#### A4. CI, soak, and Phi-5 hardening

**Goal:** prove the hardware substrate under adversarial and production-like
conditions.

**Required work:**

- add GPU-runner jobs that execute full CUDA benchmarks when a GPU label is
  available;
- keep CPU-only CI running smoke tests and ghost-GPU canaries;
- add adversarial tests that force CPU execution while CUDA is requested and
  assert `GhostGPUError`;
- exercise the `createDefaultAccelerator` and `CUDAHardwareLayer.create` auto
  probe path with explicit-on, explicit-off, capable-auto, and not-capable-auto
  fixtures.

**Exit gate:** CPU-only CI is green without CUDA dependencies, GPU CI produces
measurable speedup records, and every CUDA result carries verified lineage.

#### A5. Production documentation and examples

**Goal:** make production adoption copy-pasteable without weakening the audit
model.

**Required work:**

- create `docs/CUDA_PRODUCTION.md`;
- add a minimal "enable CUDA in three lines" example for both `onnx` and
  `microservice` providers;
- document kernel manifest verification, provenance fields, fallback behavior,
  and compatibility notes;
- publish CPU vs CUDA comparison tables only from reproducible benchmark
  artifacts.

**Exit gate:** a GPU host can enable `enableCUDA: 'auto'`, load verified kernels,
accelerate encode/recall paths, fall back cleanly when capability disappears,
and reproduce the published benchmark roots.

## Track B: Distributed cluster substrate

### Vision

Cluster mode turns the single-node stigmergic substrate into a coordinated
memory field. Multiple MCOP nodes write local traces, exchange root summaries,
request proofs on demand, and converge on deterministic global roots for bounded
time windows.

### Cluster invariants

- local single-node behavior remains deterministic without cluster services;
- root convergence is eventual, explicit, and measurable;
- remote traces are admitted only through signature, trust-scope, and policy
  checks;
- human vetoes propagate as signed traces;
- resonance scores remain comparable by using shared normalization metadata;
- conflict resolution is deterministic and auditable.

### Delivery phases

#### B0. Design selection

**Goal:** choose the first synchronization model without foreclosing later
decentralization.

| Option | Shape | Use when |
| --- | --- | --- |
| A. Sharded stigmergy with pub/sub roots | Consistent hashing plus NATS JetStream or Redis Streams. | Pragmatic first implementation and operational observability matter most. |
| B. IPFS-backed trace bundles | Content-addressed traces plus light verifiable compute receipts. | Decentralized archival and offline exchange matter most. |
| C. Hybrid core/edge | Core nodes run full etch and memory; edge nodes verify proofs and cache reads. | Regulated environments need strong writers and many read replicas. |

**Exit gate:** one option is accepted in an ADR with threat model, failure
model, and replay model.

#### B1. Core primitives

**Goal:** define the portable cluster substrate API.

**Required contracts:**

- `ClusterStigmergy.writeTraceRemote(nodeId, trace)` returns a Merkle inclusion
  proof and does not mutate local state until verification passes;
- `ClusterStigmergy.mergeRemoteRoots(roots)` sorts roots canonically and emits a
  combined root;
- `ClusterProvenance` records node ID, local root, peer root, signature,
  trust scope, and merge policy;
- conflicts preserve sibling branches and select an active branch by human veto
  timestamp first, then eudaimonic score, then canonical hash order.

**Exit gate:** deterministic tests can merge the same remote roots in different
orders and produce the same global root.

#### B2. Membership and orchestration

**Goal:** make nodes discoverable and shard assignments explicit.

**Required work:**

- implement heartbeat and capability exchange, including CUDA provider status;
- assign trace shards by consistent hash or documented leader election;
- re-shard deterministically after node failure;
- record membership changes as provenance events.

**Exit gate:** a three-node test can lose one node, reassign shards, and replay
why the reassignment occurred.

#### B3. Consistency and replay

**Goal:** let any node verify a window of cluster history.

**Required work:**

- add `cluster:replay` CLI or API;
- fetch trace bundles plus Merkle proofs from peer nodes;
- verify local root, peer root, combined root, signatures, trust scope, and veto
  propagation;
- run integration tests that write on node A and verify resonance plus lineage
  on node C.

**Exit gate:** three independent nodes produce one consistent global root for a
bounded window, and a trace written on node A is verifiable and resonant on node
C.

#### B4. Production concerns

**Goal:** operate the cluster without making the audit trail opaque.

**Required work:**

- add mTLS or equivalent node authentication;
- sign trace packets and root announcements;
- expose distributed tracing for resonance queries and etch propagation;
- add backpressure on high-resonance hot shards;
- evaluate CRDT or OT-style merges only after immutable append semantics are
  proven insufficient.

**Exit gate:** operators can diagnose slow convergence, reject unsigned roots,
and export enough data to replay cluster behavior offline.

## Track C: Hosted or self-hosted provenance ledger

### Vision

The ledger service gives teams zero-ops auditability for etch, query, verify,
and export flows while preserving cryptographic sovereignty. It is an optional
service rooted in the same `HolographicEtch` and provenance primitives, not a
replacement for local replay.

### API contract

| Operation | Request | Response |
| --- | --- | --- |
| `Etch` | context, score, metadata, optional signature | `EtchReceipt` with ID, tenant root, timestamp, proof, and current Merkle root |
| `Query` | resonance filters, trust scope, time window | traces plus inclusion proofs |
| `Verify` | proof and claimed root | boolean result plus failure reason |
| `ExportFullLedger` | tenant, root or time window | verifiable bundle suitable for local replay |

### Delivery phases

#### C0. Service design

**Goal:** define tenancy, proof shape, and replay boundaries.

**Required work:**

- choose REST plus optional gRPC streaming contracts;
- define tenant-scoped Merkle forests or namespaced roots;
- document quota and billing as operational metadata, never as part of the
  canonical root;
- specify failure modes and local fallback behavior.

**Exit gate:** OpenAPI or protobuf contracts exist with examples for etch,
query, verify, and export.

#### C1. Self-host implementation

**Goal:** provide the reference deployment before any managed service.

**Required work:**

- implement `mcop-ledger` as a thin service over existing etch/provenance logic;
- persist append-only events in Postgres or immutable object storage;
- return receipts on every write and proof-bearing responses on every query;
- provide Docker Compose and Helm examples;
- add local replay tests against exported bundles.

**Exit gate:** `docker compose up -d` yields a working ledger whose exported
bundle verifies locally.

#### C2. Managed service

**Goal:** make hosted auditability operationally convenient without changing
the trust model.

**Required work:**

- deploy the same service with managed database and object storage;
- add dashboard views for resonance, provenance exploration, receipts, and
  exports;
- provide webhooks or streams for real-time etch receipts;
- etch admin actions into a separate administrative ledger.

**Exit gate:** hosted and self-hosted receipts verify with the same CLI and
export format.

#### C3. Verification and anchoring

**Goal:** allow independent verification outside the service boundary.

**Required work:**

- implement `mcop-ledger verify --root <root> --bundle <export>`;
- expose a public verification endpoint;
- publish periodic global roots to a transparency log or optional blockchain
  anchor;
- document how tenants replay their Merkle forest against local MCOP nodes.

**Exit gate:** a tenant can prove that hosted history matches locally observed
history without trusting the operator.

#### C4. MCOP integration

**Goal:** make ledger selection a configuration concern.

**Required work:**

- add `ledger: { type: 'local' | 'hosted' | 'self-hosted', endpoint?, apiKey? }`;
- fall back to local `HolographicEtch` when the remote ledger is unreachable;
- record fallback source and failure reason in provenance;
- provide examples for enterprise zero-ops auditability and local sovereign
  replay.

**Exit gate:** an MCOP deployment can point at a hosted or self-hosted ledger,
perform etches, query with proofs, export history, and verify the export
locally.

## Unified acceptance scenario

The roadmap is complete when all three tracks satisfy this scenario:

1. A GPU-capable node starts with `enableCUDA: 'auto'`, verifies kernel
   artifacts, and accelerates encode plus recall operations.
2. The node writes accelerated traces with `substrateLineage`, `resolvedFrom`,
   and verified device provenance.
3. Two peer nodes receive the trace root, fetch proof bundles, and converge on a
   deterministic cluster root for the same time window.
4. The deployment sends etch receipts to a hosted or self-hosted ledger.
5. A verifier exports the ledger bundle, recomputes local, cluster, and hosted
   roots, and confirms that hardware lineage, human vetoes, and eudaimonic
   scores match the observed history.

If any step cannot be replayed from proofs and committed metadata, the system is
not production-complete.

## Immediate implementation order

1. Finish kernel artifact supply-chain verification.
2. Implement the Python CUDA microservice or remove `pnpm cuda:serve` until the
   service exists.
3. Add production CUDA documentation backed by real GPU benchmark artifacts.
4. Write the cluster ADR and deterministic root-merge tests.
5. Implement the self-hosted ledger before the managed service.
6. Add hosted-ledger configuration only after export-and-verify semantics are
   proven locally.
