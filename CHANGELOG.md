# Changelog

All notable changes to this project will be documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased] — Automated Evidence Retrieval & Guardian v0.2

### Changed
- **Python `mcop` 4.0 now ships the flagship Deterministic Triad.** The PyPI
  distribution exports `NovaNeoEncoder`, `StigmergyV5`, and
  `HolographicEtch` alongside the established reasoning engine, with an
  explicit `TRIAD_PROTOCOL_VERSION = "2.4.0"`. Cross-language fixtures now
  execute the public npm build and Python APIs over hash, embedding,
  calibration, growth-ledger, optional-field, and Unicode edge cases. The
  package release line is intentionally independent from the triad protocol
  version.
- **Byte-identity as the headline claim — identical cognition state across four
  runtimes.** Reframes the reproducibility story away from ops/sec (which invites
  hardware quibbles) to the property a referee can falsify in ninety seconds: the
  cognition-state digest `SHA-256(RFC-8785-canonical-JSON(payload))` — the
  substrate under every MCOP provenance hash — is byte-identical across **Node
  `crypto`, a portable pure-JS SHA-256, WebCrypto `subtle`, and Python
  `hashlib`**. A shared fixture (including the signed-zero / `1e21` / non-BMP
  serialisation edge cases where naive JSON diverges) is pinned by a Python
  golden (`tests/parity/byteIdentity.golden.json`), checked through three JS
  runtimes in `src/__tests__/byteIdentity.test.ts` and from Python in
  `mcop_package/tests/parity/test_byte_identity_parity.py`, and reported in the
  emitted `docs/benchmarks/byte-identity-manifest.json` (`allRuntimesAgree:
  true`, one `consensusRoot`). New headline preprint
  `docs/benchmarks/preprint/byte-identity.md`; the existing throughput paper is
  demoted to a secondary result. This is the credibility anchor under the D2
  receipts and the D4 film — both publish digests that this proves reproduce
  everywhere.
- **The provenanced film — the credits are a root hash.** A long-form generated
  film can now ship with a verifiable **provenance sidecar**: every shot is
  Merkle-traceable to its prompt, seed, adapter call, and — via the
  orchestrator's existing **Direct Forcing** loop — the fingerprint of the
  previously generated clip it conditioned on. New `filmProvenance` module
  composes the `longFormVideoOrchestrator` with the D2 Merkle Mountain Range:
  each shot is an MMR claim whose record cryptographically seals the Direct
  Forcing edge (`priorFingerprintDigest`) and the chain (`priorShotLeaf`), so a
  viewer's browser verifies both **membership** (`O(log n)` per shot against one
  `creditRoot`) and **lineage** (each shot really conditioned on the prior
  clip's real output). `LongFormVideoOrchestrator.generate` takes
  `recordFilmProvenance` and returns a `filmSidecar`; an interactive
  [`/film`](src/app/film) page lets a viewer fold the proofs and watch the
  lineage break on edit; the lunar-documentary sidecar ships at
  `public/films/lunar-documentary.provenance.json`. The Direct Forcing loop now
  does cryptographic work, not ceremony. **Trust boundary, stated on the page:**
  a verified film proves it was assembled as recorded — not that the footage is
  real or that a prompt's provenance is the training data's. Provider-agnostic
  (Vidu/Kling/Higgsfield/Wan plug into the same `VideoClipAdapter`); non-breaking
  (sidecar omitted unless enabled). See `docs/PROVENANCED_FILM.md`.
- **Free-energy-governed graph-of-thought — physical halting, not administrative.**
  `PGoT` no longer stops expanding only at `maxFanout`/`maxDepth`. A new
  `freeEnergyGovernor` wires the existing `ThermoTruthKernel` into the expansion
  decision: treat the thought set as a thermodynamic ensemble (`U` = per-node
  budget, `S` = Shannon entropy over quantized configuration vectors, `T` =
  equipartition temperature `(2/3)σ²`), and **admit a thought only when it lowers
  the ensemble's Helmholtz free energy `F = U − T·S`; halt when ΔF plateaus** —
  equilibrium with the evidence. The curiosity bonus becomes *literal
  temperature* (an additive offset on `T`): hotter ⇒ more exploration.
  `PGoT.governedExpand` applies it, with `maxFanout`/`maxDepth` kept as hard
  safety caps. **Falsifier (standing test):** on a 4-cluster pool ΔF-governance
  reaches full coverage at cost 3 while fixed fanout is stuck at 2/4 clusters by
  cost 5 (`docs/benchmarks/free-energy-frontier.json`). **Honest dependency,
  enforced in code:** under the hash backend the configuration variance is
  near-constant (~13% temperature range vs ~42% for embeddings), so `T`
  degenerates and `F` collapses to `U`; `assessFreeEnergySignal` measures this
  and `governExpansion` falls back to administrative limits with a reason string
  rather than pretending. Free-energy governance needs the embedding backend.
  Derivation and trust boundary in `docs/FREE_ENERGY_GOVERNOR.md`.
- **Verifiable reasoning receipts — provenance you fold, not trust.** A
  reasoning session can now be committed to an append-only **Merkle Mountain
  Range** instead of replayed as a linear hash chain: proving one claim belongs
  to the session drops from **O(n) replay** of the whole transcript to an
  **O(log n)** inclusion proof a few kilobytes wide. Every claim carries a
  self-contained `ReasoningReceipt` (`{ claim, leafEntry, proof, root, … }`)
  that a reader's browser verifies **locally** — recomputing each leaf digest
  and folding each proof to one published root with the same portable SHA-256
  the encoder runs in-browser. Leaf = RFC 8785 canonical digest; tree = RFC 6962
  (`0x00`/`0x01` domain separation), so a power-of-two session's root is
  bit-for-bit identical to the existing parity-locked `merkleRoot`. New module
  `reasoningReceipts` (`src/core` + `packages/core` mirror + Python
  `mcop.reasoning_receipts`), an interactive reader-as-verifier page at
  [`/verify`](src/app/verify), and a published bundle
  `public/receipts/d1-calibration.json`. A self-describing `epoch` marker guards
  future migrations (verifiers fail closed on an unknown epoch); the change is
  additive, so the existing linear provenance chain is unaffected. **Trust
  boundary, stated plainly:** a receipt proves a claim was committed to a given
  root unaltered — not that the claim is true or the reasoning wise. Derivation
  in `docs/VERIFIABLE_RECEIPTS.md`; cross-runtime byte-identity pinned by
  `src/__tests__/reasoningReceiptsParity.test.ts` and
  `mcop_package/tests/parity/test_reasoning_receipts_parity.py`.
- **Calibrated resonance: the magic `0.65` threshold is gone.** When no
  explicit `resonanceThreshold` is configured, `StigmergyV5` now derives its
  base threshold in closed form from the encoder's unrelated-text null model:
  τ(M, α, n) = Φ⁻¹((1−α)^(1/n)) / √M, where M is the effective tensor
  dimensionality (saturating at 32 for the SHA-256 hash backend, whose tiling
  adds no information), n the trace-buffer capacity, and α the false-resonance
  budget (default 1%). For the stock configuration this yields τ ≈ 0.7816.
  **Finding:** under the same null model the legacy `0.65` admitted a 21.5%
  per-query false-resonance rate at full default-buffer occupancy (Gaussian
  bound; ≈ 5.6% measured by Monte Carlo with real SHA-256 tensors) — spurious
  matches the temporal-pheromone layer then reinforced. Explicit
  `resonanceThreshold` / numeric `adaptiveThreshold` configurations are
  unaffected, and the adaptive calibrator still takes over after 3 traces.
  Derivation, reproduction script, and migration notes in
  `docs/RESONANCE_CALIBRATION.md`; constants pinned in
  `src/__tests__/resonanceCalibration.test.ts`.
- **Relicensed to Apache License 2.0 (open source).** The project moved
  from the source-available Business Source License 1.1 to the
  OSI-approved **Apache License 2.0**. As the sole copyright holder, the
  Licensor (Kevin John Kull) issued these broader terms; the move only
  adds permissions relative to BUSL 1.1. The root `LICENSE` and the
  `packages/core/LICENSE` / `mcop_package/LICENSE` mirrors now contain
  the verbatim Apache-2.0 text; `package.json`, `packages/core/package.json`,
  `mcop_package/pyproject.toml`, and `CITATION.cff` advertise `Apache-2.0`;
  SPDX headers across `src/`, `scripts/`, and tests switched from
  `BUSL-1.1` to `Apache-2.0`; and `NOTICE.md`, `README.md`,
  `CONTRIBUTING.md`, `public/llms.txt`, and the license guard were updated
  accordingly. Versions originally released under MIT remain available
  under MIT (`LICENSE-MIT-LEGACY`); the integration shims remain MIT
  (`LICENSE-MIT-INTEGRATIONS`). See `NOTICE.md` for the full history.

### Added
- **`resonanceCalibration` module — closed-form noise floors as a public API.**
  `analyticThreshold(M, {alpha, candidates})`, `falseResonanceRate`,
  `effectiveTensorDimensions`, and dependency-free `normalCdf` /
  `inverseNormalCdf` (Acklam) are exported from both `src/core` and
  `packages/core`, alongside a new `StigmergyConfig.noiseFloor` block
  (`alpha`, `backend`, `tensorDimensions`, `candidates`) for tuning the
  calibration per deployment.
- **Dual-key traces — cryptographic identity and semantic locality as
  orthogonal axes of one sealed object.** `recordTrace(..., { semanticContext })`
  binds an optional embedding tensor under the same RFC 8785 canonical digest
  as the hash tensor, and `getResonance(query, { keyspace: 'semantic' })`
  recalls along the semantic axis (skipping single-key traces) while
  `'context'` remains the exact-match/integrity axis. Traces recorded without
  a semantic key keep digests byte-identical to v5, so existing chains,
  golden fixtures, and TS↔Python parity are untouched. See
  `docs/RESONANCE_CALIBRATION.md`.
- **`EpistemicState.ERROR` — exception paths as first-class epistemic objects.**
  The Python engine's mycelial chaining loop (`MCOPEngine._build_chains`) now
  wraps each refinement iteration: a failure in any reasoning-mode callback or
  in evidence gathering no longer aborts the whole solve. The offending
  hypothesis is promoted to the new `EpistemicState.ERROR` state, the exception
  is captured as structured `metadata['error']` (type, message, iteration), and
  the chain is closed gracefully. `ReasoningChain.get_active_hypotheses` and
  grounding aggregation now exclude both `PRUNED` and `ERROR` hypotheses via the
  shared `INACTIVE_STATES` set. The `GuardianMetaReasoner` escalates any chain
  containing an errored hypothesis to `REQUIRES_HUMAN_REVIEW`, and
  `MCOPEngine.solve` rolls per-chain Guardian verdicts into a solution-level
  `metadata['guardian']['chain_summary']` and surfaces the escalation in
  `key_uncertainties`. Robustness becomes a measurable, auditable signal rather
  than a lost stack trace. See `tests/test_engine_robustness.py`.

### Fixed
- **Diversity-preservation mode leak (turned into a measurable Diversity
  Ledger).** `MCOPEngine._preserve_diversity` seeded its `modes_seen` set only
  from the top chain and never recorded the modes of chains kept while filling
  the `min_alternatives` quota, so a second chain of an already-preserved mode
  could slip past the diversity gate — silently defeating the anti-anchoring
  guarantee. Every preserved chain's mode is now recorded. Rather than stop at
  a patch, the corrected behaviour is elevated into a first-class epistemic
  signal: a **Diversity Ledger** on `solution.metadata['diversity']`
  (`mode_coverage`, `distinct_modes`, normalised `diversity_index`, and an
  `anchoring_risk` flag), with a low-diversity outcome surfaced as an explicit
  `key_uncertainties` badge — the same "measure, surface, never silently drop"
  contract the Guardian applies to grounding. See
  `tests/test_engine_robustness.py`.
- **Context isolation across reused `MCOPContext` instances.** `MCOPEngine.solve`
  now defensively re-initialises a context's per-call working state (hypotheses,
  chains, evidence pool, iteration cursor) when the same context is passed to a
  second solve, preventing cross-call state leakage and double-counted grounding.
  The first use of a pre-populated context is left untouched.
- **Evidence de-duplication during synthesis.** `_synthesize_solution` now keys
  collected evidence by `Evidence.id` (falling back to a `(content, source)`
  pair), so the same retrieved item reused across iterations/chains is no longer
  double-counted in the solution's `evidence_chain`.
- **Removed dead `avg_confidence` computation** in `_synthesize_solution` and
  hardened `_select_alternative_mode` against modes outside the canonical
  rotation (falls back instead of raising `ValueError`).

- **Conformance + approved-changeset gates enforced in CI.** The conformance
  suite is now a required `Conformance spec` job in `ci.yml` (`pnpm
  conformance:test`), and a new `Approved Changeset Gate` workflow
  (`.github/workflows/approved-changeset.yml`) validates that every PR head is a
  provably-approved, content-bound changeset: it rebuilds the changeset from the
  PR diff, resolves required owners from `.github/CODEOWNERS`, ingests the PR's
  review approvals, and runs the env-gated `approvedChangesetGate.ci` test
  (`pnpm changeset:gate`). The gate is the content-binding safety net GitHub
  misses — it passes when an owner approval is bound to the current head or the
  PR is simply awaiting review (merge stays gated by branch protection), and
  fails only on an integrity violation: a stale approval (owner approved an
  earlier commit, then the diff moved) or a tampered manifest. Turns the
  advance-#4 gate from a library into enforced policy. See
  `docs/CONFORMANCE_SPEC.md` → "Enforced in CI".
  Also relocates the hot-path golden fixture from `tests/parity/` into
  `src/conformance/` so the production conformance contract's import resolves
  inside the Docker / Next build context (which excludes `tests/`) — fixing a
  `pnpm run build` failure in the container introduced with advance #4.
- **Conformance spec + approved-changeset gate (`src/conformance/`).** Directly
  attacks the Bus-Factor-1 risk by making the framework checkable instead of
  trusted. `runConformanceSuite` runs the deterministic contracts any
  reimplementation/second maintainer must satisfy — canonical-digest determinism,
  hot-path TS↔Python parity, hot-path provenance shape + replayable root, and the
  approval gate — sealing a Merkle-rooted `ConformanceReport`. The
  **approved-changeset gate** (`validateApprovedChangeset`) turns "a human
  approved it" into a content-bound record: a changeset is a content-hashed file
  manifest rolled into one `changesetHash`; an approval binds to that exact hash;
  validation recomputes from the files and yields `approved` / `tampered` /
  `stale-approval` / `self-approval-rejected` / `insufficient-approvals`, so
  approving-then-editing is detectable offline. Required owners resolve from the
  real `.github/CODEOWNERS` so the gate cannot drift from the GitHub-enforced
  rule. See `docs/CONFORMANCE_SPEC.md`. Covered by `codeowners.test.ts`,
  `approvedChangeset.test.ts`, and `conformanceSuite.test.ts`. Completes the
  four-advance roadmap (#770–#774 + this).
- **Hot-path unification (`src/hardware/hotPathRouter.ts`).** Routes all five
  hot-path operations — encode, recall, etch, evolve, and homeostasis — through
  one provenance-attached accelerator boundary, instead of each living in its
  own module with an uneven accelerator story. `HotPathRouter.dispatch` routes
  to the wired CUDA `Accelerator` when present, or runs a deterministic CPU
  reference kernel (a byte-for-byte port of `mcop_cuda_server/kernels.py`),
  attaches uniform `AcceleratorProvenance` to every result, and appends a
  Merkle-chained entry to one hot-path log (`getProvenanceLog` /
  `getHotPathRoot` / `getStats`). The chain root is built from deterministic
  fields only, so it replays identically across runs. Cross-runtime parity is
  enforced by a golden fixture generated from the Python reference
  (`tests/parity/hotPathKernels.golden.json` via
  `generate_hotpath_fixtures.py`). This is the single boundary the forthcoming
  conformance spec will pin. See `docs/HOT_PATH_UNIFICATION.md`. Covered by
  `hotPathParity.test.ts` and `hotPathRouter.test.ts`.
- **Temporal dynamics for Stigmergy (`src/core/temporalStigmergy.ts`).** Adds the
  two forces the stigmergy metaphor was missing: pheromone **evaporation** (a
  deposit decays with a configurable half-life, `strength = max(floor, deposit ·
  2^(−Δt/halfLife))`) and **reinforcement** (re-traversal decays-to-now then tops
  the trail up, saturating at a cap). A deterministic `PheromoneLedger` layers
  beside the Merkle-sealed trace chain without touching trace hashes, so
  provenance is unchanged. `StigmergyV5` integrates it **opt-in** (`temporalDynamics:
  { enabled: true, … }` + an injectable `now` clock): `recordTrace` deposits,
  `getResonance` reinforces the matched trail and reports `pheromoneStrength`,
  and `getResonantRecent` folds strength into the ranking so a stale trail sinks
  below an equally-similar fresh one. New API: `isTemporalEnabled`,
  `getPheromoneStrength`, `reinforceTrace`, `pruneFadedTraces`, `getTemporalStats`.
  With dynamics disabled the v5 surface is byte-for-byte unchanged. See
  `docs/TEMPORAL_STIGMERGY.md`. Covered by `temporalStigmergy.test.ts` and
  `stigmergyTemporal.test.ts`.
- **Fast control loop (`src/control/`).** Closes the feedback loop the CUDA
  kernels only sketched: the `homeostasis` op was an actuator and `evolveScore` a
  sensor, but the pull-back ran open-loop at a fixed genome-set gain, with no
  fast correction between the slow `NovaEvolveTuner` meta-tunes. `FastControlLoop`
  adds the missing inner controller — a deterministic, anti-windup `PIDController`
  with derivative-on-measurement — that each tick observes the substrate
  (`equilibriumScore`), computes a control effort, and actuates the homeostasis
  pull-back, Merkle-sealing every tick. It classifies the trajectory
  (`converged` / `oscillating` / `diverging` / `saturated` / `unsettled`) into an
  auditable verdict. `controlTargetsFromGenome` couples the slow genome to the
  fast loop's setpoint and gains; a `ProteomeControlPlant` drives the real
  150-node substrate, and a `FirstOrderPlant` makes the control-theory behaviour
  analytically verifiable. See `docs/FAST_CONTROL_LOOP.md`. Covered by
  `pidController.test.ts`, `fastControlLoop.test.ts`, and
  `proteomeControlPlant.test.ts`.
- **Pre-registered, multi-rater, held-out efficacy program (`src/efficacy/`).**
  The first framework signal that measures whether the cognitive machinery
  produces *better reasoning* rather than *better-attested* reasoning — and one
  the `NovaEvolveTuner` structurally cannot optimise against. A sealed
  pre-registration (canonical hash, frozen before results) defends against
  HARKing; a capability-gated `HeldOutVault` plus a leakage scan over the
  tuner's observed trace stream defends against train-on-test; multiple blinded
  raters gated by Krippendorff's alpha defend against single-judge bias; and a
  distribution-free effect size (Cliff's delta, Hodges–Lehmann, a seeded
  bootstrap CI, Mann–Whitney U) decides the hypothesis. `runEfficacyProgram`
  emits a Merkle-sealed, replayable `EfficacyReport`. See
  `docs/EFFICACY_PROGRAM.md`. Covered by `efficacyStatistics.test.ts`,
  `interRaterReliability.test.ts`, and `efficacyProgram.test.ts`.
- **v2.4 release-readiness and operator artifacts.** Added
  `docs/releases/v2.4.0.md`, `docs/SEVEN_LAYER_MAPPING.md`,
  `docs/api/orchestrator.md`, Drift Sentinel / Guardian Grafana and Datadog
  dashboard templates, an external benchmark replay manifest template, and a
  public CUDA kernel manifest mirror under `docs/cuda/kernels-manifest.json`.
- **Reference CUDA ONNX artifacts.** Committed deterministic
  `models/mcop_*.onnx` reference kernels plus `models/manifest.json` from
  `scripts/export_cuda_kernels/export.py --backend reference`, closing the
  inventory gap while keeping real-GPU production status gated on the 1,000-step
  verified-device soak.
- **Seven-layer routing export.** Added `SEVEN_LAYER_ROUTING` and
  `getSevenLayerRouting()` in both the app core and `@kullailabs/mcop-core`
  package surface.
- **Verification Quality (Phase 3) — substrate-driven stacked recursion.** New
  `src/audit/verificationQuality.ts` (`assessVerificationQuality`) mutation-tests
  the Phase 2 verifier with the Proteome substrate as the adversarial driver: a
  `ProteomeOrchestrator` seeded from the attestation runs at the edge of chaos
  and its per-step Merkle stream schedules a spread of forgeries (corrupt etch /
  growth / Merkle / substrate hash, flipped metric, forged or dropped citation,
  perturbed input). The verifier must reject every one; `qualityScore` =
  sensitivity (fraction caught) gated by the genuine attestation still verifying,
  with any `missed` perturbation surfaced as a verifier blind spot. `pnpm
  positive:quality` is the CI gate (wired into `.github/workflows/ci.yml`).
  Proven deterministic and sensitivity-1.0 by
  `src/__tests__/verificationQuality.test.ts`. The substrate now actively drives
  the evaluation of the verification's discriminating power — measured (P1) →
  verifiable (P2) → verifier-validated (P3).
- **Positive-Impact Verifier (Phase 2) — falsifiable recursion.** New
  `src/audit/positiveImpactVerifier.ts` (`verifyPositiveImpact`,
  `buildAttestation`) replays a committed attestation
  (`audit/positive-impact-attestation.json`) through the real MCOP primitives
  and asserts every cited etch hash, growth Merkle root, Proteome substrate
  root, and metric reproduces byte-for-byte (only the wall-clock `generatedAt`
  is excluded). `pnpm positive:attest` regenerates the committed drift-lock
  fixture; `pnpm positive:verify` is the CI gate (wired into `.github/workflows/ci.yml`)
  that fails if a kernel's scoring math drifts or cited evidence is edited
  without regenerating. Tamper detection (metric / etch hash / substrate root /
  recorded input) is proven by `src/__tests__/positiveImpactVerifier.test.ts`.
  This turns the Phase 1 citations from descriptive into machine-verifiable
  evidence, matching the repo's falsify-first ethos.
- **Impact Auditor (Phase 1) — operational positive-impact recursion.** New
  `src/audit/impactAuditor.ts` (`auditPositiveImpact`) routes the live
  `pnpm positive:audit` verification results through the framework's own
  kernels: NOVA-NEO encodes each check, `HolographicEtch` scores it as a
  eudaimonic etch (flourishing score + propagation hint + citable canonical
  hash), `PositiveResonanceAmplifier` records each as a Merkle-chained growth
  event and *derives* the contributor-joy / adoption-velocity /
  beneficial-outcome metrics (replacing the previous hand-written formulas), and
  a `ProteomeOrchestrator` substrate — its `homeostasis`/`mutationTemperature`
  knobs conditioned by the audit pass ratio — emits an equilibrium-stability
  signal. `scripts/positive-audit.mjs` now feeds the live matrix through the
  auditor (executed via Jest, mirroring `benchmark:refresh`) and renders
  `docs/POSITIVE_IMPACT_REPORT.md` with a **MCOP kernel citations** table listing
  the exact scoring-event hashes and Merkle roots each metric was generated from.
  The auditor is deterministic given its inputs (timestamps never feed a hash or
  metric), proven by `src/__tests__/impactAuditor.test.ts`. This makes the
  README's positive-impact claim operational evidence rather than aspiration.
- **Drift Sentinel Kernel.** New `src/core/driftSentinelKernel.ts` is a
  first-class MCOP module that continuously computes
  `Δ(T_d, B_e)` (cosine distance between the declared-task tensor and
  the mean ensemble-behavior tensor) with tunable sensitivity. Severity
  is classified against a Welford-online rolling baseline
  (`μ + sigmaMultiplier·σ`) plus a hard `criticalCeiling`. Flagged
  events queue as stigmergic signals for the StigmergyV5 /
  HolographicEtch continuous-learning loop, the kernel exposes a
  Divergence Telemetry snapshot (counts, rolling baseline, Δ histogram,
  chain head) for corpus-health dashboards and risk indexing, and every
  event is Merkle-linked (`parentHash → hash`, RFC 8785 canonical
  digest) so `rewindFlagged()` and `verifyChain()` can replay back to
  the exact reasoning step where divergence crossed threshold. Scope is
  deliberately narrow — indirect-injection drift only — and called out
  in [`docs/features/drift-sentinel-kernel.md`](./docs/features/drift-sentinel-kernel.md).
- **v2.4 Proteome layer + LS20 ARC scaffold.** New
  `src/proteome/ProteomeOrchestrator.ts` introduces a 150-node sparse
  interaction graph with replicator-dynamics payoffs, homeostatic
  pull-back, and Gaussian state mutation. Each step routes through
  `CUDAHardwareLayer.accelerate('graphAggregate', ...)` when the
  in-process layer is enabled, inheriting the Φ4 verifiedDevice gate
  + Φ5 `resolvedFrom` audit. `NovaEvolveConfig` gains a `homeostasis`
  knob and `NovaEvolveTunerDeps.proteome?` slot so accepted
  meta-tune mutations to `(homeostasis, mutationTemperature)`
  propagate to the substrate on the same tick. New
  `scripts/benchmark-arc-ls20.mjs` (schema `mcop-arc-ls20/1.0`,
  pinned seed `0xC0FFEE`) measures pre- vs post-proteome solve-rate
  on a 20-task LS20 hard subset; smoke-mode JSON committed under
  `docs/benchmarks/arc_ls20.json`. Dedicated
  `.github/workflows/cuda-smoke.yml` matrix job exercises the CUDA
  + proteome substrate across `MCOP_ENABLE_CUDA=auto` and
  `MCOP_ENABLE_CUDA=0` on `ubuntu-latest`. Full design rationale
  lives in [`docs/PROTEOME_LAYER.md`](./docs/PROTEOME_LAYER.md).
- **May 2026 audit execution ledger and guardrails.** Added `docs/audits/audit-execution-ledger-2026-05.md`, `docs/RELEASE_PLAYBOOK.md`, PR checklist enforcement, workflow hygiene verification, Node 22/24 CI runtime guardrails, and a Python package metadata parity test so audit findings become reviewable, test-backed outcomes.
- **`mcop.evidence_retrieval`** (Python). New `EvidenceRetriever` abstract
  base + deterministic `InMemoryEvidenceRetriever` and
  `CompositeEvidenceRetriever` backends. The engine now calls into an
  attached retriever from `_gather_evidence`, drastically reducing the
  manual overhead of populating `Hypothesis.evidence`. See
  [`docs/features/automated-evidence-retrieval.md`](./docs/features/automated-evidence-retrieval.md).
- **`mcop.guardian`** (Python) and `src/utils/guardianMetaReasoner.ts`
  (TypeScript). The Guardian v0.1 calibration surface is promoted to an
  active `GuardianMetaReasoner` that audits hypotheses, chains, and
  solutions against a **configurable grounding threshold (minimum 0.70 in
  strict mode)**. Verdicts attach to artefact metadata; below-floor
  solutions surface a `Guardian contested (…)` entry in
  `key_uncertainties`. Strict mode rejects sub-floor thresholds at
  construction time.
- **TypeScript `InMemoryEvidenceRetriever` + `CompositeEvidenceRetriever`**
  in `src/utils/evidenceRetriever.ts` mirror the Python contract so
  front-end and Node-side consumers can request evidence without a
  cross-runtime hop.
- **`CouncilScorer.score()` now accepts `{ retriever, guardian }`** in its
  options, lifting the grounding dimension with retrieved similarity and
  emitting a Guardian verdict alongside the composite score. Ratified
  composite scores are downgraded to contested when the Guardian flags
  `requires_human_review`, preserving human primacy.

### Changed
- **`MCOPConfig.grounding_threshold` default 0.40 → 0.70** to align the
  engine's pass/fail bar with the Guardian floor. Callers that need the
  old behaviour can either pass `grounding_threshold=0.40` plus
  `enable_guardian=False`, or supply a non-strict `GuardianConfig`.
- **`ReasoningChain` now carries a `metadata` dict** so Guardian verdicts
  (and future per-chain annotations) have a stable home without a
  separate side-channel.
- Python package version bumped to `mcop==3.3.0`.

### Human-Primacy Invariants Preserved
- Retrieved evidence is *appended* to hypotheses; it never overwrites a
  human-supplied Evidence item.
- The Guardian never silently mutates an artefact: it writes its verdict
  to metadata and surfaces deficits as explicit `key_uncertainties`.
- `GuardianConfig(strict_mode=True)` refuses sub-floor thresholds — the
  0.70 minimum is the framework's contribution to evidence hygiene, not
  a knob to be tuned away by default.

## [2.3.1] - 2026-05-07 — mapping_grok Production Patch

### Added
- Promoted `mapping_grok` to the default xAI/Grok production profile with model mappings, rate-limit retry metadata, and MCOP dispatch hooks.
- Added `pnpm benchmark:arc-evo` for the public 25-task ARC-style NOVA-EVOLVE + meta-tuning validation split.
- Added a copy-ready public demo/discussion draft for the near-zero-latency ARC-EVO run.

### Changed
- Default orchestrator config now enables the NOVA-EVOLVE-TUNER and pins the 25-task validation split for v2.3.1 reproducibility.
- Repository/package discovery metadata now includes `arc-agi`, `meta-cognitive`, and `evolutionary-ai`.

## [2.3.0] - 2026-05-06 — Eudaimonic Bloom

### Added
- **NovaNeoWeb / UniversalEncoder.** The NOVA-NEO hash path now rests on a
  portable SHA-256 substrate, exposing a first-class browser/edge encoder while
  preserving byte-identical deterministic tensors.
- **ResonantRecentQuery.** Stigmergy recency can now rank high-resonance traces
  while softly lifting low-resonance domains with a bounded curiosity bonus.
- **SelfHealingDimension.** Hashing-trick embeddings heal invalid dimensions to
  the nearest safe power-of-2 and expose an auditable healing event.
- **EudaimonicEtch.** Accepted etches carry additive `flourishingScore` and
  `propagationHint` metadata (`seed`, `bloom`, `radiate`) without changing the
  canonical hash payload.
- **Positive evolution dossier.** `POSITIVE_EVOLUTION.md` records the audit map,
  replacements, and flourishing impact statement for this release.

### Positive Building
- **Positive Building of safe recency.** `CircularBuffer.recent(limit)` now treats negative limits as empty safe
  queries instead of attempting a negative array allocation.
- **Positive Building of dimensional growth.** `HashingTrickBackend.encode()` transforms direct `dimensions <= 0` calls into
  auditable, safe power-of-2 tensor dimensions.
- **Positive Building of growth-ledger provenance.** `PositiveResonanceAmplifier` records joyful audit remediation as
  Merkle-chained events and powers the Positive Impact Report badge.
- **Positive Building of beneficial memory.** Stigmergy v5 now includes Positive Feedback Hysteresis via `growthBias`
  so high-resonance beneficial patterns become more visible while raw cosine traces remain intact.
### Fixed
- `CircularBuffer.recent(limit)` now treats negative limits as empty safe
  queries instead of attempting a negative array allocation.
- `HashingTrickBackend.encode()` no longer risks modulo-zero bucket selection
  when called directly with `dimensions <= 0`.

### Changed
- README performance numbers are explicitly labeled as deterministic benchmark
  baselines with the regeneration command, replacing ambiguous public claims
  with replayable evidence.
- Architecture docs clarify that P_GoT planning and long-form video are
  extension blooms over the deterministic triad, not replacements for core
  invariants.

## [2.2.1] - 2026-05-03
- Lowered default confidenceFloor 0.8→0.65 + exposed adaptiveThreshold + curiosityBonus (Claude Code v2.2.1 sprint)

## [Unreleased]

### Deprecated
- **Freepik adapter — concrete removal timeline set.** `FreepikMCOPAdapter`
  (rebranded to Magnific on 2026-04-27) will be **removed in v3.0.0**
  (target 2026-Q3). The wrapper currently delegates to
  `MagnificMCOPAdapter` and emits a one-time console warning. Migrate now:
  rename imports, update endpoint paths to `/v1/ai/*`, and remove legacy
  `turbo` / `premium_quality` booleans. See `docs/adapters/MAGNIFIC_MIGRATION.md`
  for the full checklist. No new features will be added to the Freepik
  wrapper between now and removal.

## `@kullailabs/mcop-core` [0.2.1] — 2026-05-01

**npm package positive-building release — OIDC trusted-publishing validation release.**

`@kullailabs/mcop-core@0.2.0` was published manually from a maintainer
environment with a short-lived publish token (since rotated) to unblock
the v2.2.0 release cycle while the CI-side Node-version skew was being
diagnosed. As a result, **0.2.0 does not carry a Sigstore provenance
attestation** — the `dist.attestations` field on the registry is null
for that version.

`0.2.1` is a no-functional-change positive-building release (identical TypeScript
sources, identical compiled output) whose sole purpose is to validate
that `publish-npm.yml` after [PR #567](https://github.com/Kuonirad/MCOP-Framework-2.0/pull/567)
trust-publishes via OIDC end-to-end and re-establishes a Sigstore
provenance attestation for downstream consumers.

### Notes
- No source changes from `0.2.0` (TypeScript, ESM/CJS dist, type
  declarations are byte-identical modulo the version string in
  `package.json`).
- Framework `mcop` (Python, PyPI) is unaffected.
- Framework GitHub Release `v2.2.1` remains the canonical SBOM anchor
  for the v2.2.0 release cycle; `0.2.1` is covered by the same
  `mcop-core.cdx.json` (the dependency graph is unchanged).

## [2.2.1] — 2026-04-30

**Framework v2.2.1** — operational positive-building release: re-anchor the v2.2.0 release with
its CycloneDX SBOMs attached to the GitHub Release page, after the original
`v2.2.0` Release was lost to GitHub's Immutable Releases lock during the
post-publish SBOM-attach sequence. **No code changes from v2.2.0**; the
`mcop-framework.cdx.json` and `mcop-core.cdx.json` SBOMs attached to this
Release are byte-identical to the ones that would have been attached to
v2.2.0. Per-artefact registry versions remain unchanged
(`@kullailabs/mcop-core@0.2.0` on npm, `mcop@3.2.0` on PyPI).

### Fixed
- **GitHub Release page restored.** The framework v2.2.0 Release page was
  deleted in an attempt to flip its `immutable: true` flag so SBOMs could
  be attached. GitHub's API does not permit re-creating a release on a
  tag-name that previously had an immutable release attached
  (`tag_name was used by an immutable release`, HTTP 422). v2.2.1 is the
  successor anchor; the v2.2.0 tag (`5ff1b32…`) and `docs/releases/v2.2.0.md`
  are unchanged.

### Notes for downstream
- `pnpm sbom` and `pnpm sbom:validate` produce the same CycloneDX 1.7
  documents from the v2.2.0 commit as they do from the v2.2.1 commit
  (these commits differ only in this CHANGELOG entry and a new
  `docs/releases/v2.2.1.md`).
- The PyPI `mcop@3.2.0` registry entry remains the canonical 2026-04-30
  PyPI release; downstream auditors should pull the SBOMs from this
  framework v2.2.1 Release.

## [2.2.0] — 2026-04-30

**Framework v2.2.0** — supply-chain hardening, public benchmarks, expanded
test coverage. Ships alongside `@kullailabs/mcop-core@0.2.0` (npm) and
`mcop@3.2.0` (PyPI).

### Added
- **CycloneDX SBOM generation + schema validation in publish
  workflows.** `.github/workflows/publish-npm.yml` and
  `publish-pypi.yml` now run `pnpm sbom` + `pnpm sbom:validate`
  before publishing, then attach the two generated SBOMs
  (`mcop-framework.cdx.json` and `mcop-core.cdx.json`) to the GitHub
  Release via `softprops/action-gh-release@v2.6.2`. Closes Phase 2 ②
  of the post-audit roadmap; `docs/sbom/README.md` updated to drop
  the previous "Devin's GitHub OAuth lacks workflow scope" caveat
  and link directly to the workflow files.

- **Targeted branch-coverage tests for the four roadmap-flagged hot
  files** (`src/__tests__/coverage-gaps.test.tsx`, +14 cases).
  Addresses Phase 2 ① of the post-audit roadmap: lifts branch coverage
  on `usePerformanceCoach.ts` 67.85% → 89.28%, `useVSIPredictor.ts`
  74.07% → 81.48%, `DialecticalStudio.tsx` 79.36% → 84.74%, and
  `promptingModes.ts` 62.96% → 70.37%. Project-wide branch coverage
  rises 81.96% → 84.57% and project-wide line coverage rises 94.24% →
  96%. Genuinely-unreachable browser-only paths (real-Worker callback,
  `execCommand` clipboard fallback for non-secure contexts) are tagged
  with `/* istanbul ignore next */` and a one-line justification rather
  than tested through jsdom.
- **CycloneDX SBOM schema validation.** New `pnpm sbom:validate`
  script (`scripts/validate-sbom.mjs`) validates each generated SBOM
  against the official CycloneDX JSON schema bundled with
  [`@cyclonedx/cyclonedx-library`](https://www.npmjs.com/package/@cyclonedx/cyclonedx-library).
  The script auto-detects each SBOM's declared `specVersion` (1.0 –
  1.7) and exits non-zero on schema violations. Replaces the
  previously-suggested `@cyclonedx/cyclonedx-cli` recipe, which is not
  published to npm (the OWASP CLI ships as a Rust binary on GitHub
  releases). `docs/sbom/README.md` updated accordingly.
- **CycloneDX SBOM generation.** `pnpm sbom` runs
  [`@cyclonedx/cdxgen`](https://www.npmjs.com/package/@cyclonedx/cdxgen)
  (OWASP-maintained, pnpm-lockfile aware) against both the root
  `@kuonirad/mcop-framework` workspace and the publishable
  `packages/core/` (`@kullailabs/mcop-core`) workspace, emitting
  CycloneDX JSON SBOMs to `docs/sbom/*.cdx.json` (gitignored,
  regenerated on demand). Documented at `docs/sbom/README.md`,
  including the recommended one-line addition for the maintainer to
  attach SBOMs to GitHub releases. Pairs with the existing Sigstore
  provenance attestations from npm Trusted Publishing.
- **Runnable ONNX `IEmbeddingBackend` example** at
  `examples/onnx_embedding_backend.ts`. Demonstrates wrapping
  `onnxruntime-node` against an `all-MiniLM-L6-v2` ONNX export to
  produce 384-d sentence embeddings, mean-pooling over tokens, and
  projecting into MCOP's configured `dimensions` budget via
  signed-bucket folding so the rest of the triad needs no changes.
  Uses dynamic `import()` so the file typechecks and runs the
  fallback path even when `onnxruntime-node` is not installed —
  doubles as executable documentation. Header comment includes the
  exact `curl` setup commands.

- **pnpm workspaces.** `pnpm-workspace.yaml` registers `packages/*` so
  `packages/core/` (`@kullailabs/mcop-core`) is now a first-class workspace
  member, hoisted into a single shared `node_modules`. `pnpm install`,
  `pnpm -r typecheck`, and `pnpm --filter @kullailabs/mcop-core build` all
  work end-to-end. The Python sibling `mcop_package/` remains an
  independent PyPI project. See `docs/MONOREPO.md` for the full layout
  and intentional code-divergence map.
- **Shared-docs guardian** — `scripts/shared-docs-guard.mjs` (invokable
  via `pnpm docs:guard`). Hard-fails when the BUSL `LICENSE` text drifts
  between root, `packages/core/`, and `mcop_package/`. Advisory-only
  reporting for `NOTICE.md` and `LICENSE-MIT-LEGACY` (legitimately
  divergent per-package).
- **Public benchmarks refresh CLI** — `pnpm benchmark:refresh` regenerates
  `docs/benchmarks/results.json` from `runPromptingBenchmark` against the
  canonical fixture. Existing test guards keep the snapshot reproducible
  in CI; the new script provides a one-line refresh affordance for
  fixture changes. The benchmarks page (`/benchmarks`) and methodology
  doc (`docs/benchmarks/methodology.md`) already wire this dataset.
- **TypeDoc API docs** — `pnpm typedoc` (root alias) generates static
  HTML for `@kullailabs/mcop-core` into `docs/api/core/` (gitignored,
  regenerable). `packages/core/typedoc.json` controls entry points and
  branding. See `docs/api/README.md` for local-generation +
  publishing-to-Pages instructions.
- **Coverage badge** — `pnpm coverage:badge` reads
  `coverage/coverage-summary.json` (Jest `json-summary` reporter) and
  writes a self-contained SVG to `docs/badges/coverage.svg`. README links
  to it. No external service (no shields.io, no Codecov) needed.

### Changed
- **Repo rename hygiene.** Updated all GitHub URLs, badges, clone
  instructions, sitemap entries, and package metadata to the canonical
  repository name `Kuonirad/MCOP-Framework-2.0`; the canonical identity now
  radiates directly through every contributor path. The published npm scope `@kullailabs/mcop-core` and the
  PyPI package `mcop` are unchanged so no consumer action is required.

### Added
- **NOVA-NEO Embedding Backend.** `NovaNeoConfig` now accepts `backend: 'hash' | 'embedding'`. The default `'hash'` preserves byte-identical v1.x behavior. The new `'embedding'` backend uses n-gram feature hashing (the "hashing trick") to produce vectors where semantically similar prompts have correlated activations — a zero-dependency, deterministic, cross-platform semantic encoder. See `src/core/embeddingEngine.ts` and `src/__tests__/novaNeoEncoder.embedding.test.ts`.
- **Independent Audit Response.** `docs/audits/independent-audit-response-2026-04-30.md` documents findings (316 `bolt-*` branches, bus factor ~1, florid terminology, unverified claims, scope creep risk) and registers remediation status for each. Includes a formal Scope Lock limiting core additions to the deterministic triad only.

### Changed
- **Docs consolidation: single canonical MCOP expansion.** Replaced the two
  historical variants ("Multi-Cognitive Optimization Protocol" in
  `ARCHITECTURE.md`, "Meta-Cognitive Operating Protocol" in
  `packages/core/`, `mcop_package/`, and the Python CLI/demo strings) with
  the canonical **Meta-Cognitive Optimization Protocol** across all
  documentation and package metadata. Identifiers, exports, package names
  (`@kullailabs/mcop-core`, `mcop`), wire formats, and the deterministic
  triad's behavior are unchanged — this is a prose-only change.
- **Contributor tiers labeled legacy.** `CONTRIBUTOR_ONBOARDING.md` now
  carries an explicit legacy-disclaimer banner above the
  `Seedling / Sapling / Canopy / Keystone` tiers, pointing at
  `GOVERNANCE.md` for the operative contribution and maintainer model.
  The tiers are preserved for continuity with prior recognition.
- **Bootstrap Compression Kernel labeled conceptual.**
  `docs/whitepapers/MCOP_Blueprint_Supplement_Volume_II.md` and
  `PLAIN_ENGLISH_GLOSSARY.md` §7 now mark the Bootstrap Compression Kernel
  / Algorithm as conceptual design vocabulary with no shipping counterpart
  in `src/core/` or `mcop_package/mcop/`. None of the deterministic-triad
  guarantees depend on it.
- **Glossary §1 and §11 rewritten.** §1 now states the canonical expansion
  up front and lists historical variants as a discoverability aid; §11
  ("Uncertainties / open items") becomes "Resolved items" reflecting the
  three changes above.

## [2.1.0] — 2026-04-19

### Added
- `release-drafter` workflow for automated, label-driven release-notes
  assembly on every merge to `main`.
- Scheduled `stale` workflow to prevent PR/issue backlog regression.
- `auto-close-bot-prs` workflow to consolidate duplicate automated PRs.
- `delete-merged-branches` workflow to keep the branch list clean after merge.
- `GOVERNANCE.md` documenting the maintainer roster, lazy-consensus decision
  model, release process, and security escalation path.
- `.github/FUNDING.yml` for GitHub Sponsors integration.
- Dedicated release-notes files under `docs/releases/`.

### Changed
- NovaNeoEncoder `estimateEntropy` rewritten with native `for` loops instead of
  `Array.reduce` / `Math.pow` for measurable throughput gains on large
  contexts.
- StigmergyV5 resonance search caches vector magnitudes (~O(N) speedup).
- Pino logger hardened with explicit `redact` array to suppress sensitive
  payloads in structured logs.
- CI pipeline migrated from npm to pnpm and pinned to SHA-addressed actions.
- README badge set replaced with CI / CodeQL / Releases / License /
  Contributors / Maintained — removed the obsolete eco-fitness and
  bus-factor badges that no longer reflect project state.

### Fixed
- `actions/upload-artifact` pinned to `@v4` (resolved broken SHA).
- CodeQL alert on sensitive data exposure in CLI logs.
- Accessibility: decorative icons marked `aria-hidden`, alt text tightened on
  File / Window / Globe icons in `src/app/page.tsx`.
- ESLint configuration reconciled with Next.js 15.5.

## [2.0.2] — 2026-04-09

### Added
- Crypto-strong (`crypto.randomUUID`) trace identifiers in StigmergyV5.
- Container health-check endpoint for Docker orchestration.
- Eco-fitness audit script (`npm run eco:audit`).

### Changed
- Security headers expanded (CSP, HSTS, frame-options).
- Docker base image pinned to a specific digest.
- Composite CI setup action extracted; checkout moved to workflow level to fix
  loading failure.

### Fixed
- CodeQL sensitive-logging alert in CLI utilities.
- `publish.yml` syntax error.
- `eco-fitness` math utility error.

## [2.0.1] — 2025-12-31

### Added
- `CONTRIBUTOR_ONBOARDING.md` — 30-minute runway for new contributors.
- `ROADMAP_TO_100.md` — historical aspirational roadmap (now archived).
- Automated eco-fitness scoring system and self-referential meta-trace.
- `package-lock.json` produced from dependency audit.

### Changed
- Dependency surface optimized and syntax errors resolved.
- CI actions bumped to v6 (`checkout`, `setup-node`, `codeql-action`,
  `upload-artifact`).
- `next` bumped from 16.0.10 to 16.1.0.

### Fixed
- Docs-button accessibility: removed fixed width, added hover/animation.
- Dark-mode icon visibility and responsive sizing.

## [2.0.0] — 2025-12-19

### Added
- Complete MCOP v3.1 reasoning engine.
- TypeScript orchestration frontend.
- Secure Docker & CI/CD automation.
- CodeQL, Trojan-source guard, and reproducible Makefile.
- Code of Conduct, SECURITY.md, and PR/issue templates.

### Changed
- Full documentation refresh (API, Usage, Architecture).
- Multi-domain reasoning surface (General, Medical, Scientific).
- Compliance with GitHub Community Standards.

## [1.x.x] — Internal prototypes

Early MCOP logic and triad experiments. Not publicly released.
