"""Gated live ARC-AGI-3 end-to-end test for the Qwen strategies.

By default this module is **skipped**. Set ``QWEN_LIVE_E2E=1`` AND
provide ``ARC_API_KEY`` (from https://three.arcprize.org) AND
``QWEN_API_KEY`` (from https://dashscope.console.aliyun.com) to run
the actual game loop against arcprize.org + DashScope.

The test:

1. Wraps ``socket.getaddrinfo`` BEFORE the SDK import to verify that
   the only hosts dialed are ``*.arcprize.org`` (the ARC SDK) and
   ``*.aliyuncs.com`` (DashScope's OpenAI-compatible endpoint). Any
   other hostname is a compliance regression.
2. Drives ``MCOPArcAgi3Agent.play("ls20-9607627b")`` with a 40-action
   budget so the run exercises a handful of LLM dispatches without
   burning ARC or DashScope quota.
3. Asserts the official scorecard was opened + closed by the SDK
   (``scorecard_id is not None``), proving the official competition
   harness was used.
4. Asserts the strategy made at least one valid pick (length of
   ``result.steps`` >= 1, every action name is in the closed action
   vocabulary).
5. Prints a structured JSON artefact (``=== QWEN ARC-AGI-3 LIVE
   ARTEFACT ===``) containing the strategy used, scorecard id, step
   count, final state, and the set of hostnames dialed -- ready to
   stamp into ``docs/integrations/qwen.md`` once a real run lands.

Invocation::

    QWEN_LIVE_E2E=1 \\
        ARC_API_KEY=... \\
        QWEN_API_KEY=... \\
        python -m pytest mcop_package/test_qwen_arcagi3_live.py -s

Skip-by-default keeps this safe to land on ``main``: CI never has
``QWEN_LIVE_E2E`` set, so the suite skips silently.
"""

from __future__ import annotations

import json
import os
import socket
from typing import Any, Set

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("QWEN_LIVE_E2E") != "1",
    reason="QWEN_LIVE_E2E=1 not set; gated live ARC-AGI-3 run is opt-in",
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


ALLOWED_HOST_SUFFIXES = (
    "arcprize.org",
    ".arcprize.org",
    "aliyuncs.com",
    ".aliyuncs.com",
)


def _host_is_allowed(host: str) -> bool:
    if host == "localhost" or host.startswith("127.") or host == "::1":
        return True
    return any(
        host == suffix.lstrip(".") or host.endswith(suffix)
        for suffix in ALLOWED_HOST_SUFFIXES
    )


@pytest.mark.parametrize(
    "strategy_name",
    ["qwen", "mapping-qwen"],
)
def test_qwen_strategy_live_arcagi3_run(strategy_name: str) -> None:
    """End-to-end: real ARC SDK + real DashScope dispatch + compliance."""
    arc_key = os.environ.get("ARC_API_KEY")
    qwen_key = os.environ.get("QWEN_API_KEY") or os.environ.get(
        "DASHSCOPE_API_KEY"
    )
    if not arc_key or not qwen_key:
        pytest.skip(
            "QWEN_LIVE_E2E=1 requires ARC_API_KEY and QWEN_API_KEY (or "
            "DASHSCOPE_API_KEY) to be set."
        )

    observed_hosts: Set[str] = set()
    spy, orig = _spy_getaddrinfo(observed_hosts)
    socket.getaddrinfo = spy  # MUST be before SDK imports.
    try:
        from mcop.adapters.arcagi3_agent import (
            MappingQwenStrategy,
            MCOPArcAgi3Agent,
            QwenStrategy,
        )

        if strategy_name == "qwen":
            strategy: Any = QwenStrategy()
        else:
            strategy = MappingQwenStrategy()

        agent = MCOPArcAgi3Agent(strategy=strategy, max_actions=40)
        result = agent.play("ls20-9607627b")
    finally:
        socket.getaddrinfo = orig

    # Compliance: official scorecard must be opened + closed.
    assert result.scorecard_id is not None, (
        "scorecard_id is None -- the official ARC SDK harness was bypassed; "
        "scoreboard cannot be validated."
    )
    # Liveness: at least one real step was taken.
    assert len(result.steps) >= 1, "no steps recorded -- LLM dispatch path is dead."
    # Vocabulary: every action name is a known ARC-AGI-3 action.
    allowed_actions = {f"ACTION{i}" for i in range(1, 7)} | {"RESET"}
    unknown = {s.action for s in result.steps} - allowed_actions
    assert not unknown, f"unknown action names in step trace: {unknown!r}"
    # Compliance: only arcprize.org + DashScope hosts were dialed.
    rogue = {h for h in observed_hosts if not _host_is_allowed(h)}
    assert not rogue, (
        f"unauthorised egress to {rogue!r}; expected only arcprize.org and "
        f"aliyuncs.com endpoints (full observed set: {observed_hosts!r})"
    )

    artefact = {
        "strategy": type(strategy).__name__,
        "model": getattr(
            strategy, "model", getattr(getattr(strategy, "qwen", None), "model", None)
        ),
        "scorecard_id": result.scorecard_id,
        "game_id": result.game_id,
        "final_state": result.final_state,
        "levels_completed": result.levels_completed,
        "n_steps": len(result.steps),
        "first_action": result.steps[0].action,
        "last_action": result.steps[-1].action,
        "hosts_dialed": sorted(observed_hosts),
    }
    print("\n=== QWEN ARC-AGI-3 LIVE ARTEFACT ===")
    print(json.dumps(artefact, indent=2))
    print("=== END ARTEFACT ===")
