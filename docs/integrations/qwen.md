# Integration #6 — Alibaba / Qwen (DashScope) LLM Adapter

**Adapter:** [`src/adapters/qwenAdapter.ts`](../../src/adapters/qwenAdapter.ts)
**Example:** [`examples/qwen_orchestrated_completion.ts`](../../examples/qwen_orchestrated_completion.ts)
**Tests:** [`src/__tests__/adapters.test.ts`](../../src/__tests__/adapters.test.ts) (`QwenMCOPAdapter`, `defaultQwenClient`, `chooseQwenByEntropyResonance`)
**Status:** _Live — adapter, tests, example, and self-router are merged. The gated live spec at [`src/__tests__/qwen.live.e2e.test.ts`](../../src/__tests__/qwen.live.e2e.test.ts) captures a real DashScope Merkle root when `QWEN_API_KEY` and `QWEN_LIVE_E2E=1` are set._

## Case study (1-paragraph human-authored)

Alibaba DashScope serves the Qwen3 / Qwen3.5 / Qwen3.6 chat models over
an OpenAI-compatible `chat/completions` shape, which made them the
natural second LLM integration after Grok — the adapter is a 1:1 mirror
of `grokAdapter.ts` that funnels every prompt through the deterministic
MCOP triad (encode → resonate → dialectical synth → etch) before
dispatching the refined prompt to
`https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`.
The bundled `defaultQwenClient` is a small `fetch`-based wrapper so the
adapter can run in Node 20+, edge runtimes, or behind a proxy without
dragging in an SDK; tests pin the wire format with structural fakes so
CI never makes a real network call. The non-obvious creation is
`chooseQwenByEntropyResonance`, a deterministic router (parallel to the
Grok variant `chooseProviderByEntropyResonance`) that lets MCOP itself
decide — using the encoder's entropy estimate and the stigmergy
resonance score for the incoming prompt — whether the call should hit
Qwen, fall back to a local cache, or escalate to a human reviewer; this
turns the framework into its own first customer and gives anyone
evaluating MCOP a runnable demonstration of the dialectical loop. The
runnable example
([`examples/qwen_orchestrated_completion.ts`](../../examples/qwen_orchestrated_completion.ts))
prints the entropy/resonance signals, the routing decision, the Qwen
completion, and the full Merkle-rooted `ProvenanceMetadata` bundle so a
reader can replay or audit any call end-to-end.

## mapping_qwen production profile

`mapping_qwen` is the default production profile for Qwen-backed MCOP
orchestration. The profile maps the default model to `qwen3.5-plus`,
keeps `qwen3.5-flash` as a low-latency fallback, injects the last 10
Stigmergy v5 traces when requested, retries DashScope 429/5xx responses
with `Retry-After` awareness, and exposes `beforeDispatch`,
`afterDispatch`, and `onRateLimit` hooks for queueing/telemetry. The
shape is intentionally identical to `mapping_grok` so an orchestrator
can swap providers without touching the triad configuration.

## How to reproduce

```bash
# Requires Node 22+ and pnpm.
pnpm install

# Optional: with a real key, the example dispatches to DashScope.
# Either env var is accepted; QWEN_API_KEY is preferred.
export QWEN_API_KEY=sk-...

# With or without the key, this prints entropy/resonance signals,
# the routing decision, and the full provenance bundle.
pnpm exec ts-node examples/qwen_orchestrated_completion.ts \
  "Outline a research agenda for stigmergic AI."
```

The script prints something like:

```
--- MCOP self-router (Qwen) ---
prompt:    Outline a research agenda for stigmergic AI.
entropy:   0.681
resonance: 0.000
decision:  human-review

[qwen-example] Decision = human-review; aborting before remote dispatch.
```

…on the first run (no priors, novel prompt, low resonance). On a second
run with the same prompt the resonance climbs above the
`highResonanceCeiling` and the router flips to `local`, demonstrating
the self-referential adaptive behaviour without any code changes.

## Live Merkle-root capture

Captured by running the gated live spec
[`src/__tests__/qwen.live.e2e.test.ts`](../../src/__tests__/qwen.live.e2e.test.ts)
against the real DashScope endpoint:

```
QWEN_LIVE_E2E=1 pnpm test -- qwen.live.e2e --testTimeout=120000
```

The output is a JSON envelope containing `merkleRoot`, the full
`ProvenanceMetadata`, the DashScope `usage` block, the model that
actually served the request, and the first 320 characters of the
completion. The `merkleRoot` and `provenance.etchHash` are identical by
construction — the etch commit *is* the top-level Merkle root for
downstream consumers — so any replay against the same input deterministically
reproduces the same root.

### Captured artefact (2026-05-11)

The following envelope was produced by running the gated live spec
against `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`
with the prompt _"Outline a research agenda for verifiable, stigmergic
multi-agent coordination."_ on `2026-05-11T17:07:52.570Z`:

```json
{
  "merkleRoot": "3b38949b21eefb771430b9bb0243ed1c31a990e47a639f9a26e428edce199da6",
  "provenance": {
    "tensorHash": "5e9ba4dc4289711142020ab667f36f26de24ccc5cba3c064bec5e2f2d6cd5d92",
    "traceId": "66377b75-1bf5-4fe4-8a48-4d3311c653a6",
    "traceHash": "efdad623b5fbd478bb07c91da2d886f17364bc5c3910f7f5203e72c526e751f7",
    "resonanceScore": 0,
    "etchHash": "3b38949b21eefb771430b9bb0243ed1c31a990e47a639f9a26e428edce199da6",
    "etchDelta": 0.015625000000000003,
    "refinedPrompt": "Outline a research agenda for verifiable, stigmergic multi-agent coordination.",
    "device": "cpu",
    "accelerator": {
      "device": "cpu",
      "mode": "cpu",
      "kernel": "holographic-write",
      "provider": "alibaba-qwenAdapter",
      "timestamp": "2026-05-11T17:07:52.570Z",
      "fallback": true,
      "fallbackReason": "default synchronous CPU path",
      "merkleRoot": "cd8d51ed18539296b5fe5918fee6c0746d6d47fe5b20baea0e92f0b69a95ba9a"
    },
    "timestamp": "2026-05-11T17:07:52.570Z"
  },
  "usage": {
    "promptTokens": 26,
    "completionTokens": 1392,
    "totalTokens": 1418
  },
  "model": "qwen3.5-flash",
  "finishReason": "length",
  "contentPreview": "# Research Agenda: Verifiable, Stigmergic Multi-Agent Coordination\n\n## Executive Summary\nStigmergy (indirect coordination via environmental modification) offers superior scalability and robustness for multi-agent systems (MAS) compared to direct communication. However, its emergent nature makes formal verification, saf"
}
```

Notable invariants confirmed by this run:

- `merkleRoot === provenance.etchHash` — the etch commit *is* the
  top-level Merkle root. Any auditor who recomputes the etch over the
  same `(tensorHash, traceHash, resonanceScore, refinedPrompt)` tuple
  reproduces the root exactly.
- `provenance.accelerator.provider === 'alibaba-qwenAdapter'` — the
  triad's accelerator block correctly attributes the dispatch to the
  Qwen adapter, so multi-provider replay graphs can disambiguate this
  trace from a Grok-served sibling at the same timestamp.
- `model === 'qwen3.5-flash'` and `usage.totalTokens === 1418` —
  DashScope echoed the requested model and surfaced a populated usage
  block that the adapter forwards verbatim.

## Parity with the Grok integration

`QwenMCOPAdapter` is a strict 1:1 mirror of `GrokMCOPAdapter`:

| Aspect                               | Grok                                  | Qwen                                  |
| ------------------------------------ | ------------------------------------- | ------------------------------------- |
| Platform name                        | `xai-grok`                            | `alibaba-qwen`                        |
| API surface                          | OpenAI-compatible chat completions    | OpenAI-compatible chat completions    |
| Default base URL                     | `https://api.x.ai/v1`                 | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| API key env var                      | `XAI_API_KEY`                         | `QWEN_API_KEY` (fallback `DASHSCOPE_API_KEY`) |
| Production profile                   | `mapping_grok`                        | `mapping_qwen`                        |
| Low-memory preset                    | `GROK_4_3_LOW_MEMORY_MCOP_PRESET`     | `QWEN3_LOW_MEMORY_MCOP_PRESET`        |
| Self-router                          | `chooseProviderByEntropyResonance`    | `chooseQwenByEntropyResonance`        |
| Routing decisions                    | `'grok' \| 'local' \| 'human-review'` | `'qwen' \| 'local' \| 'human-review'` |
| Pipeline hooks                       | `beforeDispatch`, `afterDispatch`, `onRateLimit` | identical                  |
| Stigmergy history injection          | yes                                   | yes (same memory-block format)        |
| Rate-limit retry with `Retry-After`  | yes                                   | yes                                   |
| Live e2e gate env var                | `XAI_LIVE_E2E=1`                      | `QWEN_LIVE_E2E=1`                     |

Because the two adapters share the same pipeline-hook surface and
stigmergy-history protocol, an orchestrator can route a single
`AdapterRequest` to either provider depending on the entropy/resonance
signals without translating the payload.
