# MCOP Framework 2.0 — Reproducible deterministic prompting-mode benchmark

> **Preprint scaffold v0.1 · placeholders in `<…>` spans are filled in at submission time from the bundle's `manifest.json`.**
>
> **Headline claim moved.** The credibility anchor for this work is byte-identity,
> not throughput — see the companion preprint
> [`byte-identity.md`](./byte-identity.md) ("Identical cognition state, byte for
> byte, across four runtimes"). The numbers below bound *triad overhead* on a
> deterministic mock LLM; they are a secondary, hardware-dependent result and are
> framed as such to avoid ops/sec quibbles.

* **Authors.** Kevin Kull · MCOP Framework 2.0 contributors.
* **Repository.** `Kuonirad/MCOP-Framework-2.0` · branch tagged at submission with `mcop-benchmark/<schema-version>`.
* **Bundle.** `examples/reproducible-benchmark/` — Docker image + Jupyter notebook + manifest emitter.
* **Snapshot.** `docs/benchmarks/results.json` (schema `mcop-benchmark/2.0`, `capturedAt = 2026-04-27T22:30:00.000Z`).
* **Verified at.** `<verified-at>` (filled in by the verifier).
* **Bundle SHA-256.** `<sha256-bundle>` (filled in from `manifest.json`).
* **License.** Apache-2.0.

---

## Abstract

The headline property of this work is **byte-identity**: the cognition-state
digest reproduces bit-for-bit across four independent runtimes (Node `crypto`,
a portable pure-JS SHA-256, WebCrypto `subtle`, and Python `hashlib`) — the
claim a referee can falsify in ninety seconds without trusting our hardware,
documented in the companion preprint [`byte-identity.md`](./byte-identity.md)
and pinned by `src/__tests__/byteIdentity.test.ts` +
`mcop_package/tests/parity/test_byte_identity_parity.py`. The throughput figures
below are a *secondary* result that bounds triad overhead under a deterministic
mock LLM.

We describe a deterministic, reproducible, byte-identical benchmark for
recursive meta-cognitive prompting pipelines. The harness compares three
prompting strategies — `human-only` (hand-authored prompt), `pure-ai`
(deterministic AI rewrite), and `mcop-mediated` (full MCOP triad: NOVA-NEO
encode → Stigmergy v5 resonance → Holographic Etch with Merkle-rooted
provenance) — on a five-task fixture spanning narrative, cinematic,
graphic, audio, and on-call domains. The harness ships as a single
Docker image and a single Jupyter notebook (`examples/reproducible-benchmark/`).
On the canonical fixture, the `mcop-mediated` mode is the only auditable
mode (Merkle root present on every run) while staying inside a 4.4 ms
full-pipeline budget; `mcop-mediated.avgTriadMs = <mcop-avg-triad-ms>`,
`mcop-mediated.avgLatencyMs = <mcop-avg-latency-ms>`. Every claim in this
paper is byte-identical-reproducible from a single `docker run`.

---

## 1. Introduction

Most claims about prompting-pipeline efficiency in the LLM-tooling space
are presented without (a) a deterministic re-runnable artefact, (b)
cryptographic provenance for the run, or (c) byte-identity guarantees
across CI matrices. MCOP Framework 2.0 inverts these defaults: every
benchmark run is deterministic, byte-identity is enforced in CI, and the
mediated mode produces Merkle-rooted `ProvenanceMetadata` that any third
party can re-derive.

This paper documents the Phase 2 externalization of that benchmark — i.e.
how a reader without access to the source repository can still reproduce
the headline budget by pulling a single Docker image and running a
single notebook.

## 2. The MCOP pipeline

```
prompt ──▶ NovaNeoEncoder (SHA-256 + bilinear projection)
       ──▶ StigmergyV5 (pheromone resonance, Merkle-chained memory)
       ──▶ DialecticalSynthesizer (resonance + continuity preamble)
       ──▶ HolographicEtch (append-only ledger, ProvenanceMetadata)
       ──▶ LLM dispatch
```

Implementation: [`src/core/`](../../../src/core/) (deterministic kernels) +
[`src/benchmarks/promptingModes.ts`](../../../src/benchmarks/promptingModes.ts)
(harness). Every kernel is unit-tested and the suite runs at
`≥ 96.6 %` line coverage with byte-identical golden snapshots.

## 3. Methodology

### 3.1 Modes under comparison

| Mode             | What is sent to the LLM                                                                    | Provenance                  |
| ---------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| `human-only`     | Hand-authored prompt verbatim                                                              | None                        |
| `pure-ai`        | Deterministic AI rewrite (`pureAIRewrite` adds objective + constraints + format scaffold)  | None                        |
| `mcop-mediated`  | Prompt funnelled through the full MCOP triad (encode → resonate → synthesize → etch)        | Merkle-rooted               |

The `pure-ai` rewriter is intentionally deterministic so the comparison is
a *floor* for what MCOP saves you in the real world — a real GPT
preprocessor would be strictly noisier and more expensive.

### 3.2 Canonical fixture

Five tasks (narrative, cinematic, graphic, audio, on-call) defined in
`CANONICAL_BENCHMARK_TASKS`. Each task carries a hand-authored
`humanPrompt` and a list of `goalKeywords` used to score response
on-task-ness.

### 3.3 Metrics

Per run: `inputTokens`, `outputTokens`, `totalTokens`,
`dispatchedPromptLength`, `goalCoverage`, `auditable`, `merkleRoot`,
`quality.{humanLikert, automatedScore, bertScoreF1}`,
`latency.{totalMs, triadMs, llmMs}`. See
[`docs/benchmarks/methodology.md`](../methodology.md) for full schema
notes and the rationale behind every field.

## 4. Reproducibility

### 4.1 Bundle

`examples/reproducible-benchmark/` is a self-contained Docker bundle that
pins Node 22.22.2, pnpm 9.15.0, Python 3.12, and the workspace's exact
`pnpm-lock.yaml`. The default container entrypoint:

1. Saves the committed `docs/benchmarks/results.json` baseline.
2. Re-runs `pnpm benchmark:refresh` (which is
   `BENCHMARK_GENERATE=1 jest --testPathPatterns=src/__tests__/benchmarks.test.ts`).
3. Diffs the regenerated artefact against the baseline.
4. Computes SHA-256 over the regenerated artefact.
5. Emits `manifest.json` (verdict, both SHAs, headline budget).
6. Exits 0 on PASS, 1 on FAIL.

### 4.2 Notebook

[`reproduce-22700-ops.ipynb`](../../../examples/reproducible-benchmark/notebooks/reproduce-22700-ops.ipynb)
re-asserts byte-identity, determinism, auditability, and budget-envelope
from inside Python, generates two figures, and re-emits the manifest.
This guarantees a reader who only trusts Python tooling can still
self-certify the result.

### 4.3 Verification badge

The repo README carries a [`Reproducible 22,700 ops/sec ·
verified 2026-05-10`](../../badges/reproducible-benchmark.svg) badge that
links into this preprint and into the bundle. The verified-at date in the
badge is the `manifest.verifiedAt` of the most recent passing run.

## 5. Results

> **Filled in from `manifest.json` at submission time.**

| Mode             | avg latency (ms)             | avg triad (ms)              | avg LLM (ms)                | auditable runs |
| ---------------- | ---------------------------- | --------------------------- | --------------------------- | -------------- |
| `human-only`     | `<human-avg-latency-ms>`     | 0                           | `<human-avg-llm-ms>`        | 0 / 5          |
| `pure-ai`        | `<pure-ai-avg-latency-ms>`   | 0                           | `<pure-ai-avg-llm-ms>`      | 0 / 5          |
| `mcop-mediated`  | `<mcop-avg-latency-ms>`      | `<mcop-avg-triad-ms>`       | `<mcop-avg-llm-ms>`         | 5 / 5          |

Two figures (emitted by the notebook into `figures/`):

* **Figure 1 — Prompting-mode latency · deterministic mock LLM.**
* **Figure 2 — `mcop-mediated` triad vs. LLM-call breakdown.**

## 6. Threats to validity

* **Mock LLM.** The benchmark uses a deterministic mock so the snapshot
  is byte-identity-reproducible. Real-LLM numbers will be strictly
  noisier and at least an order of magnitude slower; this work bounds
  the *triad overhead*, not vendor latency.
* **Heuristic tokenizer.** `approximateTokens` is a whitespace + word
  boundary tokenizer, not BPE. The point is comparability across modes
  under one consistent measure, not absolute token-count claims.
* **Five-task fixture.** Phase 2 ships the canonical 5-task fixture; the
  expanded 25-task suite (legal/medical/code/scientific) lives in the
  same repo and is documented in `docs/benchmarks/playbook.md` §5. A
  follow-up preprint will fold those in.

## 7. Provenance

Every `mcop-mediated` run emits a `ProvenanceMetadata` carrying:

* SHA-256 etch hash (Merkle root)
* ISO8601 timestamp (`2026-04-27T22:30:00.000Z` for the deterministic snapshot)
* UUID-v4 trace ID
* Resonance score + eudaimonic bias signal

The same provenance shape backs every escalation in the v2.4 Master
Protocol; see [`ROADMAP_TO_100.md`](../../../ROADMAP_TO_100.md) for the
non-negotiable invariants list.

## 8. Conclusion

A deterministic, byte-identity-reproducible benchmark is itself a
discoverability asset: any third party can certify the headline budget
in 90 seconds without trusting the authors' hardware. The bundle, the
notebook, and this scaffold close the loop on Phase 2 of the v2.4
Logical Efficacy Escalation; subsequent phases (community flywheel,
ecosystem integration, MIT-conversion narrative prep) compound on top of
this externalised baseline.

---

## References

1. Kull, K. *MCOP Framework 2.0 — recursive meta-cognitive optimization protocol.* `Kuonirad/MCOP-Framework-2.0`, 2026.
2. *MCOP Prompting-Mode Benchmark — Methodology.* [`docs/benchmarks/methodology.md`](../methodology.md), 2026.
3. *MCOP Benchmarking Playbook v1.0.* [`docs/benchmarks/playbook.md`](../playbook.md), 2026.
4. *MCOP Comparative Study 2026.* [`docs/benchmarks/comparative-study-2026.md`](../comparative-study-2026.md), 2026.
5. *ROADMAP_TO_100 — v2.4 Logical Efficacy Escalation.* [`ROADMAP_TO_100.md`](../../../ROADMAP_TO_100.md), 2026.
