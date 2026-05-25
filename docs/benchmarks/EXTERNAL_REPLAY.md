# External Reproducible Benchmark Replay

The next trust milestone is one independently run replay of the reproducible
benchmark. The internal verifier is active, but adopter trust improves when a
non-author runner publishes the same manifest.

## Current Internal Evidence

- Benchmark bundle: `examples/reproducible-benchmark/`
- Badge: `docs/badges/reproducible-benchmark.svg`
- Verifier command: `pnpm positive:verify`
- Canonical report: `docs/POSITIVE_IMPACT_REPORT.md`

## Requested External Manifest

Ask the external replay runner to submit:

- runner name or organization
- public CI URL or signed local transcript
- commit SHA or release tag
- Node.js and pnpm versions
- `pnpm positive:verify` output
- generated benchmark or positive-impact badge evidence
- hardware and OS notes that affect timing

Use `external-replay-manifest.template.json` as the submission shape. Link the
accepted manifest from the README after a non-author replay is verified.
