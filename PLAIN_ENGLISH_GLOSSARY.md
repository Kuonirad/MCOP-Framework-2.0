# Plain-English Glossary

Companion reference for the MCOP Framework 2.0. The framework deliberately uses
vivid, domain-specific vocabulary (ecological metaphors, cognitive-science
coinages, cryptography terms). This glossary translates every non-obvious term
into plain English **without replacing any existing identifier, export, or
brand**.

- **Scope:** every custom acronym, neologism, metaphor, or domain-specific
  phrase found in `README.md`, `ARCHITECTURE.md`, `CONTRIBUTOR_ONBOARDING.md`,
  `ROADMAP_TO_100.md`, `docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md`,
  `docs/whitepapers/`, `docs/formalization/`, `docs/planning/`, and source
  comments in `src/core/` and `mcop_package/mcop/`.
- **Out of scope:** standard computer-science / ML vocabulary (cosine
  similarity, Merkle tree, SHA-256, tensor, cryptographic hash) — those are
  already widely understood and are not re-defined here.
- **Non-breaking posture:** existing names remain canonical. Where code
  aliases have been added, both the original and the plain-English alias
  resolve to the same export.

If you find a term in the repo that is not covered here, please open a PR
adding it — the goal is **100% coverage**.

---

## 1. Framework / Branding

### MCOP
**Canonical expansion (as of 2026-04-26): Meta-Cognitive Optimization Protocol.**
Plain English: *AI cognitive optimization system.*

This is now the only expansion used in `README.md`, `ARCHITECTURE.md`,
`packages/core/`, `mcop_package/`, and the published TypeScript / Python
package metadata. The two historical variants below are preserved here for
discoverability — anyone searching old issues, blog posts, or pre-2026-04-26
releases will land on this glossary entry and learn that they refer to the
same project.

| Historical variant | Last seen in | Status |
| --- | --- | --- |
| **Multi-Cognitive Optimization Protocol** | `ARCHITECTURE.md` (pre-2026-04-26) | Retired — same project, framed around multiple coordinating agents. |
| **Meta-Cognitive Operating Protocol** | `packages/core/package.json`, `mcop_package/` (pre-2026-04-26) | Retired — same project, framed as an operating layer for AI workflows. |

Identifiers, exports, package names (`@kullailabs/mcop-core`, `mcop`), and
the on-the-wire protocol are unchanged. Only the prose expansion of the
acronym was consolidated.

### MCOP Framework 2.0
Plain English: *the second-generation toolkit built on top of MCOP — a
Next.js / TypeScript app plus a Python SDK that orchestrates auditable AI
reasoning and creative generation.*

### BUSL 1.1 → MIT conversion (2030-04-26)
**Business Source License 1.1** with an automatic conversion to **MIT** on
`2030-04-26`. Plain English: *source-available now, fully open-source on that
date*. Commits and releases prior to `2026-04-26` are already MIT (see
`LICENSE-MIT-LEGACY`).

---

## 2. The Deterministic Triad (three core modules)

### Triad / Deterministic Triad
The three modules below working as one engine. Plain English: *core engine
components*.

### NOVA-NEO Encoder (`NovaNeoEncoder`)
Repo: *"Deterministic hashing pipeline to generate fixed-dimension tensors
with optional normalization and entropy estimates."*
Plain English: *text-to-vector encoder that always produces the same vector
for the same input, with a built-in clarity/uncertainty score. Two backends:
`hash` (legacy SHA-256, default) and `embedding` (n-gram feature hashing
that captures semantic overlap).*
Alias: **`ContextTensorEncoder`** (exported alongside `NovaNeoEncoder`).

### Stigmergy v5 / Resonance (`StigmergyV5`)
Repo: *"Vector pheromone store with cosine resonance scoring, configurable
thresholds, and Merkle-proof hashes."* Inspired by **stigmergy** — the
biological term for indirect coordination through environmental traces
(e.g. ants via pheromones).
Plain English: *shared memory database that stores past (input, output) pairs
and looks up the most similar past case using cosine similarity.*
Alias: **`SharedTraceMemoryV5`** (exported alongside `StigmergyV5`).

### Holographic Etch / Engine (`HolographicEtch`)
Repo: *"Rank-1 micro-etch accumulator that tracks confidence deltas and
exposes replayable audit trails."*
Plain English: *append-only change log that records every small confidence
update and exposes a replayable, hash-verified audit trail.*
Alias: **`ChangeAuditLogger`** (exported alongside `HolographicEtch`).

---

## 3. Triad-related vocabulary

### ContextTensor
Plain English: *a fixed-length array of numbers that represents one piece of
context (a prompt, a script segment, a scene description).*

### Pheromone trace / Cognitive trace (`PheromoneTrace`)
Plain English: *one stored record in the shared memory — links an input
vector to a produced output vector, plus metadata and a hash.*
Alias: **`MemoryTraceRecord`** (exported alongside `PheromoneTrace`).

### Resonance / Resonance score (`ResonanceResult`)
Plain English: *cosine-similarity score between a new input vector and the
closest stored trace. Higher = more similar.*

### Rank-1 micro-etch
Plain English: *a small, constant-size update to the system's confidence
state. "Rank-1" refers to the mathematical shape of the update; it's
intentionally cheap to apply.*

### Crystalline entropy target / Entropy floor / Entropy-based normalization
Plain English: *the encoder targets a specific "clarity" level for its
output vectors — enough variance to be informative, not so much that it
becomes noise. Knobs let you tune this per-call.*

### Adaptive confidence (four factors)
The Etch engine scores confidence using four inputs (see
`AdaptiveConfidenceBreakdown`):

| Factor | Plain English |
| --- | --- |
| `alignment` | How close the new vector is to the reference vector (cosine). |
| `magnitudeHealth` | Whether the vector magnitude is in a reasonable band (not collapsed to zero, not exploding). |
| `staticFloorMargin` | How far above the configured minimum confidence (`confidenceFloor`) the score sits. |
| `recencyStability` | Whether recent confidence values have been stable (no thrashing). |

### Merkle root / Merkle chain / Merkle-tracked / Merkle lineage
Standard cryptography term. Plain English: *a tamper-evident chain of hashes
such that changing any past entry invalidates every subsequent hash.* Not
MCOP-specific.

### Provenance / `ProvenanceMetadata`
Plain English: *a complete traceability record for one adapter call —
tensor hash, trace hash, resonance score, etch hash, refined prompt,
timestamp. Persist it to replay or audit the decision later.*
Alias: **`TraceabilityRecord`** (exported alongside `ProvenanceMetadata`).

### Deterministic cognition / Crystalline determinism
Plain English: *given identical inputs and identical triad state, the
framework produces identical outputs — no hidden randomness.*

---

## 4. Adapter Layer

### Universal MCOP Adapter Integration Protocol v2.1
Plain English: *a standard contract (`IMCOPAdapter`) that lets you plug the
triad into any external creative-production platform (Freepik, Higgsfield,
Utopai, or any generic REST/MCP/HTTP service) without modifying the core.*

### Dialectical Synthesizer (`DialecticalSynthesizer`)
Plain English: *the human-in-the-loop refinement step. The user can accept,
edit, or veto the refined prompt before it's dispatched to the vendor.*
Alias: **`HumanReviewRefinementLoop`** (exported alongside
`DialecticalSynthesizer`).
The name is inspired by the **thesis / antithesis / synthesis** pattern from
Hegelian dialectics.

### Human-in-the-loop / `HumanFeedback` / `HumanVetoError`
Plain English: *mechanism for a human to approve, edit, or hard-reject an
adapter's output before it's dispatched. A `veto` raises `HumanVetoError`
and refuses the call.*

### `BaseAdapter` / `IMCOPAdapter` / `AdapterRequest` / `AdapterResponse` /
### `AdapterCapabilities` / `AdapterDomain`
Standard adapter-pattern terminology. Plain English: *the abstract class and
interfaces every platform-specific adapter implements. No hidden meaning.*

---

## 5. Planning Layer (MCTS + MAB)

### MCOPMCTSPlanner / MCTS + MAB integration
Plain English: *an optional, read-only planner that searches a tree of
candidate action sequences (Monte-Carlo Tree Search) using an upper-
confidence-bound bandit (UCB1) to pick the next branch. It scores candidate
paths by running them through the triad in simulation only — it never
mutates triad state.*

### UCB1 / UCT
Standard reinforcement-learning vocabulary. Plain English:
- **UCB1** = "Upper Confidence Bound v1" — a formula that balances
  exploration and exploitation when picking among options whose value is
  uncertain.
- **UCT** = "Upper Confidence bounds applied to Trees" — UCB1 used as the
  tree-policy inside MCTS.

### Logically-learned rollouts
Plain English: *instead of rolling out with random play-outs (classic Monte
Carlo), the planner simulates by running the candidate path through the
triad deterministically and picking the next action that maximises resonance.*

### `PlanResult` / `bestSequence` / `rootMerkleHash` / `provenanceTrace`
Plain English: *the planner's output bundle — the top action sequence, a
single hash identifying the explored tree, and the per-node reasoning trail.*

---

## 6. Formalization / P_GoT

### P_GoT / Pheromone Graph of Thoughts
Plain English: *a directed graph whose nodes are "thoughts" (encoded
context vectors) and whose edges are typed relationships. It composes the
triad into a single structure with auditable provenance. Formalized as the
7-tuple `G = (V, E, Φ, Ψ, Λ, Ω, τ)` in
`docs/formalization/P_GoT_MCOP_v1.0/`.*

### `ThoughtNode` / `ThoughtEdge`
Plain English: *nodes and edges of the P_GoT graph. Each node carries a
context tensor and a synthesis vector; each edge carries a weight and a
typed `kind`.*

### `maxFanout` / Bounded fanout
Plain English: *cap on the number of outgoing edges per node, to prevent
pathological reasoning blow-up.*

### `merkleRoot()` / Merkle continuity of Λ
Plain English: *every new trace embeds the previous trace's hash, so any
mutation of a past thought invalidates the chain.*

---

## 7. Python package (`mcop_package/mcop`)

### Mycelial Network / Mycelial Chaining System (`mcop.mycelial`)
Plain English: *a recursive hypothesis-refinement tree, inspired by fungal
mycelium — hypotheses branch, connect, and grow into a reasoning chain.*

### Xi^infinity (Ξ^∞) reasoning mode (`mcop.xi_infinity`)
Plain English: *an opt-in "non-obvious-angle" reasoning mode that
deliberately seeks unconventional framings via meta-questioning, phase-
transition hunting, perspective reversal, and distant analogy. Deterministic
— does not call an LLM.*

### Bootstrap Compression Kernel
Plain English: *conceptual efficiency-optimization pass described in the
whitepaper supplement. Reduces redundant operations during framework
instantiation.*

> **Conceptual component (not a shipping class).** The Bootstrap Compression
> Kernel is a design concept in
> [`docs/whitepapers/MCOP_Blueprint_Supplement_Volume_II.md`](docs/whitepapers/MCOP_Blueprint_Supplement_Volume_II.md).
> It has no direct counterpart in `src/core/` or `mcop_package/mcop/` — none
> of the deterministic-triad guarantees depend on it. Treat it as roadmap
> vocabulary, not a runtime primitive.

### Epistemic State (`Growing`, `Validated`, `Pruned`)
Plain English: *the lifecycle stage of a hypothesis inside the mycelial
network — actively expanding, accepted as supported, or discarded.*

### Cross-Language Parity Guardian (`mcop.triad`, `scripts/parity-guardian.mjs`)
Plain English: *a CI check that compares the TypeScript and Python
implementations of the triad primitives bit-for-bit. Fails loudly if they
drift.*

### Holey-Array Avoidance
Plain English: *a V8-specific performance pattern — avoid
`new Array(n)` (which creates a "holey" array that deopts hot math paths).
Use simple index loops and direct multiplication instead.*

---

## 8. Ecosystem / Roadmap Metaphors (historical document)

> `ROADMAP_TO_100.md` explicitly flags itself as a **historical document**.
> The ecological-metaphor scoring model is no longer the operative roadmap;
> current priorities live in `GOVERNANCE.md` and `CHANGELOG.md`. These terms
> are preserved for historical context only.

| Term | Repo usage | Plain English |
| --- | --- | --- |
| **Eco-Fitness Score** | Overall project-health metric | Overall project-health score. |
| **Bus Factor** | Minimum people needed to keep the project alive | Key-person risk level (industry standard term — not MCOP-specific, but worth defining). |
| **Shannon Diversity Index** | Contributor / team diversity measure | Contributor-diversity metric. |
| **Seedling / Sapling / Canopy / Keystone** | Contributor tiers (1–5 / 6–20 / 21–50 / 50+ commits) | New / Growing / Established / Core contributor. |
| **Climax forest** | Mature, stable ecosystem goal | Fully mature, self-sustaining project. |
| **Pioneer species / Succession stage / Biodiversity / Trophic level / Keystone species reintroduction / Assisted migration / Fire ecology** | Phase-2/3 metaphors | Early contributors / project maturity / contributor variety / role definitions / recruit domain experts / recruit across language communities / deprecation sprints. |
| **Metabolic rate** | Commit cadence | Commits per day. |
| **Predator resilience** | Security-posture score | Security score. |

---

## 9. Meta / Process

### Merkle-proof / Merkle-tracked / audit-friendly
Plain English: *every state change produces a cryptographic hash that chains
to the previous one. You can verify the full history at any point; any
tampering is detectable.*

### Lazy consensus (`GOVERNANCE.md`)
Standard open-source governance term. Plain English: *if no one objects
within a defined window, the change is accepted.*

### Dependabot / CodeQL / Codecov
Standard GitHub tooling. Not MCOP-specific.

---

## 10. Code aliases added alongside original names

| Original export | Plain-English alias (non-breaking) |
| --- | --- |
| `NovaNeoEncoder` (class) | `ContextTensorEncoder` |
| `StigmergyV5` (class) | `SharedTraceMemoryV5` |
| `HolographicEtch` (class) | `ChangeAuditLogger` |
| `DialecticalSynthesizer` (class) | `HumanReviewRefinementLoop` |
| `PheromoneTrace` (interface) | `MemoryTraceRecord` |
| `ProvenanceMetadata` (interface) | `TraceabilityRecord` |

Both names resolve to the same construct. The plain-English aliases are
additive — existing consumers of the original names are unaffected.

---

## 11. Resolved items

The three open items previously listed here were resolved on **2026-04-26**:

- **MCOP expansion consolidated.** The canonical expansion is now
  **Meta-Cognitive Optimization Protocol** across every doc and package
  metadata file. See §1 for the historical variants table.
- **Contributor tiers labeled legacy.** The `Seedling / Sapling / Canopy /
  Keystone` tiers in `CONTRIBUTOR_ONBOARDING.md` now carry an explicit
  legacy-disclaimer banner pointing at `GOVERNANCE.md` for the operative
  contribution model. The tiers themselves are preserved for continuity with
  existing recognition (avatars, prior PRs, the all-contributors record).
- **Bootstrap Compression Kernel labeled conceptual.** Both this glossary
  (§7) and `docs/whitepapers/MCOP_Blueprint_Supplement_Volume_II.md` now
  explicitly mark the Bootstrap Compression Kernel as a conceptual component
  with no shipping counterpart in `src/core/`. None of the deterministic
  triad's functional guarantees depend on it.
