---
name: testing-arcagi3-strategy
description: End-to-end test any ARC-AGI-3 `Strategy` subclass (HolographicShadowStrategy, RandomStrategy, GrokStrategy, MappingGrokStrategy, etc.) against the official arcprize.org SDK while staying 100% ARC Prize / Kaggle compliant. Use when verifying strategy / adapter changes in `mcop_package/mcop/adapters/arcagi3_agent.py`.
---

# Testing ARC-AGI-3 strategies end-to-end (ARC Prize / Kaggle compliant)

This skill covers driving a `Strategy` subclass through `MCOPArcAgi3Agent.play()` against a live arcprize.org game, while enforcing the competition's rules at runtime.

## Devin Secrets Needed

- `ARC_API_KEY` — issued at https://three.arcprize.org. Sent as the `X-API-Key` header by the `arc-agi` SDK. Already saved org-scoped.
- (LLM strategies only) `GROK_API_KEY` — for `GrokStrategy` / `MappingGrokStrategy`. **Do not set this when testing a pure-online strategy like `HolographicShadowStrategy`** — the compliance assertions in this skill require zero non-arcprize.org egress.

## Setup (per-session)

The `mcop_package` Python deps are not preinstalled in the snapshot. Install editable, plus `arc-agi` and `pytest`:

```bash
cd ~/repos/MCOP-Framework-2-0
python -m pip install -e mcop_package pytest --quiet
python -m pip install arc-agi --quiet
python -c "from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent, HolographicShadowStrategy; import arc_agi; print('ok')"
```

If you see `ModuleNotFoundError: No module named 'rfc8785'`, the editable `mcop_package` install was skipped — re-run the install command.

## Game id selection

`MCOPArcAgi3Agent.list_games()` returns ~25 game ids. The canonical example referenced in `mcop_package/run_arcagi3_agent.py`'s docstring is `ls20-9607627b`. For *behavior verification* (not solving), `max_actions=80` is a good budget — it exercises `observe()` enough to populate the provenance trace without burning ARC quota.

```python
agent = MCOPArcAgi3Agent(strategy=HolographicShadowStrategy(), max_actions=80)
agent.list_games()  # 25 game ids; smallest budget = ls20-9607627b
```

## ARC Prize / Kaggle compliance — verify at runtime, not just by inspection

The agent is competition-compliant by construction (online learning, full provenance, official scorecard). Tests must *prove* this at runtime by:

1. **Hostname allow-list** — wrap `socket.getaddrinfo` BEFORE importing anything that pulls `arc_agi` / `requests`, log every distinct hostname dialed, and fail the test if any host is not `arcprize.org` or `*.arcprize.org`. Example wrapper lives at `/tmp/holographic_live_run.py`'s `_spy_getaddrinfo` (search this repo for the canonical pattern).

2. **Scorecard lifecycle** — assert `result.scorecard_id is not None` after `play()` returns. The SDK opens the scorecard at the start of `play()` and closes it in the `finally` block; a None id means the official harness was bypassed.

3. **Closed-set provenance vocabulary** — for `HolographicShadowStrategy`, every `provenance[i]["type"]` must be in `{real_move, blocked_wobble, ambiguous_drift, debug_wall_learning, debug_loop_detected}`. Unknown types reveal a regression.

4. **Provenance non-empty** — `len(strategy.provenance) >= len(result.steps)`. If `observe()` was never called, the strategy didn't learn online.

5. **Determinism / replay** — drive a fresh strategy through the same hand-built frame sequence twice; the provenance type streams must be identical. Use `_HoloFrame` and `_grid_with_goal()` from `mcop_package/test_arcagi3_agent.py` as the canonical test stub.

## Live-run harness skeleton

```python
# /tmp/holographic_live_run.py (or similar)
import socket
_observed = set()
_orig = socket.getaddrinfo
def _spy(host, *a, **k):
    if host: _observed.add(host.decode() if isinstance(host, bytes) else str(host))
    return _orig(host, *a, **k)
socket.getaddrinfo = _spy  # MUST be before the next imports

from mcop.adapters.arcagi3_agent import HolographicShadowStrategy, MCOPArcAgi3Agent

strategy = HolographicShadowStrategy()
agent = MCOPArcAgi3Agent(strategy=strategy, max_actions=80)
result = agent.play("ls20-9607627b")

assert result.scorecard_id is not None
assert all(h.endswith(".arcprize.org") or h == "arcprize.org" for h in _observed), _observed
assert len(strategy.provenance) >= len(result.steps) >= 1
allowed = {"real_move", "blocked_wobble", "ambiguous_drift", "debug_wall_learning", "debug_loop_detected"}
assert {p["type"] for p in strategy.provenance} <= allowed
```

## Useful strategy attributes after `play()`

- `strategy.provenance: List[Dict[str, Any]]` — every observed step's classification + debug etches. Inspect histogram of `["type"]` first.
- `strategy.walls: Dict[Tuple[str, str], int]` — `(state_hash, action) -> wall_hits`. `len(walls)` should match the count of distinct `(state_hash, action)` pairs seen blocked.
- `strategy.state_action_tries: Dict[Tuple[str, str], int]` — per-state try counter that drives oscillation novelty.
- `strategy._loop_signatures_seen: set` — dedup set for `debug_loop_detected` emissions; non-zero only if oscillation was detected.
- `strategy._goal_detector.current()` — the goal colour discovered online; `None` if no level-advance happened during the run (correct fallback per the documented online-only contract).

**Common attribute mistake:** `strategy._goal_color_detector` does NOT exist; use `strategy._goal_detector` (the `_GoalColorDetector` instance, accessed via its `.current()` method).

## Behaviors that may NOT trigger in a short live game

A bounded budget against a single game often won't surface every v2 behavior. Cover the long tail with a deterministic in-process harness using `_HoloFrame`/`_grid_with_goal` from the test suite, hand-patching `_goal_centroid` / `_state_hash` / `state_action_tries` as needed. See `/tmp/holographic_deterministic_harness.py` (when present) for the canonical pattern, or the tests themselves at `mcop_package/test_arcagi3_agent.py` lines ~1235–1340.

Behaviors most likely to require the offline harness:
- `ambiguous_drift` (centroid delta in `[0.5, 1.5)` — needs hand-patched `_goal_centroid`)
- `debug_loop_detected` (needs ABAB centroid history with both actions registering as moves)
- `_state_hash` invariance over non-goal cells (B1) — easy to verify offline, no game required.

## When to record

**Do not record** for shell-only ARC-AGI-3 strategy testing. Recording captures the screen and the work is entirely terminal-based (Python harness output, `arc_agi` log lines, assertion lines). Capture the harness stdout/stderr to `/tmp/*.log` and attach to the report instead.

## Reporting

- Post a single consolidated PR comment using `<details>` blocks per phase.
- Lead with the compliance table (C1..C5) since the user has historically asked for explicit ARC Prize / Kaggle adherence.
- Include the hostname log in the body — it's the single strongest evidence of "no external LLM calls during play()".
- Note: `final_state == NOT_FINISHED` is *expected* for an 80-action behavior-verification run on `ls20-9607627b`. It is not a failure; the run is for behavior verification, not game-solving.
