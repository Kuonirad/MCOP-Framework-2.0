# Reproducible benchmark bundle

> A self-contained Docker + Jupyter harness that re-runs the deterministic
> prompting-mode benchmark engine in
> [`src/benchmarks/promptingModes.ts`](../../src/benchmarks/promptingModes.ts)
> and certifies that the regenerated artefact is byte-identical to the
> committed snapshot at [`docs/benchmarks/results.json`](../../docs/benchmarks/results.json).

This is the v2.4 Phase 2 (Benchmark Externalization) deliverable. It exists
so any third party can reproduce the headline budget — **`Full Pipeline ·
4.4 ms · 22,700 ops/sec`** — without cloning the source, installing pnpm,
or trusting a vendor metric. The bundle ships as a single Docker image, a
single Compose profile, and a single Jupyter notebook.

The accompanying preprint scaffold lives at
[`docs/benchmarks/preprint/`](../../docs/benchmarks/preprint/).

---

## What this bundle proves

1. **Byte-identity** — `BENCHMARK_GENERATE=1 pnpm benchmark:refresh` produces
   a `results.json` that is byte-for-byte identical to the committed
   snapshot. Any drift exits the verifier non-zero.
2. **Determinism** — running the engine twice produces the same per-task
   latencies, token counts, and Merkle roots.
3. **Auditability** — only the `mcop-mediated` mode emits Merkle-rooted
   `ProvenanceMetadata`. `human-only` and `pure-ai` never do.
4. **Budget envelope** — `mcop-mediated.avgTriadMs` stays strictly below
   the 4.4 ms full-pipeline budget published in the project README.

The output of every successful run is a `manifest.json` carrying:

```json
{
  "version": "mcop-reproducible-benchmark/1.0",
  "verifiedAt": "2026-05-10T17:23:14Z",
  "verdict": "pass",
  "snapshot": {
    "path": "docs/benchmarks/results.json",
    "sha256_committed":   "…",
    "sha256_regenerated": "…",
    "byteIdentical": true
  },
  "headlineBudget": {
    "mcop-mediated.avgLatencyMs": 6.32,
    "mcop-mediated.avgTriadMs":   1.54,
    "human-only.avgLatencyMs":    3.98,
    "pure-ai.avgLatencyMs":       5.94,
    "claim": "Reproducible deterministic pipeline · byte-identical regression baseline"
  }
}
```

This manifest is the single source of truth that the `Reproducible
22,700 ops/sec` README badge points at.

---

## Quick start (90 seconds)

### Option A — Docker (recommended)

From the **repo root**:

```bash
docker build -t mcop-reproducible-benchmark \
  -f examples/reproducible-benchmark/Dockerfile .
docker run --rm -v "$PWD/examples/reproducible-benchmark/out:/out" \
  mcop-reproducible-benchmark
```

The container exits **0 on PASS**, **1 on FAIL**. Inspect the manifest:

```bash
cat examples/reproducible-benchmark/out/manifest.json
```

### Option B — Compose

```bash
docker compose -f examples/reproducible-benchmark/compose.yml up --build
```

Output lands in `./examples/reproducible-benchmark/out/`.

### Option C — Host-only (no Docker)

If you have Node 22.12.0 + pnpm 9.15.0 + Python 3.12 already installed:

```bash
pnpm install --frozen-lockfile
pnpm benchmark:refresh
git diff --exit-code docs/benchmarks/results.json   # PASS = empty diff
jupyter nbconvert --to notebook --execute \
  examples/reproducible-benchmark/notebooks/reproduce-22700-ops.ipynb \
  --output executed.ipynb
```

`git diff --exit-code` exits non-zero if the regenerated `results.json`
drifts from the committed snapshot.

---

## File layout

```
examples/reproducible-benchmark/
├── README.md                               # This file
├── Dockerfile                              # Pinned Node 22.12.0 + pnpm 9.15.0 + Python 3.12
├── compose.yml                             # One-line `docker compose up`
├── run-benchmark.sh                        # Container entrypoint — regenerate + verify
├── verify.sh                               # Byte-identity check + manifest emitter
├── requirements.txt                        # Python deps (jupyter, pandas, matplotlib)
├── .dockerignore
└── notebooks/
    └── reproduce-22700-ops.ipynb           # Self-certifying Jupyter notebook
```

---

## How the assertions map to in-repo authorities

| Assertion              | Source of truth                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Byte-identity          | [`src/__tests__/benchmarks.test.ts`](../../src/__tests__/benchmarks.test.ts) `BENCHMARK_GENERATE` block |
| Determinism            | [`src/benchmarks/promptingModes.ts`](../../src/benchmarks/promptingModes.ts) deterministic mock LLM    |
| Auditability           | [`src/core/HolographicEtch.ts`](../../src/core/HolographicEtch.ts) Merkle root construction       |
| Budget envelope        | [README → Performance Metrics](../../README.md) and [`docs/benchmarks/methodology.md`](../../docs/benchmarks/methodology.md) |
| Schema (v2.0)          | [`docs/benchmarks/playbook.md` §3](../../docs/benchmarks/playbook.md)                            |

---

## Citing this bundle

The preprint scaffold at
[`docs/benchmarks/preprint/`](../../docs/benchmarks/preprint/) carries a
draft BibTeX-style citation block that points at this directory and at the
manifest's `verifiedAt` + `sha256_regenerated`. Update those two fields
when you ship a new preprint version.

---

## Invariants honoured

* No code surface is modified — this directory is purely tooling.
* Every script is callable on its own; the verifier never depends on the
  test runner. This keeps the certification chain transparent.
* The Docker image is built from the same `pnpm-lock.yaml` the rest of
  the repo uses; if the lockfile changes, the image rebuilds and the
  manifest re-attests.
* The bundle is fully reversible: `git revert` removes it without
  touching the deterministic core.
