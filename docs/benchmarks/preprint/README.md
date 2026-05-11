# MCOP Framework 2.0 — preprint scaffold

> **Status:** Draft scaffold (v0.1) · **Owner:** [@Kuonirad](https://github.com/Kuonirad) ·
> **Bundle dependency:** [`examples/reproducible-benchmark/`](../../../examples/reproducible-benchmark/) ·
> **Verification badge:** [`docs/badges/reproducible-benchmark.svg`](../../badges/reproducible-benchmark.svg) ·
> **Source of truth:** [`docs/benchmarks/results.json`](../results.json)

This directory is the v2.4 Phase 2 (Benchmark Externalization) preprint
scaffold. It is intentionally a markdown-only skeleton — placement-linter
guarantees `docs/` only carries `.md`, `.png`, `.jpg`, `.svg`, `.json`, so
the LaTeX / `.bib` artefacts that a final arXiv submission would carry
are kept out of the repo until a hosting decision is made.

The companion reproducibility bundle (Dockerfile + Jupyter notebook +
verifier scripts) lives outside `docs/` at
[`examples/reproducible-benchmark/`](../../../examples/reproducible-benchmark/).
Anything in this scaffold that quotes a number must derive that number
from the bundle's `manifest.json` or from `docs/benchmarks/results.json`
itself — never hard-coded.

---

## Files

| File                        | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| [`paper.md`](./paper.md)    | arXiv-style markdown skeleton: Abstract · Introduction · Pipeline · Methodology · Reproducibility · Results · Threats to Validity · Provenance · Conclusion · References. |
| [`submission.md`](./submission.md) | Where, how, and with what checksums to upload (arXiv `cs.SE` + Hugging Face mirror + zenodo DOI). |
| `figures/`                  | Empty directory; figures are emitted by the Jupyter notebook into `out/figures/` and copied here at submission time. |

---

## Workflow

1. **Run the bundle** — `docker run --rm -v "$PWD/examples/reproducible-benchmark/out:/out" mcop-reproducible-benchmark`. This emits `manifest.json` and (via the notebook) `figures/figure-1-latency.png` + `figures/figure-2-triad-vs-llm.png`.
2. **Fill the templates** — `pnpm preprint:fill --image-digest <sha256:...>`. This reads `manifest.json` + `docs/benchmarks/results.json`, substitutes every `<…>` span, and writes `paper.filled.md` + `submission.filled.md` into `examples/reproducible-benchmark/out/preprint/`. It refuses to run if `manifest.verdict != "pass"` or any placeholder is unresolved, so a successful exit is a structural attestation that the preprint is submission-ready.
3. **Render** — convert the filled paper to PDF outside the repo (e.g., via `pandoc examples/reproducible-benchmark/out/preprint/paper.filled.md -o paper.pdf --citeproc --pdf-engine=xelatex -V geometry:margin=1in`). The PDF and any final LaTeX intermediates do **not** get committed back; they are uploaded to arXiv / zenodo / Hugging Face directly.

---

## Hosting plan

| Vector             | Target                                                                       | Cadence                            |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------- |
| Primary            | **arXiv** `cs.SE` (preprint) + endorsement from a co-author                  | Once per minor `mcop-benchmark/x.y` |
| Mirror             | **Hugging Face** dataset card with the bundle + `results.json`               | On every PR that bumps the snapshot |
| DOI                | **Zenodo** with the bundle Dockerfile + `manifest.json` archived            | At each tagged release             |
| Public dashboard   | [`/benchmarks`](../../../src/app/benchmarks/page.tsx)                        | Live (CI-refreshed)                |
| Discoverability    | Repo README · ROADMAP_TO_100.md v2.4 milestone · weekly Efficacy Delta GHA   | Continuous                         |

---

## Invariants

* Every claim in the preprint is verifiable against
  `docs/benchmarks/results.json` or against the
  `examples/reproducible-benchmark/out/manifest.json` produced by a
  reader's own Docker run.
* No prose number is hard-coded in `paper.md` — placeholders use
  `<verified-at>`, `<sha256>`, `<avg-…-ms>` spans that the refresh script
  fills in.
* The preprint scaffold is itself docs-only: zero impact on the
  deterministic core, the test surface, or the BUSL-1.1 → MIT 2030-04-26
  scarcity narrative.
