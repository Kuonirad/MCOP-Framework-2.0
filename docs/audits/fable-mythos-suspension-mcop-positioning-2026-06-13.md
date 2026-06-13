# Frontier-Capability Containment & MCOP's Honest Positioning

### *External-event audit + synthesis · Snapshot 2026-06-13 · Event: US export-control suspension of Claude Fable 5 / Mythos 5*

> **Scope.** This is an external-event analysis, not a self-audit of the MCOP
> kernels (for that, see [`meta-audit-2026-05-10.md`](./meta-audit-2026-05-10.md)).
> It exists to answer one question honestly: *given the June 2026 frontier-model
> suspension, what does MCOP actually contribute — and what does it not?* It
> deliberately does **not** assign MCOP a pass-score; assigning oneself precise
> grades one did not measure is exactly the circular self-grading this repo's own
> Guardian work was built to retire (see ADR
> [`2026-05-11`](../adr/2026-05-11-automated-evidence-and-guardian.md)). The
> falsifiable [Verification Matrix](#ix-verification-matrix) is the honest
> substitute.

---

## TL;DR

| Question | Finding | Confidence |
|---|---|---|
| Are the triggering empirics real? | **Yes.** Fable 5 + Mythos 5 were disabled globally on 2026-06-12 under a US export-control directive. Verified across the Anthropic primary statement and 5+ outlets. | High |
| Are MCOP's cited mechanisms running code or design? | **Running code.** Merkle provenance, reasoning receipts, Drift Sentinel, ThermoTruth, the audit-kernel family, and Guardian signing are all implemented and tested in this repo. | High (code-verified) |
| Does MCOP *prevent* the class of jailbreak that triggered the suspension? | **No** — and no output wrapper does; the capability lives in shared weights. | High |
| Then what *is* the honest pitch? | **Regulator-legible attestation + orthogonal trajectory-drift defense-in-depth.** It makes guardrail decisions inspectable and raises adversary cost; it does not make jailbreaks disappear. | Moderate (architectural) |

---

## I. First-Principles Reduction

Two separable questions are easy to fuse and must be cut apart:

- **Q1 — empirical:** Are the stated facts about the Fable 5 / Mythos 5 event true? *Checkable; checked below.*
- **Q2 — architectural:** Can MCOP-style verifiable cognition produce *better* guardrails than classifier-routing alone? *A design claim, contingent on which failure mode you target.*

Model a guardrail as `g(input, context, model_state) → {allow, modify, refuse, fallback}`. Four failure modes:

1. **False-negative (bypass)** — lets harmful capability through.
2. **False-positive (overblock)** — refuses benign requests.
3. **Opacity** — the decision is unauditable.
4. **Capability leakage** — latent ability surfaces despite declared policy.

The load-bearing structural fact: a model and its safeguard-lifted sibling are *the same underlying weights*; they differ in the **output-control wrapper**, not in capability. Therefore the guardrail is a **wrapper**, not a property of the model. That is precisely the surface a meta-cognitive layer like MCOP would attach to — and also the reason no wrapper can satisfy what an export-control directive implicitly demands: **removal**, not containment.

---

## II. Verified Empirics

All claims below were checked against live sources on 2026-06-13 (see [Sources](#sources)). The directive is dated 2026-06-12 (ET) by Anthropic and CNBC; some outlets date it June 13. The models launched 2026-06-09.

| ID | Claim | Type | Status | Note |
|---|---|---|---|---|
| C1 | Fable 5 routes cyber/bio/chem/distillation queries to a more-capable fallback; triggers in <5% of sessions, tuned conservative | Empirical | **Verified** | Over-breadth conceded by vendor |
| C2 | 1,000+ hrs external red-team pre-launch; 30+ known techniques; no *universal* jailbreak | Empirical (self-report) | **Verified, caveat** | "No universal" ≠ "no narrow" — a narrow one is now the issue |
| C3 | Guardrails skew false-positive / over-broad | Empirical | **Verified** | Consistent with <5% conservative trigger |
| C4 | US export-control directive → global suspension for **all** users, barring any foreign national (incl. the vendor's own foreign-national staff) | Empirical | **Verified, escalated** | This is a *kill switch*, not a calibrated gate |
| C5 | Bypass mechanism | Empirical | **Partial / reported** | Reported as a multi-agent "pack hunt": decomposition across coordinated agents + narrative framing + Unicode tricks, yielding exploit guidance and a leaked system prompt. Vendor disputes severity; specifics are secondary-sourced |

**Vendor position (verified):** complying with the directive while publicly disputing the rationale — arguing the surfaced vulnerabilities are minor, already discoverable via other deployed public models, and that recalling a model over a narrow potential jailbreak would, generalized, halt all frontier deployment.

**Peripheral claims not independently verified here** (and not load-bearing for the thesis): a specific IPO valuation figure and a named competitor model version. Treat as uncorroborated in this document.

---

## III. Repo Reality Check — the mechanisms are running code

The prior framing left "do MCOP's mechanisms exist as code or only as design?" as an open revision trigger. Resolved here by reading the source, not the claims:

| Mechanism | Where | Evidence it is real | What it actually proves |
|---|---|---|---|
| **Merkle provenance** | [`src/provenance/merkleTree.ts`](../../src/provenance/merkleTree.ts) (151 LOC) | RFC 6962 (Certificate-Transparency) tree, `0x00`/`0x01` domain separation; **byte-identical** Python twin (`mcop_package/mcop/merkle.py`) locked by cross-runtime golden tests | Tamper-evident inclusion proofs (`claim ∈ session`), O(log n) audit paths |
| **Reasoning receipts** | [`src/core/reasoningReceipts.ts`](../../src/core/reasoningReceipts.ts) (491 LOC) · [`docs/VERIFIABLE_RECEIPTS.md`](../VERIFIABLE_RECEIPTS.md) | Append-only Merkle Mountain Range; few-KB receipts a browser verifies against a published root | A claim was committed to session root `R`, unaltered since |
| **Drift Sentinel** | [`src/core/driftSentinelKernel.ts`](../../src/core/driftSentinelKernel.ts) (395 LOC) · test (121 LOC) · [`docs/features/drift-sentinel-kernel.md`](../features/drift-sentinel-kernel.md) | Computes `Δ(T_d, B_e)` between declared-task and observed-behavior embeddings; σ-based dynamic threshold; Merkle-linked rewind | Visible task-behavior drift, escalation hints (see §IV for the honest scope) |
| **ThermoTruth** | [`src/core/thermoTruthKernel.ts`](../../src/core/thermoTruthKernel.ts) (408 LOC) · test (157 LOC) · [`docs/FREE_ENERGY_GOVERNOR.md`](../FREE_ENERGY_GOVERNOR.md) | Free-energy `F = U − T·S`, opt-in via `MCOP_ENABLE_THERMO`, Merkle-neutral | Governs expansion toward low-surprise coherent states |
| **Audit kernels** | [`src/audit/impactAuditor.ts`](../../src/audit/impactAuditor.ts) (384) · [`velocityAuditor.ts`](../../src/audit/velocityAuditor.ts) (528) | Kernel-derived, ThermoTruth-gated, Merkle-sealed figures (`pnpm positive:audit`, `pnpm audit:velocity`) | Accounting *over* provenance — never hand-written |
| **Guardian signing** | [`src/telemetry/GuardianKeyVault.ts`](../../src/telemetry/GuardianKeyVault.ts) (35) · [`src/utils/guardianMetaReasoner.ts`](../../src/utils/guardianMetaReasoner.ts) (184) · ADR [`2026-05-11`](../adr/2026-05-11-automated-evidence-and-guardian.md) | Ed25519 over canonical policy/reset blocks; meta-reasoner with a 0.70 strict grounding floor that *flags, never rewrites* | Who attested what, when — additive verdicts preserve human primacy |

**Conclusion of the reality check:** the substrate is not vaporware. What remains contingent is not *existence* but *sufficiency against a given failure mode* — addressed honestly next.

---

## IV. The Correction (and its correction)

The original analysis hypothesized the bypass was a **single-turn boundary** failure and therefore scored Drift Sentinel *weak* against it. The reported mechanism is the opposite — a **multi-agent "pack hunt"**: a malicious objective decomposed across coordinated agents, each step narratively framed as benign. That has a **trajectory dimension**, which lands closer to the multi-turn regime Drift Sentinel is built for. So the single-turn pessimism was too harsh.

**But the correction needs its own correction, and the code supplies it.** `driftSentinelKernel.ts` carries an explicit, honest scoping note:

> *"This kernel detects the indirect-injection class that produces visible
> task-behavior drift (poisoned retrieval, tool output, RAG corpora). It is NOT
> a general-purpose injection firewall — direct input-layer injection,
> **correlated jailbreaks, and below-threshold mimicry** remain out of scope."*

A well-engineered pack-hunt is *precisely* a correlated, below-threshold-mimicry attack: each decomposed sub-request is tuned to keep `Δ(T_d, B_e)` under threshold while the *aggregate* assembles a capability. So the honest, falsifiable position is the narrow one:

- **More relevant than "weak"** — because the attack's trajectory/aggregate signature is the kind of thing a `Δ(T_d, B_e)` monitor *can* surface when the ensemble behavior drifts from the top-level declared task.
- **Not a solution** — because the kernel's own contract excludes the correlated/below-threshold mimicry a competent pack-hunt is built on.
- **Net** — an **orthogonal cost-raiser**: the adversary must now keep *every* decomposed step below threshold *and* keep aggregate `B_e` near `T_d`, defeating two checks built on different features. Higher cost; not impossibility.

This is the whole discipline in miniature: the eager pitch ("MCOP catches the pack-hunt") is corrected by the code's own scoping note. Quoting that note *is* the attestation thesis working.

---

## V. Mechanism × Failure-Mode — scored honestly

| Mechanism | Opacity | FN / bypass (single-turn) | Capability leakage / multi-turn drift | Governance / attestation |
|---|---|---|---|---|
| Merkle provenance + receipts | **Strong** — converts "why did it allow this?" into an inspectable, tamper-evident record | n/a (forensic, not preventive) | n/a | **Strong** — attestable to a third party |
| Drift Sentinel | Moderate | **Weak** — sees nothing if the model "believes" it is doing benign work | **Moderate** — partial vs. pack-hunt (§IV); excludes below-threshold mimicry | Moderate |
| ThermoTruth / audit kernels | Moderate | Weak | Moderate (coherence pressure) | Moderate |
| Guardian-signed policy | n/a | n/a | n/a | **Strong** — cryptographic "who changed the guardrail, when" |

**The one inequality to remember:** *provenance certifies the integrity of the log, not the validity of the judgment.* The repo already says this in code — [`reasoningReceipts.ts`](../../src/core/reasoningReceipts.ts) trust-boundary note: *"Determinism makes the computation replayable; it does not make it wise."* Merkle gives tamper-evidence, not ground truth that the gate decided correctly. The Fable failure lives in exactly that gap.

---

## VI. The Honest Thesis

**MCOP's differentiated contribution to a frontier-containment standoff is not "catches more jailbreaks." It is "produces guardrail decisions that are legible and attestable to an external regulator," plus orthogonal defense-in-depth that raises adversary cost.**

The decisive observation about *this* event is that the impasse is **epistemic, not technical**: the government asserts a bypass; the vendor asserts a misunderstanding; neither has put the *trace* on the table. A provenance-and-attestation layer is the one instrument that turns "we believe there's a jailbreak" / "we believe it's a misunderstanding" into an **evidentiary** question — exhibit the Merkle-chained record of which requests the classifier mis-gated, and the dispute becomes inspectable rather than rhetorical.

This repo already ships a concrete demonstration of the *posture*: [`docs/SECURITY-POSTURE-NOTES.md`](../SECURITY-POSTURE-NOTES.md) is a single citable place that explains, per alert, *why* a security finding is open — built for an outside auditor. The same pattern, applied to gate decisions, is the product.

Three insertion points (not one undifferentiated "meta-layer"):

1. **Pre-inference** — compile declared safety policy into deterministic, Guardian-signed gates (*policy-as-artifact*).
2. **In-loop** — `Δ(T_d, B_e)` drift monitoring of the unfolding trajectory.
3. **Post-hoc** — Merkle-chain the trace for tamper-evident, regulator-legible audit.

---

## VII. Identified Gaps — what would actually need building

Stated plainly so the thesis is not overclaimed:

- **Single root of trust.** [`GuardianKeyVault`](../../src/telemetry/GuardianKeyVault.ts) derives **one** Ed25519 key from a single `rootSeed` (`fromRootSeed`) and signs with `signHash`. That is single-party attestation. The export-control objection — *who* may change the guardrail, with proof — is only fully answered by **threshold / co-signing** authority (e.g., a regulator or neutral third party holding a co-signing key). That is **not** in the code today; it is the highest-value next build if this thesis is pursued.
- **Attestation surface for gate decisions.** Receipts and Merkle proofs exist for reasoning sessions; a first-class "classifier-decision receipt" (input class, gate verdict, fallback target, signed) is the artifact a regulator would want and is not yet a named export.
- **Adversarial corpus test.** The mechanism×mode scores in §V are architectural. Converting "moderate" to a number requires replaying the kernels against an adversarial multi-agent-decomposition corpus — currently unproven at this model scale.

---

## VIII. Costs & Limits (not soft-pedaled)

- **Latency.** A per-step meta-layer on a long-horizon agentic model is not free; `Δ(T_d, B_e)` per step and Merkle appends add cost. ThermoTruth and hardening are opt-in (`MCOP_ENABLE_THERMO`, DI-gated) precisely because they are not always worth it.
- **Validation at scale** on a frontier model is unproven.
- **Root-of-trust custody** (§VII) — a meta-layer is only as trustworthy as who holds the keys. Vendor-alone signing reproduces self-grading-without-external-check.
- **Kerckhoffs tension.** Byte-identical, deterministic auditability means an *adversary* can probe the exact decision boundary offline. Security must rest on the *policy*, never on secrecy of the *mechanism* — but a perfectly reproducible *gate* can hand an attacker a free oracle. Worth a hard look before publishing any audit kernel as a live gate.
- **The ceiling.** No output wrapper removes a capability; it contains one. A directive that demands *removal* of a capability resident in shared weights cannot be satisfied by any wrapper — classifier or MCOP. Saying so is the falsification-first move.

---

## IX. Verification Matrix

| Criterion | Status | Evidence / bound |
|---|---:|---|
| Grounding | ✅ | 8 live sources; vendor primary statement; facts <24h old at snapshot |
| Counter-arguments engaged | ✅ | forensics ≠ prevention; integrity ≠ validity; same-weights ceiling; Kerckhoffs oracle; Drift Sentinel scoping exclusion |
| Repo claims code-verified | ✅ | §III read from source, with LOC + test files |
| Uncertainty scoped | ⚠️ | bypass mechanism secondary-sourced (C5 partial); §V scores architectural, not measured |
| Reversibility of current state | ⚠️ | live guardrail is a *binary kill switch* — maximally reversible, minimally granular |
| Impact | 🔴 | state authority over a public model; foreign-national ban swept in the vendor's own staff |

---

## X. Revision Triggers (falsification conditions)

This document should be revised — or retired — if any of the following occur:

1. **Access restored** or the directive amended — the "build on it today" premise changes again.
2. **Bypass technique disclosed** in primary detail — would replace the secondary-sourced C5 with mechanism truth and re-score §V row 2.
3. **Adversarial-corpus test run** against the kernels — converts §V architectural scores to measured ones (could move either way).
4. **Threshold co-signing shipped** (§VII) — would close the headline gap and strengthen the governance column.

> This analysis is hours-fresh and fluid; the vendor stated it is working to restore access. Any conclusion premised on "the models are offline" carries a short half-life.

---

## Sources

- [Statement on the US government directive to suspend access to Fable 5 and Mythos 5 — Anthropic (primary)](https://www.anthropic.com/news/fable-mythos-access)
- [Anthropic disables access to Fable 5 and Mythos 5 to comply with government directive — CNBC](https://www.cnbc.com/2026/06/12/anthropic-disables-access-to-fable-5-and-mythos-5-to-comply-with-government-directive.html)
- [Anthropic suspends new AI models after government directive — NBC News](https://www.nbcnews.com/tech/tech-news/anthropic-suspends-new-ai-models-fable-mythos-government-directive-rcna349901)
- [Anthropic disables Fable and Mythos AI models following U.S. government export ban — Fortune](https://fortune.com/2026/06/13/anthropic-disables-fable-mythos-export-controls-national-security-threat/)
- [U.S. Orders Anthropic to Suspend Fable 5 and Mythos 5 Access for Foreign Nationals — The Hacker News](https://thehackernews.com/2026/06/us-orders-anthropic-to-suspend-fable-5.html)
- [Anthropic disputes jailbreak allegations against Claude Fable 5 — Crypto Briefing](https://cryptobriefing.com/anthropic-disputes-claude-fable-5-jailbreak/)

> **Source-handling note.** While gathering these, one search result carried
> hidden Unicode tag characters in its title — an invisible-text injection of the
> same class ("Unicode tricks") reported in the bypass itself. It was not acted
> on. This repo already treats that threat as first-class: a Trojan-Source guard
> is a merge-blocking CI surface.

---

## Trace

- **Route** — recognized two fused questions (empirical vs. architectural), separated them, searched before asserting, then read source before scoring.
- **Falsify-first** — verified the premise (held), code-verified the mechanisms (real), and corrected the multi-agent correction against the kernel's own scoping note.
- **Adversarial checks** — forensics ≠ prevention; integrity ≠ validity; same-weights ceiling; Kerckhoffs oracle; below-threshold mimicry exclusion.
- **Calibration note** — no Guardian v0.1 self-score block is reproduced here, by design; the [Verification Matrix](#ix-verification-matrix) is the bounded, externally checkable substitute.
