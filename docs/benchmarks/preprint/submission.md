# Submission notes

> **Status:** Scaffold v0.1 · **Last refreshed:** 2026-05-10 ·
> **Manifest dependency:** `examples/reproducible-benchmark/out/manifest.json` ·
> **Bundle dependency:** [`examples/reproducible-benchmark/`](../../../examples/reproducible-benchmark/)

This file is the operator-facing checklist for getting the
[`paper.md`](./paper.md) preprint scaffold uploaded. It is intentionally
mechanical — every step has a verification command attached so the
submission process itself is auditable.

---

## 0. Pre-flight (every submission)

```bash
# 1. Cut a fresh manifest.
docker run --rm -v "$PWD/examples/reproducible-benchmark/out:/out" \
  mcop-reproducible-benchmark

# 2. Confirm verdict=pass.
jq -e '.verdict == "pass"' examples/reproducible-benchmark/out/manifest.json

# 3. Capture the SHA-256 of the regenerated snapshot for citation.
jq -r '.snapshot.sha256_regenerated' examples/reproducible-benchmark/out/manifest.json
```

If step (2) fails the snapshot has drifted; do **not** submit until the
PR that introduced the drift is reviewed.

---

## 1. arXiv (primary)

* **Category.** `cs.SE` (Software Engineering); cross-list to `cs.CL`
  (Computation and Language).
* **License.** CC BY 4.0 (preferred for arXiv) — note: this applies only
  to the preprint PDF. The MCOP Framework 2.0 source code remains
  BUSL-1.1 → MIT 2030-04-26.
* **Endorsement.** Required for first-time `cs.SE` submitters; coordinate
  via the contributor mailing list.
* **Bundle reference.** Cite as
  `examples/reproducible-benchmark/` at git SHA `<git-sha>`,
  Docker image digest `<image-digest>`, manifest SHA `<manifest-sha>`.
* **Render command.**
  ```bash
  pandoc docs/benchmarks/preprint/paper.md \
    -o paper.pdf \
    --citeproc \
    --pdf-engine=xelatex \
    -V geometry:margin=1in
  ```
  The rendered PDF + LaTeX intermediates are **not** committed back to
  the repo. Upload the PDF to arXiv directly.

## 2. Hugging Face (mirror)

* **Repo type.** Dataset.
* **Path.** `kullailabs/mcop-reproducible-benchmark`.
* **Contents.**
  * `results.json` (the committed snapshot at submission SHA).
  * `manifest.json` (the verifier output for that snapshot).
  * `figures/figure-1-latency.png` and `figures/figure-2-triad-vs-llm.png`.
  * Link back to the GitHub source + the arXiv preprint URL.
* **Cadence.** Refresh on every PR that bumps `mcop-benchmark/<x.y>`.

## 3. Zenodo (DOI)

* **Trigger.** At each tagged release (`v2.4.x`).
* **Contents.** Tarball of `examples/reproducible-benchmark/` + the
  rendered PDF + the manifest. Zenodo issues a DOI per release; cite the
  DOI from the README badge once issued.

## 4. Verification provenance block (paste into the preprint at submission)

```
Verified at:        <verified-at>
Snapshot SHA-256:   <sha256-regenerated>
Bundle git SHA:     <git-sha>
Docker image:       <image-digest>
Manifest verdict:   pass
Schema version:     mcop-benchmark/2.0
Pipeline version:   mcop-reproducible-benchmark/1.0
```

Every `<…>` span is filled in directly from
`examples/reproducible-benchmark/out/manifest.json`. Do **not** edit by
hand.

---

## 5. Post-submission

1. Update `docs/badges/reproducible-benchmark.svg` if the verified-at
   date moves into a new month.
2. Update the README's "Reproducibility" subsection with the arXiv +
   Hugging Face + Zenodo URLs once issued.
3. Etch the submission as a `ProvenanceMetadata` event so the preprint
   itself is part of the Merkle ledger backing the v2.4 milestone.
4. Bump `paper.md`'s "Preprint scaffold v0.x" header.
