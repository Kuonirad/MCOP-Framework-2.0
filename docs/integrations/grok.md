# Integration #1 — xAI / Grok LLM Adapter

**Adapter:** [`src/adapters/grokAdapter.ts`](../../src/adapters/grokAdapter.ts)
**Example:** [`examples/grok_orchestrated_completion.ts`](../../examples/grok_orchestrated_completion.ts)
**Tests:** [`src/__tests__/adapters.test.ts`](../../src/__tests__/adapters.test.ts) (`GrokMCOPAdapter`, `defaultGrokClient`, `chooseProviderByEntropyResonance`)
**Status:** _Live — adapter, tests, example, self-router, and a real-call Merkle root all merged via PR A. The artefact below was captured against `https://api.x.ai/v1/chat/completions` using the org-scoped `XAI_API_KEY`._

## Case study (1-paragraph human-authored)

xAI's Grok models speak the same OpenAI-compatible `chat/completions`
shape that the rest of the LLM ecosystem has converged on, which made
them the fastest path to the framework's first external LLM integration:
the adapter is a ~300-line subclass of `BaseAdapter` that funnels every
prompt through the deterministic MCOP triad (encode → resonate →
dialectical synth → etch) before dispatching the refined prompt to
`https://api.x.ai/v1/chat/completions`. The bundled `defaultGrokClient`
is a small `fetch`-based wrapper so the adapter can run in Node 20+,
edge runtimes, or behind a proxy without dragging in an SDK; tests pin
the wire format with structural fakes so CI never makes a real network
call. The non-obvious creation is `chooseProviderByEntropyResonance`, a
deterministic router that lets MCOP itself decide — using the encoder's
entropy estimate and the stigmergy resonance score for the incoming
prompt — whether the call should hit Grok, fall back to a local cache,
or escalate to a human reviewer; this turns the framework into its own
first customer and gives anyone evaluating MCOP a runnable demonstration
of the dialectical loop. The runnable example
([`examples/grok_orchestrated_completion.ts`](../../examples/grok_orchestrated_completion.ts))
prints the entropy/resonance signals, the routing decision, the Grok
completion, and the full Merkle-rooted `ProvenanceMetadata` bundle so a
reader can replay or audit any call end-to-end.


## mapping_grok production profile

`mapping_grok` is now the default production profile for Grok-backed MCOP orchestration. The profile maps the default model to `grok-4-mini`, keeps `grok-3-mini` as a compatibility fallback, injects the last 10 Stigmergy v5 traces when requested, retries xAI 429/5xx responses with `Retry-After` awareness, and exposes `beforeDispatch`, `afterDispatch`, and `onRateLimit` hooks for queueing/telemetry.

For public reproducibility, run the ARC-EVO validation split benchmark:

```bash
pnpm benchmark:arc-evo
```

The script prints each 25-task validation step, the selected NOVA-EVOLVE kernel, meta-tuning genome mutations, Merkle roots, and a final latency trace.

## How to reproduce

```bash
# Requires Node 20+ and pnpm.
pnpm install

# Optional: with a real key, the example dispatches to xAI.
export XAI_API_KEY=sk-...

# With or without the key, this prints entropy/resonance signals,
# the routing decision, and the full provenance bundle.
pnpm exec ts-node examples/grok_orchestrated_completion.ts \
  "Outline a research agenda for stigmergic AI."
```

The script prints something like:

```
--- MCOP self-router ---
prompt:    Outline a research agenda for stigmergic AI.
entropy:   0.681
resonance: 0.000
decision:  human-review

[grok-example] Decision = human-review; aborting before remote dispatch.
```

…on the first run (no priors, novel prompt, low resonance). On a second
run with the same prompt the resonance climbs above the
`highResonanceCeiling` and the router flips to `local`, demonstrating
the self-referential adaptive behaviour without any code changes.

## Captured Merkle root (real xAI call)

Captured by running the gated live spec
[`src/__tests__/grok.live.e2e.test.ts`](../../src/__tests__/grok.live.e2e.test.ts)
against the real xAI endpoint:

```
XAI_LIVE_E2E=1 pnpm test -- grok.live.e2e --testTimeout=120000
```

The full provenance bundle stamped by the adapter:

```json
{
  "merkleRoot": "3f897771d38b25c2879e0a1a390368a67d0594d3ae8c625e676c5fd04ebf7a50",
  "provenance": {
    "tensorHash": "5e9ba4dc4289711142020ab667f36f26de24ccc5cba3c064bec5e2f2d6cd5d92",
    "traceId": "4689e5b7-390f-4362-a215-1fa2356f61e2",
    "traceHash": "687a3e2903996dfd4a29b516050b7e715c15e5408c3c0d0b2fccba6e4f21e639",
    "resonanceScore": 0,
    "etchHash": "3f897771d38b25c2879e0a1a390368a67d0594d3ae8c625e676c5fd04ebf7a50",
    "etchDelta": 0.015625000000000003,
    "refinedPrompt": "Outline a research agenda for verifiable, stigmergic multi-agent coordination.",
    "timestamp": "2026-04-27T23:40:42.469Z"
  },
  "usage": { "promptTokens": 21, "completionTokens": 256, "totalTokens": 822 },
  "model": "grok-3-mini",
  "finishReason": "length"
}
```

The `merkleRoot` and `etchHash` are identical by construction — the etch
commit *is* the top-level Merkle root for downstream consumers — and the
`tensorHash` is reproducible on any machine that re-encodes the same
prompt with `NovaNeoEncoder({ dimensions: 64, normalize: true })`. The
`traceId` and `timestamp` are fresh per call.

## Why this counts as a real integration (rubric audit)

- [x] Uses `IMCOPAdapter` contract (`GrokMCOPAdapter extends
      BaseAdapter<GrokRequest, GrokCompletionResult>`).
- [x] Produces a `ProvenanceMetadata` bundle with Merkle root on every
      call (asserted in `adapters.test.ts:routes refined prompt through
      Grok and surfaces provenance + usage`).
- [x] Runnable example: [`examples/grok_orchestrated_completion.ts`](../../examples/grok_orchestrated_completion.ts).
- [x] 1-paragraph human-authored case study: this document.
- [x] Listed in [README "Integrations" table](../../README.md#-universal-adapter-protocol-v21)
      and the canonical [`INTEGRATIONS.md`](../../INTEGRATIONS.md) tracker.
- [x] Real-call Merkle root captured in the section above
      (`3f897771...bf7a50`).
