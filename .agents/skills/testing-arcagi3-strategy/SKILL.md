---
name: testing-arcagi3-strategy
description: End-to-end test any ARC-AGI-3 `Strategy` subclass (HolographicShadowStrategy, RandomStrategy, GrokStrategy, MappingGrokStrategy, QwenStrategy, MappingQwenStrategy, etc.) against the official arcprize.org SDK while staying 100% ARC Prize / Kaggle compliant. Use when verifying strategy / adapter changes in `mcop_package/mcop/adapters/arcagi3_agent.py`.
---

# Testing ARC-AGI-3 strategies end-to-end (ARC Prize / Kaggle compliant)

This skill covers driving a `Strategy` subclass through `MCOPArcAgi3Agent.play()` against a live arcprize.org game, while enforcing the competition's rules at runtime.

## Devin Secrets Needed

- `ARC_API_KEY` — issued at https://three.arcprize.org. Sent as the `X-API-Key` header by the `arc-agi` SDK. Already saved org-scoped.
- (Grok-backed strategies only) `GROK_API_KEY` — for `GrokStrategy` / `MappingGrokStrategy`.
- (Qwen-backed strategies only) `QWEN_API_KEY` — for `QwenStrategy` / `MappingQwenStrategy`. Falls back to `DASHSCOPE_API_KEY` if that env var name is preferred. Default model is `qwen3.5-flash` on `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`. Already saved org-scoped.
- **Do not set an LLM key when testing a pure-online strategy like `HolographicShadowStrategy`** — the compliance assertions for those require zero non-arcprize.org egress.

## Setup (per-session)

The `mcop_package` Python deps are not preinstalled in the snapshot. Install editable, plus `arc-agi`, `openai`, and `pytest`:

```bash
cd ~/repos/MCOP-Framework-2-0
python -m pip install -e mcop_package pytest --quiet
python -m pip install arc-agi openai --quiet
python -c "from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent, HolographicShadowStrategy, QwenStrategy, MappingQwenStrategy; import arc_agi, openai; print('ok')"
```

The `openai` SDK is only needed if you're driving an LLM-backed strategy (`GrokStrategy`, `QwenStrategy`, or the `Mapping*` variants); it's harmless to install for the pure-online strategies.

If you see `ModuleNotFoundError: No module named 'rfc8785'`, the editable `mcop_package` install was skipped — re-run the install command.

## Game id selection

`MCOPArcAgi3Agent.list_games()` returns ~25 game ids. The canonical example referenced in `mcop_package/run_arcagi3_agent.py`'s docstring is `ls20-9607627b`. For *behavior verification* (not solving), `max_actions=40–80` is a good budget — it exercises `observe()` enough to populate the provenance trace without burning ARC or LLM quota.

```python
agent = MCOPArcAgi3Agent(strategy=HolographicShadowStrategy(), max_actions=80)
agent.list_games()  # 25 game ids; canonical example = ls20-9607627b
```

## ARC Prize / Kaggle compliance — verify at runtime, not just by inspection

The agent is competition-compliant by construction (online learning, full provenance, official scorecard). Tests must *prove* this at runtime by:

1. **Hostname allow-list** — wrap `socket.getaddrinfo` BEFORE importing anything that pulls `arc_agi` / `requests` / `openai`, log every distinct hostname dialed, and fail the test if any host is not in the strategy's allow-list:
   - Pure-online strategies (e.g. `HolographicShadowStrategy`): `*.arcprize.org` only.
   - Grok-backed strategies: `*.arcprize.org` + `api.x.ai`.
   - Qwen-backed strategies: `*.arcprize.org` + `*.aliyuncs.com` (typically `dashscope-intl.aliyuncs.com`).

   Example wrapper: see `mcop_package/test_qwen_arcagi3_live.py::_spy_getaddrinfo` for the canonical pattern (must be installed BEFORE the SDK import).

2. **Scorecard lifecycle** — assert `result.scorecard_id is not None` after `play()` returns. The SDK opens the scorecard at the start of `play()` and closes it in the `finally` block; a None id means the official harness was bypassed.

3. **Closed-set action vocabulary** — every `step.action` must be in `{ACTION1, ACTION2, ACTION3, ACTION4, ACTION5, ACTION6, RESET}`. Any other string means `_decide_action`'s snap-to-allowed path is broken.

4. **Closed-set provenance vocabulary** — for `HolographicShadowStrategy`, every `provenance[i]["type"]` must be in `{real_move, blocked_wobble, ambiguous_drift, debug_wall_learning, debug_loop_detected, debug_goal_bfs, positive_growth_event}`. Unknown types reveal a regression. (`debug_goal_bfs` was added by PR #649 and is emitted by the goal-BFS planner; `positive_growth_event` is emitted when MCOP resonance crosses `resonance_event_threshold`.)

5. **Provenance non-empty** — `len(strategy.provenance) >= len(result.steps)`. If `observe()` was never called, the strategy didn't learn online.

6. **Determinism / replay** — drive a fresh strategy through the same hand-built frame sequence twice; the provenance type streams must be identical. Use `_HoloFrame` and `_grid_with_goal()` from `mcop_package/test_arcagi3_agent.py` as the canonical test stub. Note: `HolographicShadowStrategy`'s no-trusted-goal bootstrap regime (`goal_color=None`, the production default) uses an **epsilon-greedy explorer seeded from `exploration_seed` (default `0`)**, so a fresh strategy still replays identically; `run_arcagi3_agent` routes `--seed` to it (blank → 0). Replay only breaks if you explicitly pass `exploration_seed=None`. The canonical regression is `test_holographic_strategy_bootstrap_replay_is_deterministic`.

7. **Official remote environment — no offline data, by construction** — `arcagi3-run.yml` sets `OPERATION_MODE` (default `competition`; also `online`), so the `arc-agi` SDK plays against the remote arcprize.org environment and **never downloads game files to disk**. That makes the no-offline-data / no-peeking rule *structural*, not a promise. `ONLY_RESET_LEVELS=true` enforces the competition reset rule (a `GAME_OVER` reset restarts the current level, never the whole game). Use `normal` mode only for offline dev — it *does* fetch the game source to `environment_files/<id>/<ver>/<id>.py` (useful for debugging the env), but never copy a game-specific fact from there into a strategy: that would break the no-per-game-hardcoding rule.

8. **CI-enforced compliance, offline** — `test_holographic_play_runtime_compliance_against_fake_env` runs in normal CI (zero ARC quota): it drives a full `play()` loop against the fake env and asserts items 2–5 (scorecard set, closed-set actions, allow-listed provenance, `provenance >= steps`). The gated live test (below) proves item 1 (egress boundary) against the real network. Together they make "100% compliant" continuously checked, not just asserted in a PR description.

## Gated live tests already in the repo

For LLM-backed strategies the canonical live test is already wired and gated by an env var so CI never runs it. The one-command recipes:

```bash
# Qwen strategies (QwenStrategy + MappingQwenStrategy, parametrised)
QWEN_LIVE_E2E=1 ARC_API_KEY="$ARC_API_KEY" QWEN_API_KEY="$QWEN_API_KEY" \
    python -m pytest mcop_package/test_qwen_arcagi3_live.py -s -v
```

Expected wall-clock against `ls20-9607627b` with `max_actions=40`: roughly 5 minutes per parametrised case for `qwen3.5-flash` (so ~10–18 minutes for both). Prefer to plan testing sessions accordingly — don't poll output too aggressively. The test prints a `=== QWEN ARC-AGI-3 LIVE ARTEFACT ===` JSON envelope on success containing `strategy`, `model`, `scorecard_id`, `game_id`, `final_state`, `levels_completed`, `n_steps`, and `hosts_dialed`. Stamp that envelope into the PR test report as proof.

```bash
# Holographic (pure-online, NO LLM key) -- asserts arcprize.org-only egress
HOLO_LIVE_E2E=1 ARC_API_KEY="$ARC_API_KEY" OPERATION_MODE=competition \
    python -m pytest mcop_package/test_holographic_arcagi3_live.py -s -v
```

The holographic case is fast (no LLM round-trips — seconds, not minutes) and prints a `=== HOLOGRAPHIC ARC-AGI-3 LIVE ARTEFACT ===` envelope with `scorecard_id`, `levels_completed`, `goal_color_discovered`, `provenance_types`, and `hosts_dialed` (must be arcprize.org only). Optional `HOLO_LIVE_GAME=<id>` overrides the default game. **Do not set any LLM key** when running it — the egress assertion fails if a non-arcprize.org host is dialed, which is exactly the property it guards.

## Live-run harness skeleton (for new strategies without a gated test yet)

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
allowed = {"real_move", "blocked_wobble", "ambiguous_drift", "debug_wall_learning", "debug_loop_detected", "debug_goal_bfs", "positive_growth_event"}
assert {p["type"] for p in strategy.provenance} <= allowed
```

## Adversarial pattern — distinguishing "feature works" from "no-op stub"

When testing a strategy change that adds a new behaviour gated by a flag (e.g. `enable_goal_bfs=True/False` from PR #649), run the **same game / same budget / same seed** twice and compare:

- The provenance type histogram (e.g. `Counter(p["type"] for p in strategy.provenance)`)
- The first-N action sequence
- The `levels_completed` count

If the two runs are identical, the new feature is a no-op stub. If they differ in a way that's consistent with the documented behaviour, the change is real. Use the gated test as a regression baseline going forward.

## Things that look suspicious but aren't

- `final_state == "NOT_FINISHED"` and `levels_completed == 0` on a 40-action budget for `ls20-9607627b`: expected; the game needs far more turns to clear a level. The compliance assertions never require completion — they require the agent loop to dispatch through the official scorecard harness with closed-vocab actions.
- A Mapping*Strategy run staying on `ACTION1` for the full budget: expected because Phase A walks the action queue deterministically with no LLM calls; the queue can advance slowly within a small budget. A non-Mapping LLM strategy will typically vary its action choice every turn.
- `HolographicShadowStrategy` log lines like `goal-colour discovered: None -> 8`: expected. The compliant default is `goal_color=None` (discover the goal colour online from the first level advance) — **not** a hard-coded colour. Until discovery it runs the frontier + epsilon-greedy explorer (no goal-BFS / goal-alignment); after discovery it switches into goal-seeking. A fixed colour is honoured only when explicitly supplied (operator `--goal-color` / `HOLOGRAPHIC_GOAL_COLOR`). On click-driven games (only `ACTION6`, no movable player) it sweeps distinct cell targets rather than clicking one fixed coordinate. None of this adds egress or per-game knowledge — it is all learned online from the live frames.
