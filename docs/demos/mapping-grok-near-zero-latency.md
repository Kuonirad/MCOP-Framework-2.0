# Demo / Discussion Draft — mapping_grok near-zero latency ARC-EVO agent

Use this as the public GitHub Discussions post or the narration track for a short demo video.

## Title

`mapping_grok`: Grok-backed MCOP agent hits 25 ARC-style validation steps at sub-millisecond mean latency

## Demo command

```bash
pnpm benchmark:arc-evo
```

## Talking points

1. The default orchestrator profile is now `mapping_grok`, which maps MCOP's deterministic triad into xAI/Grok-compatible chat-completion dispatch.
2. The benchmark runs a fixed 25-task ARC-style validation split with deterministic NOVA-EVOLVE kernel spawning.
3. Every fifth task triggers NOVA-EVOLVE-TUNER meta-tuning, printing accepted/rejected genome mutations and Merkle-linked meta roots.
4. The output includes per-task confidence, resonance, selected kernel, Merkle root prefix, and latency in milliseconds.
5. The final summary prints solved count, mean latency, p95 latency, accepted meta-decisions, final genome, and the full latency trace.

## Suggested 45-second capture sequence

```text
0:00  Open terminal at repo root and run `pnpm benchmark:arc-evo`.
0:05  Highlight `validationSplit=25 productionProfile=mapping_grok`.
0:12  Highlight task rows: kernel selection + confidence + resonance + latency.
0:22  Pause on `metaTune#1 accepted=true` and explain genome evolution.
0:32  Jump to summary: solved=25/25, meanLatencyMs, p95LatencyMs, finalGenome.
0:40  End on the latencyTrace line and link to docs/integrations/grok.md.
```

## Copy-ready discussion body

MCOP v2.3.1 promotes `mapping_grok` as the default production profile and adds a public ARC-EVO benchmark:

```bash
pnpm benchmark:arc-evo
```

The run prints all 25 validation tasks, NOVA-EVOLVE kernel choices, meta-tuning genome mutations, Merkle roots, and the latency trace. This gives reviewers a compact way to inspect the agent loop without requiring xAI credentials or private benchmark assets.
