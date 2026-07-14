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

## Multi-provider entropy router (Grok vs. Qwen)

The single-provider routers above are generalised by
[`chooseProviderAcrossGrokAndQwen`](../../src/adapters/multiProviderRouter.ts)
([tests](../../src/__tests__/multiProviderRouter.test.ts)). It returns
a `MultiProviderRoutingDecision` carrying not only the routing target
(`'grok' | 'qwen' | 'local' | 'human-review'`) but also a concrete
model id drawn from the chosen provider's production catalog, plus a
human-readable `reason` string the orchestrator can write to its audit
log.

```ts
// Source checkout only; run this example from the repository root.
import {
  chooseProviderAcrossGrokAndQwen,
} from './src/adapters/multiProviderRouter';

const decision = chooseProviderAcrossGrokAndQwen(
  { entropy: 0.82, resonance: 0.4 },
  {
    costPreference: 'quality',          // 'cost' | 'balanced' | 'quality'
    preferredProvider: 'auto',          // or 'grok' / 'qwen' to pin
    unavailableProviders: [],           // e.g. ['grok'] when a circuit-breaker is open
  },
);

if (decision.provider === 'qwen') {
  // dispatch via QwenMCOPAdapter with decision.model
} else if (decision.provider === 'grok') {
  // dispatch via GrokMCOPAdapter with decision.model
} else {
  // serve locally or escalate to human review
}
```

**Decision tree (in order):**

1. `resonance >= highResonanceCeiling` (default `0.7`) → `local` (cache
   hit).
2. `entropy >= noveltyEntropyFloor && resonance < lowResonanceFloor`
   (defaults `0.55` / `0.15`) → `human-review` (novel + low confidence).
3. `entropy < noveltyEntropyFloor` → `local` (familiar prompt).
4. Otherwise pick provider + model by `costPreference` and the
   `highEntropyBand` (default `0.75`):

   | `costPreference` | Entropy band                       | Auto provider | Model picked                                  |
   | ---------------- | ---------------------------------- | ------------- | --------------------------------------------- |
   | `cost`           | any                                | Qwen          | `qwen3.5-flash` (cheapest)                    |
   | `balanced`       | `< highEntropyBand`                | Qwen          | `qwen3.5-plus` (`mapping_qwen` default)       |
   | `balanced`       | `>= highEntropyBand`               | Qwen          | `qwen3-max` (promoted to flagship)            |
   | `quality`        | `< highEntropyBand`                | Qwen          | `qwen3-max` (best Qwen flagship)              |
   | `quality`        | `>= highEntropyBand`               | Grok          | `grok-4.20-0309-reasoning` (cross-verify)     |

5. If the chosen provider is in `unavailableProviders`, the router fails
   over to the other one (the `reason` field becomes
   `preferred-<chosen>-unavailable-failover-<other>`). If both are
   listed the decision degrades to `local` with reason
   `all-providers-unavailable`.

The router is **pure**: same inputs always produce the same decision,
and it never mutates the supplied config. Use
[`isCatalogedDecision`](../../src/adapters/multiProviderRouter.ts) to
assert at the orchestrator boundary that the chosen model id is still
in its provider's production catalog (guards against silent catalog
drift).

## Qwen3 catalog expansion (preview / vision / omni / long-context)

`QWEN_MODEL_MAPPINGS` (refreshed 2026-05) ships dedicated tiers beyond
the original `flagship / fast / balanced / coder / legacy` set so
orchestrators can pick the right model by capability without hand-coding
ids:

| Model              | Tier           | Context     | Notes                                                           |
| ------------------ | -------------- | ----------- | --------------------------------------------------------------- |
| `qwen3-max`        | `flagship`     | 262,144     | Highest-capability text flagship. Default `quality` pick.       |
| `qwen3-max-preview`| `preview`      | 262,144     | Pre-release flagship. Same context, prompt caching, reasoning. |
| `qwen3-vl-plus`    | `vision`       | 262,144     | Vision + function-calling + reasoning for multimodal prompts.   |
| `qwen3-omni-flash` | `omni`         | 262,144     | Text / image / speech / video input, streaming speech out.      |
| `qwen-long`        | `long-context` | 10,000,000  | File-upload + `file-id` reference mechanism for archival RAG.   |

The `qwenAdapter.catalog.test.ts` spec locks these entries (tier id,
minimum context window, non-empty `useCases`) so a future hand-edit
can't silently drop one and break orchestrators that depend on the
multimodal or extreme-long-context paths.

## ARC-AGI-3 Qwen strategies

The Python ARC-AGI-3 agent (`mcop_package/mcop/adapters/arcagi3_agent.py`)
ships two Qwen-backed strategies that mirror the Grok variants 1:1:

| Strategy class             | Phase A (mapping)        | Phase B (exploit)                                  | Mirror of           |
| -------------------------- | ------------------------ | -------------------------------------------------- | ------------------- |
| `QwenStrategy`             | n/a                      | Single-step Qwen pick per turn, snap-to-allowed    | `GrokStrategy`        |
| `MappingQwenStrategy`      | Deterministic queue walk | Qwen pick using learned action -> grid-diff map    | `MappingGrokStrategy` |

Both classes accept the same constructor surface as their Grok
counterparts (`api_key`, `base_url`, `model`, `fallback`), default to
`qwen3.5-flash` on the international DashScope compatible-mode endpoint,
and fall back to `RandomStrategy` whenever the API key is missing or the
LLM response cannot be parsed.

### CLI usage

`mcop_package/run_arcagi3_agent.py` exposes the new strategies as
`--strategy qwen` and `--strategy mapping-qwen`:

```bash
ARC_API_KEY=...  QWEN_API_KEY=... \
    python -m mcop_package.run_arcagi3_agent ls20-9607627b \
        --strategy mapping-qwen \
        --qwen-model qwen3-max \
        --max-actions 200
```

`--qwen-model` is the Qwen sibling of `--grok-model`; it threads through
to the inner `QwenStrategy.model` so the CLI flag reliably overrides any
`QWEN_MODEL` env var the workflow exported.

### Compliance invariants

The Qwen strategies preserve every ARC Prize / Kaggle compliance
invariant the Grok strategies already satisfied:

* **Official scorecard** — `MCOPArcAgi3Agent.play()` still routes through
  the official `arc-agi` SDK, so the scorecard is opened at the start of
  the run and closed in the SDK's `finally` block. The gated live test
  asserts `result.scorecard_id is not None`.
* **Online learning** — Phase A of `MappingQwenStrategy` cycles every
  available action and observes the resulting frame diff before any LLM
  dispatch fires. No pre-trained mapping is loaded from disk.
* **Closed action vocabulary** — every chosen action is either a member
  of `available_action_names` or snapped to the nearest allowed
  neighbour. Unparseable responses fall through to `RandomStrategy`
  rather than crashing the loop.
* **Egress allow-list** — the gated live test (see below) wraps
  `socket.getaddrinfo` and fails if any host other than
  `*.arcprize.org` / `*.aliyuncs.com` is dialed.

### Gated live ARC-AGI-3 e2e test

`mcop_package/test_qwen_arcagi3_live.py` exercises both strategies end
to end against a real arcprize.org game (`ls20-9607627b`, 40-action
budget). The test is skipped unless `QWEN_LIVE_E2E=1` is set, so it
never runs in CI by accident:

```bash
QWEN_LIVE_E2E=1 \
    ARC_API_KEY=... \
    QWEN_API_KEY=... \
    python -m pytest mcop_package/test_qwen_arcagi3_live.py -s
```

On a successful run the test prints a JSON artefact tagged
`=== QWEN ARC-AGI-3 LIVE ARTEFACT ===` containing the scorecard id,
final state, step count, and the full set of hostnames dialed -- the
same envelope shape used by the TS live spec above.
