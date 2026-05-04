"""Unit tests for the ARC-AGI-3 Grok action parser + snap-to-allowed.

These tests focus on the pure logic that runs *before* any network call:
the JSON parser, the snap-to-allowed neighbour selection, and the
Phase A mapping-queue logging path. The actual ARC SDK and OpenAI
client are not exercised so the tests run in any Python environment
``mcop_package`` itself supports.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple
from unittest import mock

from mcop.adapters.arcagi3_agent import (
    GrokStrategy,
    MappingGrokStrategy,
    RandomStrategy,
    _decide_action,
    _parse_action,
    _snap_to_allowed,
)


ALLOWED_4 = ["ACTION1", "ACTION2", "ACTION3", "ACTION4"]
ALLOWED_FULL = ["ACTION1", "ACTION2", "ACTION3", "ACTION4", "ACTION5", "ACTION6"]


# ---- _snap_to_allowed ------------------------------------------------------

def test_snap_to_allowed_picks_nearest_lower_neighbour() -> None:
    # The bug log: Grok picked ACTION5 with allowed=[ACTION1..ACTION4].
    # Snap should pick ACTION4 (distance 1) over ACTION1 (distance 4).
    assert _snap_to_allowed("ACTION5", ALLOWED_4) == "ACTION4"


def test_snap_to_allowed_picks_nearest_when_target_is_high() -> None:
    assert _snap_to_allowed("ACTION9", ALLOWED_4) == "ACTION4"


def test_snap_to_allowed_ties_prefer_lower_number() -> None:
    # ACTION3 between ACTION1 and ACTION5: |3-1|=|3-5|=2; prefer ACTION1.
    assert _snap_to_allowed("ACTION3", ["ACTION1", "ACTION5"]) == "ACTION1"


def test_snap_to_allowed_exact_match_returns_same() -> None:
    assert _snap_to_allowed("ACTION2", ALLOWED_4) == "ACTION2"


def test_snap_to_allowed_returns_none_when_no_numeric_suffix() -> None:
    assert _snap_to_allowed("RESET", ALLOWED_4) is None
    assert _snap_to_allowed("", ALLOWED_4) is None


def test_snap_to_allowed_returns_none_when_allowed_has_no_numeric() -> None:
    assert _snap_to_allowed("ACTION5", ["RESET", "QUIT"]) is None


def test_snap_to_allowed_handles_lowercase_and_spaces() -> None:
    # The regex is case-insensitive and tolerates a space between the word
    # and the digit, so models that emit "Action 5" still snap correctly.
    assert _snap_to_allowed("action 5", ALLOWED_4) == "ACTION4"


# ---- _decide_action --------------------------------------------------------

def test_decide_action_ok_path() -> None:
    parsed, outcome = _decide_action('{"action": "ACTION2"}', ALLOWED_4)
    assert outcome.kind == "ok"
    assert parsed == ("ACTION2", {})


def test_decide_action_ok_with_complex_action_payload() -> None:
    parsed, outcome = _decide_action(
        '{"action": "ACTION6", "x": 12, "y": 34}', ALLOWED_FULL
    )
    assert outcome.kind == "ok"
    assert parsed == ("ACTION6", {"x": 12, "y": 34})


def test_decide_action_snaps_disallowed_action() -> None:
    # The exact failure mode caught in the user's log:
    # mapping-grok response "{"action": "ACTION5"}" with allowed=[1..4].
    parsed, outcome = _decide_action('{"action": "ACTION5"}', ALLOWED_4)
    assert outcome.kind == "snapped"
    assert outcome.raw_action == "ACTION5"
    assert outcome.snapped_to == "ACTION4"
    assert parsed == ("ACTION4", {})


def test_decide_action_disallowed_no_snap_when_no_numeric_neighbour() -> None:
    parsed, outcome = _decide_action(
        '{"action": "QUIT"}', ALLOWED_4
    )
    assert parsed is None
    assert outcome.kind == "disallowed_no_snap"
    assert outcome.raw_action == "QUIT"


def test_decide_action_no_braces() -> None:
    parsed, outcome = _decide_action("plain English", ALLOWED_4)
    assert parsed is None
    assert outcome.kind == "no_braces"


def test_decide_action_invalid_json() -> None:
    parsed, outcome = _decide_action("{this is not json}", ALLOWED_4)
    assert parsed is None
    assert outcome.kind == "invalid_json"


def test_decide_action_missing_action_field() -> None:
    parsed, outcome = _decide_action('{"x": 1, "y": 2}', ALLOWED_4)
    assert parsed is None
    assert outcome.kind == "missing_action"


def test_decide_action_passes_complex_default_to_snapped_action() -> None:
    # If ACTION6 isn't allowed but the model picks it, we wouldn't snap to
    # ACTION6 anyway -- but if the snapped result IS COMPLEX, default
    # coordinates should come from complex_default rather than (0, 0).
    parsed, outcome = _decide_action(
        '{"action": "ACTION7"}',
        ["ACTION6"],
        complex_default=(11, 22),
    )
    assert outcome.kind == "snapped"
    assert outcome.snapped_to == "ACTION6"
    assert parsed == ("ACTION6", {"x": 11, "y": 22})


# ---- _parse_action backward compatibility ----------------------------------

def test_parse_action_backward_compat_ok() -> None:
    assert _parse_action('{"action": "ACTION2"}', ALLOWED_4) == ("ACTION2", {})


def test_parse_action_backward_compat_strict_on_disallowed() -> None:
    # Old callers relying on _parse_action must still get None for any
    # non-exact match; snap is opt-in via _decide_action.
    assert _parse_action('{"action": "ACTION5"}', ALLOWED_4) is None


def test_parse_action_backward_compat_strict_on_garbage() -> None:
    assert _parse_action("no json here", ALLOWED_4) is None


# ---- Mapping-grok Phase A logging ------------------------------------------

def test_mapping_grok_phase_a_logs_each_pick(
    caplog: Any,
) -> None:
    strat = MappingGrokStrategy(api_key="")
    caplog.set_level(logging.INFO, logger="mcop.adapters.arcagi3_agent")

    available = ["ACTION1", "ACTION2", "ACTION3"]
    fake_frame: Any = object()

    # First three calls drain the mapping queue. We mark each one as
    # "observed" via observe() so the queue advances.
    picks: List[str] = []
    for _ in range(3):
        name, _data = strat.choose(fake_frame, [], {}, available)
        picks.append(name)
        # Pretend the agent loop ran observe() with a 1-cell diff.
        strat._pending_mapping_action = name
        strat.action_effects[name] = {
            "n_changed": 1,
            "samples": [],
            "levels_delta": 0,
            "state_change": False,
            "curr_state": "PLAYING",
        }
        # Pop the head so choose() advances on the next call.
        if strat._mapping_queue and strat._mapping_queue[0] == name:
            strat._mapping_queue.pop(0)

    assert picks == ["ACTION1", "ACTION2", "ACTION3"]
    info_lines = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.INFO and "phase-A" in rec.getMessage()
    ]
    # One INFO per pick so the full action sequence is visible without
    # --verbose -- this is the gap the user called out in the bug report.
    assert len(info_lines) == 3
    assert "ACTION1" in info_lines[0]
    assert "ACTION3" in info_lines[2]


# ---- Mapping-grok exploit: snap-to-allowed end-to-end ----------------------

def _make_completion(content: str) -> Any:
    msg = mock.Mock()
    msg.content = content
    choice = mock.Mock()
    choice.message = msg
    completion = mock.Mock()
    completion.choices = [choice]
    return completion


class _FakeFrame:
    """Minimal duck-typed FrameData stand-in for _exploit() prompt build."""

    def __init__(self) -> None:
        self.frame: List[List[List[int]]] = [[[0]]]
        self.levels_completed = 0
        self.state = mock.Mock(value="PLAYING")


def test_exploit_snaps_disallowed_action_instead_of_random(
    caplog: Any,
) -> None:
    """Reproduces the user's bug: Grok returns a perfectly valid JSON
    action that isn't in available_actions. Pre-fix, the agent silently
    fell back to RandomStrategy. Post-fix, it snaps to the nearest
    allowed neighbour and logs a WARNING that explains exactly what
    happened."""
    strat = MappingGrokStrategy(api_key="x")
    # Skip Phase A by pre-populating the action map.
    strat._initialized = True
    strat._mapping_queue = []
    strat.action_effects = {
        "ACTION1": {
            "n_changed": 0,
            "samples": [],
            "levels_delta": 0,
            "state_change": False,
            "curr_state": "PLAYING",
        }
    }

    fake_client = mock.Mock()
    fake_client.chat.completions.create.return_value = _make_completion(
        '{"action": "ACTION5"}'
    )
    strat.grok._client = fake_client

    caplog.set_level(logging.WARNING, logger="mcop.adapters.arcagi3_agent")
    name, data = strat._exploit(
        _FakeFrame(), {"resonance": 0.0, "recent": []}, ALLOWED_4
    )
    assert name == "ACTION4"
    assert data == {}
    # Random fallback wasn't called -- confirmed indirectly by the snap
    # warning being emitted.
    snap_warnings = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.WARNING and "snapping" in rec.getMessage()
    ]
    assert len(snap_warnings) == 1
    assert "ACTION5" in snap_warnings[0]
    assert "ACTION4" in snap_warnings[0]


def test_exploit_disallowed_no_snap_falls_back_with_clear_log(
    caplog: Any,
) -> None:
    strat = MappingGrokStrategy(api_key="x")
    strat._initialized = True
    strat._mapping_queue = []
    strat.action_effects = {}

    # A non-numeric disallowed action ("QUIT") has no numeric neighbour,
    # so the agent must fall through to its random fallback -- but the
    # log must say WHY, not just "unparseable".
    fake_client = mock.Mock()
    fake_client.chat.completions.create.return_value = _make_completion(
        '{"action": "QUIT"}'
    )
    strat.grok._client = fake_client

    fallback_calls: List[Tuple[Any, ...]] = []

    class TrackingFallback:
        def choose(
            self,
            frame: Any,
            tensor: Any,
            memory_summary: Dict[str, Any],
            available_action_names: List[str],
        ) -> Tuple[str, Dict[str, Any]]:
            fallback_calls.append(
                (frame, tensor, memory_summary, tuple(available_action_names))
            )
            return ("ACTION1", {})

    strat.fallback = TrackingFallback()

    caplog.set_level(logging.WARNING, logger="mcop.adapters.arcagi3_agent")
    name, _ = strat._exploit(
        _FakeFrame(), {"resonance": 0.0, "recent": []}, ALLOWED_4
    )
    assert name == "ACTION1"
    assert len(fallback_calls) == 1
    disallowed_warnings = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.WARNING and "disallowed" in rec.getMessage()
    ]
    assert len(disallowed_warnings) == 1
    assert "QUIT" in disallowed_warnings[0]


def test_exploit_unparseable_distinguishes_no_braces_from_invalid_json(
    caplog: Any,
) -> None:
    """The pre-fix log lumped 'no JSON' and 'malformed JSON' into the same
    'response unparseable' warning. They must now be distinguishable so
    downstream debugging knows whether the model emitted prose vs. broken
    JSON."""
    strat = MappingGrokStrategy(api_key="x")
    strat._initialized = True
    strat._mapping_queue = []
    strat.action_effects = {}
    strat.fallback = RandomStrategy(seed=1)

    fake_client = mock.Mock()
    strat.grok._client = fake_client

    # Case 1: plain prose, no braces.
    fake_client.chat.completions.create.return_value = _make_completion(
        "I think ACTION3 is best."
    )
    caplog.set_level(logging.WARNING, logger="mcop.adapters.arcagi3_agent")
    strat._exploit(
        _FakeFrame(), {"resonance": 0.0, "recent": []}, ALLOWED_4
    )

    # Case 2: braces but malformed.
    fake_client.chat.completions.create.return_value = _make_completion(
        "{action: ACTION3,}"
    )
    strat._exploit(
        _FakeFrame(), {"resonance": 0.0, "recent": []}, ALLOWED_4
    )

    msgs = [rec.getMessage() for rec in caplog.records if rec.levelno == logging.WARNING]
    assert any("no JSON object" in m for m in msgs), msgs
    assert any("not valid JSON" in m for m in msgs), msgs


def test_exploit_logs_ok_pick_at_info(caplog: Any) -> None:
    """When Grok complies, the success log stays at INFO `mapping-grok pick:`
    -- preserving the existing log shape so downstream parsers (CI artifact
    diffing, dashboards) continue to work."""
    strat = MappingGrokStrategy(api_key="x")
    strat._initialized = True
    strat._mapping_queue = []
    strat.action_effects = {}
    strat.fallback = RandomStrategy(seed=1)

    fake_client = mock.Mock()
    fake_client.chat.completions.create.return_value = _make_completion(
        '{"action": "ACTION2"}'
    )
    strat.grok._client = fake_client

    caplog.set_level(logging.INFO, logger="mcop.adapters.arcagi3_agent")
    name, _ = strat._exploit(
        _FakeFrame(), {"resonance": 0.0, "recent": []}, ALLOWED_4
    )
    assert name == "ACTION2"
    msgs = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.INFO and "mapping-grok pick" in rec.getMessage()
    ]
    assert msgs, "expected an INFO-level mapping-grok pick log on success"


# ---- GrokStrategy parity with snap-to-allowed ------------------------------

def test_grok_strategy_snaps_disallowed_action(caplog: Any) -> None:
    strat = GrokStrategy(api_key="x")
    fake_client = mock.Mock()
    fake_client.chat.completions.create.return_value = _make_completion(
        '{"action": "ACTION5"}'
    )
    strat._client = fake_client

    caplog.set_level(logging.WARNING, logger="mcop.adapters.arcagi3_agent")
    name, _ = strat.choose(
        _FakeFrame(), [], {"resonance": 0.0, "recent": []}, ALLOWED_4
    )
    assert name == "ACTION4"
    snap_warnings = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.WARNING and "snapping" in rec.getMessage()
    ]
    assert len(snap_warnings) == 1


def test_grok_strategy_system_prompt_lists_allowed_actions() -> None:
    """The stricter system prompt must explicitly tell the model that any
    action outside the user message's `Available actions` list will be
    rejected -- otherwise we're back to relying on the model's default
    interpretation of "ACTION1..7"."""
    strat = GrokStrategy(api_key="x")
    fake_client = mock.Mock()
    fake_client.chat.completions.create.return_value = _make_completion(
        '{"action": "ACTION1"}'
    )
    strat._client = fake_client

    strat.choose(
        _FakeFrame(), [], {"resonance": 0.0, "recent": []}, ALLOWED_4
    )

    args, kwargs = fake_client.chat.completions.create.call_args
    system_msg = next(
        m["content"] for m in kwargs["messages"] if m["role"] == "system"
    )
    assert "Available actions" in system_msg
    assert "rejected" in system_msg
