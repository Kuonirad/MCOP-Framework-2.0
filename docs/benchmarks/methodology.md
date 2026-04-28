# MCOP Prompting-Mode Benchmark — Methodology

> Captured snapshot: [`docs/benchmarks/results.json`](./results.json) ·
> Public dashboard: [`/benchmarks`](../../src/app/benchmarks/page.tsx) ·
> Source: [`src/benchmarks/promptingModes.ts`](../../src/benchmarks/promptingModes.ts) ·
> Test guard: [`src/__tests__/benchmarks.test.ts`](../../src/__tests__/benchmarks.test.ts).

The benchmark exists to make a single, falsifiable claim quantifiable:
**"funnelling a prompt through MCOP costs less than letting an AI
preprocessor rewrite it, while being the only mode that produces a
Merkle-rooted audit trail."** The whitepaper at
[`docs/whitepapers/Human_vs_PureAI_Prompting.md`](../whitepapers/Human_vs_PureAI_Prompting.md)
quotes the resulting numbers — this document explains how those numbers
are produced so the experiment is reproducible by anyone with a checkout
of this repo.

## Three prompting modes

| Mode | What gets sent to the LLM | Provenance? |
| --- | --- | --- |
| `human-only` | the hand-authored prompt verbatim | none |
| `pure-ai` | the prompt after a deterministic AI preprocessor (`pureAIRewrite`) bolts on objective / constraints / format scaffolding | none |
| `mcop-mediated` | the prompt after the full MCOP triad: `NovaNeoEncoder` → `StigmergyV5.getResonance` → `DialecticalSynthesizer.synthesize` → `HolographicEtch.applyEtch` | Merkle-rooted `ProvenanceMetadata` |

The `pure-ai` rewriter is intentionally simple and deterministic so the
benchmark can be re-run by anyone without extra credentials, and so the
JSON snapshot is byte-stable inside CI. A real GPT preprocessor would be
strictly noisier and more expensive than the deterministic stand-in, so
the comparison is a *floor* for what MCOP saves you in the real world.

## Canonical task fixture

Five tasks pulled from the domains MCOP cares about: narrative,
cinematic, graphic, audio, and on-call ops. Each task carries a
hand-authored `humanPrompt` plus a list of `goalKeywords` used to score
how on-task the resulting response is. The fixture lives in
`src/benchmarks/promptingModes.ts` as `CANONICAL_BENCHMARK_TASKS` and is
considered API: any change to it requires regenerating the snapshot.

## Metrics

Per run:

- **`inputTokens` / `outputTokens` / `totalTokens`** — counted by the
  deterministic `approximateTokens` tokenizer (whitespace + word
  boundaries). Not BPE; not trying to be. The point is comparability
  across modes under one consistent measure.
- **`dispatchedPromptLength`** — characters actually sent to the LLM,
  including any preambles the mode adds.
- **`goalCoverage`** — fraction of `goalKeywords` present in the
  response (case-insensitive substring match). 1.0 = on-task; 0.0 =
  off-task.
- **`auditable`** — true iff the run produced a `ProvenanceMetadata`
  bundle with a Merkle root. By construction this is true for
  `mcop-mediated` and false for the other two modes.
- **`merkleRoot`** — the etch hash, when `auditable`.

Per mode, summarised: average input / output / total tokens, average
goal coverage, count of auditable runs.

## Reproducibility

The benchmark is gated by a snapshot test. To re-run and refresh the
snapshot:

```sh
BENCHMARK_GENERATE=1 pnpm test -- benchmarks
git diff docs/benchmarks/results.json
```

CI then asserts that subsequent runs match the committed JSON byte-for-byte:

```sh
pnpm test -- benchmarks
```

Anything that breaks determinism (a timestamp, a UUID, a non-stable
mock) will trip this guard immediately. The mock LLM completion
function is exposed (`defaultMockLlmCompletion`) and overridable so a
real LLM client can be slotted in for ad-hoc comparisons; only the
canonical-snapshot test asserts the deterministic baseline.

## What the snapshot says (as of the latest commit)

See [`docs/benchmarks/results.json`](./results.json) for the full table.
The summary that the whitepaper quotes:

| Mode | avg total tokens | goal coverage | auditable |
| --- | --: | --: | --: |
| `human-only` | 27.4 | 100% | 0 / 5 |
| `pure-ai` | 60.4 | 100% | 0 / 5 |
| `mcop-mediated` | 33.4 | 100% | 5 / 5 |

The Pure-AI preprocessor doubles token cost without improving coverage;
MCOP adds ~22% overhead vs raw human prompting and is the *only* mode
that emits a reproducible audit trail.
