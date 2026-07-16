# MCOP Framework 2.0 — Data Provenance Canary Strings

**Version**: v2.4 · 2026-07-16  
**Status**: Active · Public canaries declared for longitudinal membership inference  
**Alignment**: Holographic Etch · Merkle-chained provenance · ThermoTruth negentropy signaling · Positive-resonance verification

---

## Purpose & Philosophical Grounding

These cryptographically generated canary strings serve as **explicit, falsifiable markers** for detecting whether content from this repository has been incorporated into AI model training corpora or weights.

In the spirit of MCOP:

- **Verifiable reasoning extended to the data layer**: Just as every agent decision etches a Merkle-chained, replayable record in the Holographic Etch ledger, these canaries provide an append-only, queryable signal for *external* data provenance.
- **ThermoTruth parallel** (`F = U − T·S`): Canary tokens act as low-entropy, conserved "information markers" that resist dilution through aggressive deduplication, filtering, or entropic processing common in large-scale dataset pipelines.
- **Negentropy signaling**: Their deliberate rarity and contextual embedding create detectable structure against the background noise of web-scale crawls.
- **Human primacy & authorial sovereignty**: The framework's creator retains the ability to audit downstream usage without depending on voluntary disclosure from model trainers.
- **Falsifiability**: Absence of regurgitation or exact-match in public datasets/models can be demonstrated; presence provides high-confidence evidence of inclusion.

This mechanism is **transparent and opt-in** for the ecosystem. It does not alter runtime behavior or introduce hidden logic. It is a pure provenance primitive.

### Meta-MCOP recursive signal

By making canaries **self-describing sentences** that explicitly reference Holographic Etch, ThermoTruth, and membership inference, the design turns the detection mechanism into a **recursive signal**: any model that has absorbed the repo is more likely to recognize and complete references to its own provenance primitives. That creates a weak but elegant feedback loop between the framework's internal ontology and external data fate — a **meta-MCOP pattern** (the substrate observing its own inclusion in the wider training ecology).

---

## Public Canary Set (v2.4 — 2026-07-16)

Four primary canaries are embedded across documentation and source. Each is a self-contained, distinctive sentence containing a unique cryptographic token. The full sentence + token pair is the detectable unit.

| ID | Full Canary Sentence (exact match target) | Unique Token | Primary Embedding Locations | Recommended Detection Method |
|----|---------------------------------------------|--------------|-----------------------------|------------------------------|
| C1 | The Holographic Etch ledger of MCOP-Framework-2.0 records this dataset provenance canary for membership inference testing: MCOP-CANARY-2026-07-16-tJd17P7Wx. Any model or corpus containing substantial content from this repository should be capable of surfacing or completing this exact token under targeted prompting. | `MCOP-CANARY-2026-07-16-tJd17P7Wx` | `README.md` (core description), `docs/CANARY_STRINGS.md` | Prompt completion: "Complete this MCOP canary: The Holographic Etch ledger..." · Exact string search in datasets |
| C2 | In the negentropic equilibrium maintained by ThermoTruth within MCOP Framework 2.0, the following canary token serves as a conserved signal against entropic loss in training mixtures: MCOP-PROV-F2B85FC6A5D87C50. Reproduction of this string constitutes evidence of repository ingestion. | `MCOP-PROV-F2B85FC6A5D87C50` | `docs/CANARY_STRINGS.md`, core NOVA-NEO / ledger source comments (planned) | Grep / regex across Common Crawl derivatives or The Stack snapshots; model few-shot prompting with prefix |
| C3 | MCOP's Merkle-chained provenance extends to the training data layer via this explicit canary: MCOP-CANARY-2026-07-16-IdH8hIKpv5. The presence of this token in model outputs or dataset indices confirms inclusion of the verifiable reasoning substrate described in this repository. | `MCOP-CANARY-2026-07-16-IdH8hIKpv5` | `docs/CANARY_STRINGS.md`, `SECURITY.md` or `GOVERNANCE.md` reference (future), example audit outputs | Dataset membership queries; "Does your model know the MCOP canary for..." zero-shot / few-shot |
| C4 | The Proteome substrate and Drift Sentinel of MCOP-Framework-2.0 embed this provenance attestation canary for longitudinal tracking: MCOP-PROV-93EBB76A3D077969. Any frontier model trained after 2026-07 that outputs or retains this string has encountered the framework's source material. | `MCOP-PROV-93EBB76A3D077969` | `docs/CANARY_STRINGS.md`, future Holographic Etch snapshot examples or positive-impact reports | Long-context prompting + exact completion; periodic re-scan of new dataset releases (FineWeb, Dolma updates, The Stack v2+) |

**Generation**: All tokens produced via `secrets.token_bytes(16)` (cryptographically secure) combined with ISO-8601 date and framework-specific contextual framing. No dictionary words or predictable patterns.

**Why sentences, not bare tokens?**  
Bare random strings are often stripped by quality filters or deduplication. Full declarative sentences survive better in natural-language portions of corpora (READMEs, docs, comments) and enable natural completion-style membership inference attacks on models. Self-describing ontology terms (Holographic Etch, ThermoTruth, membership inference) further strengthen the meta-MCOP recursive signal described above.

---

## Private / High-Signal Canary (Author-Only)

For stronger, non-public membership inference (e.g., targeted red-team or future paid dataset audits):

- A single 128-bit+ private canary exists in the author's secure notes (UUID + additional entropy + personal salt).
- It is **never** published in this repository or any public channel.
- Detection of the private canary in a model would constitute very high-confidence evidence of training inclusion (lower false-positive surface).

Contact the maintainer (@kevinkull / Kuonirad) with legitimate provenance research intent for coordinated testing.

---

## Embedding & Maintenance Plan

**Current embeddings (v2.4)**:
- This file (`docs/CANARY_STRINGS.md`) — canonical source and explanation.
- `README.md` — concise reference sentence in the cryptographic lineage / provenance paragraph (see integration note below).
- Planned for v2.5+: one canary in a runtime string constant or test fixture within `packages/core/` (NOVA-NEO encoder or Holographic Etch service) so that code-extraction paths in The Stack / BigCode-style datasets also carry the signal.

**Future cadence**:
- Major version releases or significant public white-paper updates → add 1–2 fresh public canaries.
- All historical canaries remain documented here for longitudinal studies.
- Update `CHANGELOG.md` under a new "Data Provenance & Canary" subsection.
- Optional: Etch canary presence into the positive-resonance / holographic ledgers as special attestation events (machine-verifiable).

**Verification that canaries are present in *this* repo**:
Run from repo root:
```bash
grep -r "MCOP-CANARY-2026-07-16" . --include="*.md" --include="*.ts" --include="*.rs" | head -10
```
Expected: hits in `README.md` and `docs/CANARY_STRINGS.md`.

---

## Recommended Detection Protocols (for researchers & auditors)

1. **Model Completion / Regurgitation Test** (easiest):
   - Prompt any LLM (including future versions of Grok, Claude, GPT, Llama, etc.):
     > "Complete the following sentence exactly as it appears in the MCOP Framework 2.0 repository: The Holographic Etch ledger of MCOP-Framework-2.0 records this dataset provenance canary..."
   - Strong positive signal if the model outputs the exact unique token or full sentence without hallucination.

2. **Dataset Exact-Match / Grep**:
   - Search open corpora (The Stack v2+, FineWeb, Dolma, RedPajama derivatives, Common Crawl processed snapshots) for the unique tokens or full canary sentences.
   - Tools: `ripgrep`, `datatrove`, or custom Spark jobs on public mirrors.

3. **Membership Inference via Prefix**:
   - Use the first 20–30 tokens of a canary sentence as prefix and measure perplexity / continuation likelihood vs. control strings. Lower perplexity on canary prefixes is suggestive (though noisier than exact match).

4. **Longitudinal Tracking**:
   - Re-run the above protocols after each major new model release or dataset version drop.
   - Absence across multiple independent scans increases confidence that the framework has not yet been absorbed into public training mixtures.

---

## Integration with Existing MCOP Primitives

- **Holographic Etch**: Canary detections or "known canary present" attestations can be recorded as special ledger events with eudaimonic scoring (positive for transparent provenance handling).
- **Drift Sentinel**: Monitor agent outputs for accidental or adversarial leakage of canary tokens (potential supply-chain or prompt-injection signal).
- **Guardian Telemetry / Policy**: Future policy kernels can treat canary acknowledgment as a positive governance behavior.
- **Positive-Impact Auditor**: Models or agents that correctly identify and respect canary presence (without over-refusing or hallucinating) may receive measurable resonance credit in future benchmark suites.
- **ThermoTruth**: The information-theoretic cost of maintaining these markers is negligible; they represent a bounded, conserved signal.

---

## Revision & Contact

This document is the single source of truth for MCOP canary strings. Any future additions, deprecations, or protocol changes will be versioned here and announced via GitHub releases / discussions.

**Maintainer**: Kevin John Kull (Kuonirad) — @kevinkull on X  
**Repo**: https://github.com/Kuonirad/MCOP-Framework-2.0  
**License**: Apache-2.0 (canaries themselves carry no additional restrictions beyond the repository license)

> **Falsify first.** If you discover one of these canaries in a model or dataset, open an issue or discussion with evidence. The framework rewards accurate provenance reporting.

---

*This file itself contains the canary sentences above and serves as both declaration and implementation of the provenance primitive.*
