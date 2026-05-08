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

3. **Closed-set provenance vocabulary** — for `HolographicShadowStrategy`, every `provenance[i]["type"]` must be in `{real_move, blocked_wobble, ambiguous_drift, debug_wall_learning, debug_loop_detected, debug_goal_bfs}`. Unknown types reveal a regression. (`debug_goal_bfs` was added by PR #649 and is emitted by the goal-BFS planner.)

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
allowed = {"real_move", "blocked_wobble", "ambiguous_drift", "debug_wall_learning", "debug_loop_detected", "debug_goal_bfs"}
assert {p["type"] for p in strategy.provenance} <= allowed
```

## Adversarial pattern — distinguishing "feature works" from "no-op stub"

When testing a strategy change that adds a new behaviour gated by a flag (e.g. `enable_goal_bfs=True/False` from PR #649), run the **same game / same budget / same seed** twice and compare:

- **Feature ON** — the new provenance type (e.g. `debug_goal_bfs`) must fire enough times to prove engagement (≥ 5 etches in 80 steps for the BFS planner).
- **Feature OFF** — the new provenance type must produce **exactly zero** etches.

If both produce the new type, the disable flag is a no-op. If neither produces it, the feature is dead code. Pair this with the compliance gates above to catch regressions a single-run smoke would miss. PR #649's test report is the canonical example: `BFS ON: 49 etches; BFS OFF: 0 etches; only three.arcprize.org` — see `/tmp/test-plan-pr649.md` and `/tmp/test-report-pr649.md` for the full pattern.

## Useful strategy attributes after `play()`

- `strategy.provenance: List[Dict[str, Any]]` — every observed step's classification + debug etches. Inspect histogram of `["type"]` first.
- `strategy.walls: Dict[Tuple[str, str], int]` — `(state_hash, action) -> wall_hits`. `len(walls)` should match the count of distinct `(state_hash, action)` pairs seen blocked.
- `strategy.position_walls: Dict[Tuple[int, int], Set[str]]` — (added by PR #649) per-binned-player-position blocked actions, mirrored from `walls` whenever a `blocked_wobble` fires at a known centroid. The goal-BFS planner consults this map directly.
- `strategy.action_drift_sums` / `action_drift_counts` — (added by PR #648) per-action mean-drift accumulators learned online. The goal-BFS planner uses `int(round(action_mean_drift))` as the move table.
- `strategy.state_action_tries: Dict[Tuple[str, str], int]` — per-state try counter that drives oscillation novelty.
