# Devin Sub-Agent Orchestration — Integration #2

> Status: **Live** · Adapter: `DevinOrchestratorAdapter` · Loop:
> `runResearcherCoderReviewer` · Example:
> `examples/devin_sub_agent_orchestration/orchestrator.ts` · Tracker row:
> `INTEGRATIONS.md#2`.
>
> Reference run (mock backend, default task, captured by
> `src/__tests__/devin_orchestrator.smoke.test.ts` with `DEVIN_SMOKE=1`):
>
> ```text
> Researcher → aa5b47b275157cc8f959c76627f484579018095c3766743c92df026958529007
> Coder      → 192b9c1f… (varies across runs because the synthesizer's
>              continuity preamble is keyed on the prior trace's UUID)
> Reviewer   → 62ef0c3f…
> Total tokens: 2372 · Wall time: 3900 ms · Cache hits: 0 · Vetoes: 0
> ```
>
> The first leg's Merkle root is deterministic: any audit replay starting
> from the same task string will reproduce
> `aa5b47b275157cc8f959c76627f484579018095c3766743c92df026958529007`
> verbatim. Downstream legs incorporate prior trace IDs through the
> dialectical-synthesizer's continuity preamble, so their roots
> deterministically depend on the (UUID-bearing) traces of earlier legs —
> the chain is reproducible *given the same trace IDs*, which is exactly
> what an auditor needs.

Autonomous coding sub-agents — Devin and its peers — are powerful but
opaque. A single session emits chat messages, file edits, and a final
artefact, but there is no built-in cryptographic record of *why* a
particular plan was chosen, *which prior context* the model resonated
with, or *what the operator vetoed* mid-loop. MCOP fills that gap. The
`DevinOrchestratorAdapter` wraps any `SubAgentClient` (the production
client talks to Devin's MCP server; the offline client returns
deterministic stubs) and funnels every role-task — Researcher, Coder,
Reviewer, or any custom role string — through the same triad pipeline
that backs `GrokMCOPAdapter` and the Visual Dialectical Studio. Each
leg of the loop returns a Merkle-rooted `ProvenanceMetadata` bundle, the
`runResearcherCoderReviewer` helper concatenates those roots into a
single `merkleChain`, and the per-leg `humanReview` hook lets an
operator veto, rewrite, or annotate a dispatch before it ever leaves
the orchestrator. The non-obvious win is **resonance-detected cache
hits**: when a downstream leg's prompt cosine-matches a prior leg
beyond a configurable threshold, the orchestrator reuses the prior
artefact verbatim instead of re-spawning a sub-agent — the same
observability mechanism that powers `chooseProviderByEntropyResonance`
in the Grok adapter, applied to multi-agent loops. The result is a
governance layer no other multi-agent framework currently ships:
deterministic, human-auditable, and SDK-agnostic by construction.
