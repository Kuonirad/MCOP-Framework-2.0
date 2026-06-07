"""Gated live ARC-AGI-3 end-to-end test for the holographic strategy.

By default this module is **skipped**. Set ``HOLO_LIVE_E2E=1`` AND
provide ``ARC_API_KEY`` (from https://three.arcprize.org) to run the
actual game loop against arcprize.org.

``HolographicShadowStrategy`` is a *pure-online* strategy: it makes no
LLM calls and must reach **only** ``arcprize.org``. This test proves
that at runtime, which is the strongest ARC-Prize compliance evidence
(the unit suite proves the same vocabularies offline against the fake
env; this proves the egress boundary against the real network).

The test:

1. Wraps ``socket.getaddrinfo`` BEFORE the SDK import and asserts the
   only hosts dialed are ``*.arcprize.org``. Any other hostname is a
   compliance regression (a pure-online strategy must not phone home).
2. Drives ``MCOPArcAgi3Agent.play()`` with a small action budget so the
   run exercises ``observe()`` without burning ARC quota.
3. Asserts the official scorecard was opened + closed by the SDK
   (``scorecard_id is not None``), proving the official harness was used.
4. Asserts the closed-set action vocabulary and the holographic
   provenance allow-list, and that ``observe()`` ran at least once per
   step (``provenance >= steps``) -- i.e. the strategy learned online.
5. Prints a structured ``=== HOLOGRAPHIC ARC-AGI-3 LIVE ARTEFACT ===``
   JSON envelope (scorecard id, levels_completed, hosts dialed) ready to
   stamp into a PR report.

Invocation::

    HOLO_LIVE_E2E=1 ARC_API_KEY=... OPERATION_MODE=competition \\
        python -m pytest mcop_package/test_holographic_arcagi3_live.py -s

Skip-by-default keeps this safe to land on ``main``: CI never has
``HOLO_LIVE_E2E`` set, so the suite skips silently.
"""

from __future__ import annotations

import json
import os
import socket
from typing import Any, Set

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("HOLO_LIVE_E2E") != "1",
    reason="HOLO_LIVE_E2E=1 not set; gated live ARC-AGI-3 run is opt-in",
)


def _spy_getaddrinfo(observed: Set[str]):
    """Wrap ``socket.getaddrinfo`` to record every distinct host dialed."""
    orig = socket.getaddrinfo

    def _spy(host: Any, *args: Any, **kwargs: Any) -> Any:
        if host:
            name = host.decode() if isinstance(host, bytes) else str(host)
            observed.add(name)
        return orig(host, *args, **kwargs)

    return _spy, orig


# A pure-online strategy may dial ONLY arcprize.org -- no LLM endpoints.
ALLOWED_HOST_SUFFIXES = ("arcprize.org", ".arcprize.org")

# Must match HolographicShadowStrategy's emitted provenance types and the
# allow-list in .agents/skills/testing-arcagi3-strategy/SKILL.md.
HOLO_PROVENANCE_ALLOWED = {
    "real_move",
    "blocked_wobble",
    "ambiguous_drift",
    "debug_wall_learning",
    "debug_loop_detected",
    "debug_goal_bfs",
    "positive_growth_event",
}
CLOSED_ACTION_VOCAB = {f"ACTION{i}" for i in range(1, 7)} | {"RESET"}


def _host_is_allowed(host: str) -> bool:
    if host == "localhost" or host.startswith("127.") or host == "::1":
        return True
    return any(
        host == suffix.lstrip(".") or host.endswith(suffix)
        for suffix in ALLOWED_HOST_SUFFIXES
    )


def test_holographic_strategy_live_arcagi3_run() -> None:
    """End-to-end: real ARC SDK + pure-online strategy + compliance."""
    arc_key = os.environ.get("ARC_API_KEY")
    if not arc_key:
        pytest.skip("HOLO_LIVE_E2E=1 requires ARC_API_KEY to be set.")

    observed_hosts: Set[str] = set()
    spy, orig = _spy_getaddrinfo(observed_hosts)
    socket.getaddrinfo = spy  # MUST be before SDK imports.
    try:
        from mcop.adapters.arcagi3_agent import (
            HolographicShadowStrategy,
            MCOPArcAgi3Agent,
        )

        # goal_color=None: discover the goal colour online (no per-game
        # hint); default exploration seed keeps the run replayable.
        strategy = HolographicShadowStrategy(goal_color=None)
        agent = MCOPArcAgi3Agent(strategy=strategy, max_actions=40)
        game_id = os.environ.get("HOLO_LIVE_GAME", "ls20")
        result = agent.play(game_id)
    finally:
        socket.getaddrinfo = orig

    # Compliance: official scorecard must be opened + closed.
    assert result.scorecard_id is not None, (
        "scorecard_id is None -- the official ARC SDK harness was bypassed."
    )
    # Liveness: at least one real step was taken.
    assert len(result.steps) >= 1, "no steps recorded -- play loop is dead."
    # Vocabulary: every action name is a known ARC-AGI-3 action.
    unknown = {s.action for s in result.steps} - CLOSED_ACTION_VOCAB
    assert not unknown, f"unknown action names in step trace: {unknown!r}"
    # Online learning: observe() ran and recorded allow-listed provenance.
    assert len(strategy.provenance) >= len(result.steps), (
        "provenance < steps -- observe() did not run every step (no online "
        "learning)."
    )
    seen_types = {p["type"] for p in strategy.provenance}
    assert seen_types <= HOLO_PROVENANCE_ALLOWED, (
        f"un-allow-listed provenance types: {seen_types - HOLO_PROVENANCE_ALLOWED!r}"
    )
    # Compliance: a pure-online strategy must dial ONLY arcprize.org.
    rogue = {h for h in observed_hosts if not _host_is_allowed(h)}
    assert not rogue, (
        f"unauthorised egress to {rogue!r}; a pure-online strategy must reach "
        f"only arcprize.org (full observed set: {observed_hosts!r})"
    )

    artefact = {
        "strategy": type(strategy).__name__,
        "scorecard_id": result.scorecard_id,
        "game_id": result.game_id,
        "operation_mode": os.environ.get("OPERATION_MODE", "normal (default)"),
        "final_state": result.final_state,
        "levels_completed": result.levels_completed,
        "n_steps": len(result.steps),
        "goal_color_discovered": strategy.goal_color,
        "player_color_discovered": strategy.player_color,
        "provenance_types": sorted(seen_types),
        "hosts_dialed": sorted(observed_hosts),
    }
    print("\n=== HOLOGRAPHIC ARC-AGI-3 LIVE ARTEFACT ===")
    print(json.dumps(artefact, indent=2))
    print("=== END ARTEFACT ===")
