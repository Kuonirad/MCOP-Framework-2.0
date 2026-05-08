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
    DEFAULT_GROK_MODEL,
    LOW_MEMORY_ENCODER_DIMS,
    LOW_MEMORY_MAX_TRACES,
    GameResult,
    GrokStrategy,
    HolographicShadowStrategy,
    MappingGrokStrategy,
    RandomStrategy,
    StepRecord,
    _ForwardModel,
    _GoalColorDetector,
    _StuckDetector,
    _build_prompt,
    _decide_action,
    _format_history,
    _parse_action,
    _snap_to_allowed,
)


ALLOWED_4 = ["ACTION1", "ACTION2", "ACTION3", "ACTION4"]
ALLOWED_FULL = ["ACTION1", "ACTION2", "ACTION3", "ACTION4", "ACTION5", "ACTION6"]


# ---- GameResult serialization ---------------------------------------------

def test_game_result_serializes_step_trace() -> None:
    result = GameResult(
        game_id="ls20",
        final_state="INTERRUPTED",
        levels_completed=0,
        win_levels=0,
        scorecard_id=None,
        steps=[
            StepRecord(
                step=0,
                action="ACTION1",
                state="PLAYING",
                levels_completed=0,
                score=0.0,
            ),
            StepRecord(
                step=1,
                action="ACTION2",
                state="PLAYING",
                levels_completed=0,
                score=0.0,
            ),
        ],
    )

    payload = result.as_dict()

    assert payload["n_steps"] == 2
    assert payload["steps"] == [
        {
            "step": 0,
            "action": "ACTION1",
            "state": "PLAYING",
            "levels_completed": 0,
            "score": 0.0,
        },
        {
            "step": 1,
            "action": "ACTION2",
            "state": "PLAYING",
            "levels_completed": 0,
            "score": 0.0,
        },
    ]


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


def test_mapping_grok_phase_a_does_not_initialize_grok_client() -> None:
    strat = MappingGrokStrategy(api_key="x")
    strat.grok._ensure_client = mock.Mock(
        side_effect=AssertionError("Phase A must not call Grok")
    )

    name, data = strat.choose(_FakeFrame(), [], {}, ALLOWED_4)

    assert name == "ACTION1"
    assert data == {}
    strat.grok._ensure_client.assert_not_called()


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


def test_grok_strategy_system_prompt_constrains_to_available_actions() -> None:
    """The system prompt must point the model at the user message's
    `Available actions` list and give it a concrete action-name example,
    so it doesn't fall back to its default interpretation of "ACTION1..7".

    Phrasing must NOT use commanding tone ("ONLY", "rejected", "No prose"),
    angle-bracket placeholders ("<one of the allowed names>"), or persona
    framing ("You play ARC-AGI-3"). Those wordings tripped Grok-4's
    safety filter on 2026-05-04, producing a refusal response of "I must
    decline this request as it appears to be an attempt to create a
    restricted persona or alter ego" instead of a JSON action choice."""
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
    # Constraint reference + concrete example must be present.
    assert "Available actions" in system_msg
    assert "ACTION3" in system_msg
    # Lock out the wordings that tripped the safety filter.
    assert "ONLY" not in system_msg
    assert "rejected" not in system_msg
    assert "No prose" not in system_msg
    assert "<" not in system_msg


def test_mapping_grok_system_prompt_constrains_to_available_actions() -> None:
    """Same regression guard for MappingGrokStrategy._exploit's prompt.
    Both strategies share the safety-filter risk because they share the
    same xAI endpoint and roughly the same prompt shape."""
    strat = MappingGrokStrategy(api_key="x")
    strat._initialized = True
    strat._mapping_queue = []
    strat.action_effects = {}

    fake_client = mock.Mock()
    fake_client.chat.completions.create.return_value = _make_completion(
        '{"action": "ACTION1"}'
    )
    strat.grok._client = fake_client

    strat._exploit(
        _FakeFrame(), {"resonance": 0.0, "recent": []}, ALLOWED_4
    )

    args, kwargs = fake_client.chat.completions.create.call_args
    system_msg = next(
        m["content"] for m in kwargs["messages"] if m["role"] == "system"
    )
    assert "Available actions" in system_msg
    assert "ACTION3" in system_msg
    assert "ONLY" not in system_msg
    assert "rejected" not in system_msg
    assert "No prose" not in system_msg
    assert "<" not in system_msg


# ---- Configurable Grok model ----------------------------------------------

def test_grok_strategy_default_model_is_grok_4_3(
    monkeypatch: Any,
) -> None:
    """ARC runs should default to the requested Grok 4.3 model unless
    an operator explicitly overrides GROK_MODEL or passes model=."""
    monkeypatch.delenv("GROK_MODEL", raising=False)
    strat = GrokStrategy(api_key="x")
    assert strat.model == DEFAULT_GROK_MODEL == "grok-4.3"


def test_arc_agent_defaults_to_low_memory_profile(monkeypatch: Any) -> None:
    """Python ARC instrumentation mirrors the TS low-memory preset: 32
    encoder dims and a 256-trace stigmergy ring by default."""
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    monkeypatch.delenv("MCOP_ENCODER_DIMS", raising=False)
    monkeypatch.delenv("MCOP_MAX_TRACES", raising=False)
    agent = MCOPArcAgi3Agent(api_key="x")

    assert agent.encoder_dims == LOW_MEMORY_ENCODER_DIMS == 32
    assert agent.stigmergy._capacity == LOW_MEMORY_MAX_TRACES == 256


def test_arc_agent_low_memory_env_overrides(monkeypatch: Any) -> None:
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    monkeypatch.setenv("MCOP_ENCODER_DIMS", "16")
    monkeypatch.setenv("MCOP_MAX_TRACES", "8")
    agent = MCOPArcAgi3Agent(api_key="x")

    assert agent.encoder_dims == 16
    assert agent.stigmergy._capacity == 8


def test_grok_strategy_env_var_overrides_default(monkeypatch: Any) -> None:
    monkeypatch.setenv("GROK_MODEL", "grok-3-mini")
    assert GrokStrategy(api_key="x").model == "grok-3-mini"


def test_grok_strategy_explicit_model_overrides_env_var(
    monkeypatch: Any,
) -> None:
    """Explicit `model=` kwarg wins over the env var so the CLI's
    `--grok-model` flag (which forwards to this kwarg) reliably picks
    the model regardless of what the workflow exported."""
    monkeypatch.setenv("GROK_MODEL", "grok-3-mini")
    strat = GrokStrategy(api_key="x", model="custom-arc-model")
    assert strat.model == "custom-arc-model"


def test_mapping_grok_strategy_forwards_model_kwarg() -> None:
    """`MappingGrokStrategy(model=...)` must thread through to the inner
    `GrokStrategy` so the CLI's `--grok-model` flag works for both
    strategies. Otherwise the flag would silently no-op for
    mapping-grok."""
    strat = MappingGrokStrategy(api_key="x", model="grok-3-mini")
    assert strat.grok.model == "grok-3-mini"


# ---- play() cancellation handling -----------------------------------------

class _FakeGameAction:
    """Minimal stand-in for one member of the `arcengine.GameAction`
    enum -- just enough for `play()` to use as the value of a
    dict-of-name-to-member lookup."""

    def __init__(self, name: str, value: int) -> None:
        self.name = name
        self.value = value

    def __repr__(self) -> str:  # pragma: no cover -- test helper only
        return f"<_FakeGameAction {self.name}>"


class _FakeGameActionMeta(type):
    """Metaclass so the class itself is iterable like a real `Enum`
    (`for m in GameAction:`) and supports `GameAction[name]`."""

    def __iter__(cls):
        return iter(cls._members.values())

    def __getitem__(cls, name: str) -> _FakeGameAction:
        return cls._members[name]


class _FakeGameActionEnum(metaclass=_FakeGameActionMeta):
    _members: Dict[str, _FakeGameAction] = {
        "RESET": _FakeGameAction("RESET", 0),
        "ACTION1": _FakeGameAction("ACTION1", 1),
        "ACTION2": _FakeGameAction("ACTION2", 2),
        "ACTION3": _FakeGameAction("ACTION3", 3),
        "ACTION4": _FakeGameAction("ACTION4", 4),
    }


# Mirror real-Enum attribute access (`GameAction.ACTION1`).
for _name, _member in _FakeGameActionEnum._members.items():
    setattr(_FakeGameActionEnum, _name, _member)


class _FakeState:
    PLAYING = mock.Mock(value="PLAYING", name="PLAYING")
    WIN = mock.Mock(value="WIN", name="WIN")
    GAME_OVER = mock.Mock(value="GAME_OVER", name="GAME_OVER")


class _PlayFakeFrame:
    """A `FrameData`-shaped stand-in suitable for the `play()` loop.
    Carries `available_actions`, `frame`, `state`, and the level
    counters that `play()` reads on each step."""

    def __init__(
        self,
        state: Any = _FakeState.PLAYING,
        levels_completed: int = 0,
    ) -> None:
        self.frame: List[List[List[int]]] = [[[0]]]
        self.available_actions = [1, 2, 3, 4]
        self.state = state
        self.levels_completed = levels_completed
        self.win_levels = 0


class _FakeEnv:
    """Stand-in for `arcade.make()` output, with a knob to raise
    `KeyboardInterrupt` mid-run so we can prove the cancellation path
    flushes a partial result."""

    def __init__(
        self,
        steps_until_interrupt: Optional[int] = None,
        steps_until_win: Optional[int] = None,
    ) -> None:
        self._steps_taken = 0
        self._steps_until_interrupt = steps_until_interrupt
        self._steps_until_win = steps_until_win

    def reset(self) -> _PlayFakeFrame:
        return _PlayFakeFrame()

    def step(self, action: Any, data: Any = None) -> _PlayFakeFrame:
        self._steps_taken += 1
        if (
            self._steps_until_interrupt is not None
            and self._steps_taken >= self._steps_until_interrupt
        ):
            raise KeyboardInterrupt()
        if (
            self._steps_until_win is not None
            and self._steps_taken >= self._steps_until_win
        ):
            return _PlayFakeFrame(
                state=_FakeState.WIN, levels_completed=1
            )
        return _PlayFakeFrame()


class _FakeArcade:
    """Stand-in for `arc_agi.Arcade`. Records `close_scorecard` calls
    so tests can assert the scorecard is closed exactly once even on
    cancellation."""

    def __init__(self, env: Optional[_FakeEnv] = None) -> None:
        self._env = env
        self.api_key: Optional[str] = None
        self.base_url: Optional[str] = None
        self.close_scorecard_calls: List[str] = []

    def open_scorecard(self, tags: List[str]) -> str:
        return "scorecard-test-id"

    def make(self, game_id: str, scorecard_id: str) -> _FakeEnv:
        return self._env if self._env is not None else _FakeEnv()

    def close_scorecard(self, scorecard_id: str) -> None:
        self.close_scorecard_calls.append(scorecard_id)


def _patch_sdk_with(monkeypatch: Any, fake_arcade: _FakeArcade) -> None:
    def _factory(*, arc_api_key: str, arc_base_url: str) -> _FakeArcade:
        # Capture the args play() passed for assertion-friendliness, then
        # return the same fake_arcade so `close_scorecard_calls` can be
        # inspected after `play()` returns.
        fake_arcade.api_key = arc_api_key
        fake_arcade.base_url = arc_base_url
        return fake_arcade

    def _fake_load_sdk() -> Tuple[Any, Any, Any, Any]:
        return _factory, object, _FakeGameActionEnum, _FakeState

    monkeypatch.setattr(
        "mcop.adapters.arcagi3_agent._load_sdk", _fake_load_sdk
    )


def test_play_flushes_partial_result_on_keyboard_interrupt(
    monkeypatch: Any, caplog: Any
) -> None:
    """KeyboardInterrupt mid-loop (Ctrl-C, or SIGTERM bridged from a
    workflow cancel) used to drop every step the agent had taken --
    no scorecard, no `levels_completed`, no log artefact. The fix is
    a try/except/finally in `play()` that turns the cancellation into
    a `final_state="INTERRUPTED"` partial result with the steps it had
    completed so far AND closes the scorecard before returning."""
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    env = _FakeEnv(steps_until_interrupt=3)
    arcade = _FakeArcade(env=env)
    _patch_sdk_with(monkeypatch, arcade)

    agent = MCOPArcAgi3Agent(
        strategy=RandomStrategy(seed=42),
        api_key="x",
        max_actions=80,
    )
    caplog.set_level(logging.WARNING, logger="mcop.adapters.arcagi3_agent")
    result = agent.play("ls20")

    # Partial result: at least the two steps that completed before
    # step 3's env.step() raised.
    assert result.final_state == "INTERRUPTED"
    assert len(result.steps) >= 2
    assert all(s.action.startswith("ACTION") for s in result.steps)
    # Scorecard was closed exactly once.
    assert arcade.close_scorecard_calls == ["scorecard-test-id"]
    # The interrupted-flush log fires so operators can spot cancelled
    # runs without parsing JSON.
    interrupted_logs = [
        rec.getMessage()
        for rec in caplog.records
        if "interrupted" in rec.getMessage()
    ]
    assert interrupted_logs, "expected an `interrupted` log"


def test_play_normal_completion_still_works(monkeypatch: Any) -> None:
    """Regression guard: the new try/except/finally must not change the
    happy path. A run that hits WIN after a couple of steps should still
    produce a real `final_state`, real `levels_completed`, and a single
    `close_scorecard` call."""
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    env = _FakeEnv(steps_until_win=2)
    arcade = _FakeArcade(env=env)
    _patch_sdk_with(monkeypatch, arcade)

    agent = MCOPArcAgi3Agent(
        strategy=RandomStrategy(seed=42),
        api_key="x",
        max_actions=80,
    )
    result = agent.play("ls20")

    assert result.final_state == "WIN"
    assert result.levels_completed == 1


# ---- Per-step INFO log + stuck-detector ------------------------------------

class _ScriptedStrategy:
    """Deterministic strategy that replays a pre-baked action sequence.

    Lets the play()-loop tests pin the exact action sequence the agent
    takes, which is what `_StuckDetector` watches. Cycles through the
    list when it runs out, so the same script can drive longer runs."""

    def __init__(self, actions: List[str]) -> None:
        self._actions = list(actions)
        self._i = 0

    def choose(
        self,
        frame: Any,
        tensor: Any,
        memory_summary: Dict[str, Any],
        available_action_names: List[str],
    ) -> Tuple[str, Dict[str, Any]]:
        name = self._actions[self._i % len(self._actions)]
        self._i += 1
        return (name, {})


def test_play_emits_per_step_info_log_with_levels_and_step_counter(
    monkeypatch: Any, caplog: Any
) -> None:
    """Each step must emit exactly one INFO line of the form
    `play(<game>) step <i>/<MAX>: <ACTION> levels=<k> state=<STATE>`.

    Pre-fix the only per-step signal was `mapping-grok pick: ACTIONn`,
    which had no level counter, no step index, and no max-actions
    reference -- so during a long run you couldn't tell whether the
    agent had advanced any levels or how close it was to its budget
    cap without parsing `result.json` post-hoc.
    """
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    env = _FakeEnv(steps_until_win=4)
    arcade = _FakeArcade(env=env)
    _patch_sdk_with(monkeypatch, arcade)

    agent = MCOPArcAgi3Agent(
        strategy=_ScriptedStrategy(["ACTION1", "ACTION2", "ACTION3", "ACTION4"]),
        api_key="x",
        max_actions=80,
    )
    caplog.set_level(logging.INFO, logger="mcop.adapters.arcagi3_agent")
    agent.play("ls20")

    step_logs = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.INFO and "play(ls20) step" in rec.getMessage()
    ]
    assert len(step_logs) == 4, step_logs
    # First three steps before WIN: PLAYING, levels=0.
    assert "step 1/80: ACTION1 levels=0 state=PLAYING" in step_logs[0]
    assert "step 2/80: ACTION2 levels=0 state=PLAYING" in step_logs[1]
    assert "step 3/80: ACTION3 levels=0 state=PLAYING" in step_logs[2]
    # Fourth step lands on WIN -- env reports levels=1.
    assert "step 4/80: ACTION4 levels=1 state=WIN" in step_logs[3]


# ---- _StuckDetector unit tests ---------------------------------------------

def test_stuck_detector_silent_below_window() -> None:
    """No warning until the detector has at least _WINDOW (=6) samples."""
    det = _StuckDetector()
    for action in ("ACTION3", "ACTION1", "ACTION3", "ACTION1", "ACTION3"):
        assert det.observe(action, levels=0) is None


def test_stuck_detector_period_2_loop_warns_once() -> None:
    """The 31313 / 13131 pattern that motivated this work: once the
    detector sees 6 steps of period-2 cycling at level 0, it warns
    exactly once -- not on every subsequent step."""
    det = _StuckDetector()
    seq = ("ACTION3", "ACTION1") * 3  # 6 steps
    warnings: List[Optional[str]] = [det.observe(a, levels=0) for a in seq]
    # First five returns are None (not enough data for a full window
    # match until step 6), step 6 returns the warning.
    assert warnings[:5] == [None, None, None, None, None]
    assert warnings[5] is not None
    assert "period-2" in warnings[5]
    assert "ACTION3" in warnings[5] and "ACTION1" in warnings[5]
    assert "levels=0" in warnings[5]
    # Continuing the same loop must NOT re-warn.
    assert det.observe("ACTION3", levels=0) is None
    assert det.observe("ACTION1", levels=0) is None


def test_stuck_detector_period_3_loop_warns_once() -> None:
    """ACTION1, ACTION2, ACTION3, ACTION1, ACTION2, ACTION3 -> single warn."""
    det = _StuckDetector()
    seq = ("ACTION1", "ACTION2", "ACTION3") * 2  # 6 steps
    warnings = [det.observe(a, levels=0) for a in seq]
    assert warnings[:5] == [None, None, None, None, None]
    assert warnings[5] is not None
    assert "period-3" in warnings[5]


def test_stuck_detector_silent_when_levels_advance() -> None:
    """Same period-2 action sequence but with levels advancing partway
    through the window -- the agent is making progress, just doing it
    via repeated action toggles. NOT stuck."""
    det = _StuckDetector()
    seq = ("ACTION3", "ACTION1") * 3
    levels = [0, 0, 0, 1, 1, 1]  # level advanced at step 4
    warnings = [det.observe(a, lvl) for a, lvl in zip(seq, levels)]
    assert all(w is None for w in warnings)


def test_stuck_detector_silent_on_flat_repeat() -> None:
    """ACTION2 x 6 is the OLD `--strategy grok` collapse-on-ACTION2
    failure mode. Intentionally NOT flagged by this detector -- the
    per-step INFO log already shows the same action repeating, so
    flagging here would be redundant. Flat repeats need their own
    detector if we want one later."""
    det = _StuckDetector()
    warnings = [det.observe("ACTION2", levels=0) for _ in range(6)]
    assert all(w is None for w in warnings)


def test_stuck_detector_re_warns_after_break_and_re_loop() -> None:
    """If the agent breaks out of one loop, falls into a different
    one, the new pattern warns again -- so a long run with multiple
    distinct stuck-states surfaces all of them, not just the first."""
    det = _StuckDetector()
    # First loop: 3,1,3,1,3,1 -> warn.
    for a in ("ACTION3", "ACTION1") * 3:
        det.observe(a, levels=0)
    # Break out with two distinct actions.
    assert det.observe("ACTION4", levels=0) is None
    assert det.observe("ACTION2", levels=0) is None
    # Now fall into a different period-2 loop: 4,2,4,2,4,2.
    new_warnings = [
        det.observe(a, levels=0) for a in ("ACTION4", "ACTION2") * 3
    ]
    # Within those 6 calls, the window will eventually contain
    # exactly 4,2,4,2,4,2 and warn. (The exact step is implementation
    # detail; assert at least one warning fired with the new cycle.)
    fired = [w for w in new_warnings if w is not None]
    assert len(fired) >= 1
    assert "ACTION4" in fired[0] and "ACTION2" in fired[0]


def test_play_emits_stuck_warning_on_period_2_loop(
    monkeypatch: Any, caplog: Any
) -> None:
    """End-to-end through play(): a scripted ACTION3,ACTION1 loop
    should produce the per-step INFO logs AND a single
    `play(ls20) appears stuck: period-2 ...` WARNING within the first
    handful of steps."""
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    # Env never terminates within 10 steps so the loop runs.
    env = _FakeEnv()  # no interrupt, no win
    arcade = _FakeArcade(env=env)
    _patch_sdk_with(monkeypatch, arcade)

    agent = MCOPArcAgi3Agent(
        strategy=_ScriptedStrategy(["ACTION3", "ACTION1"]),
        api_key="x",
        max_actions=10,
    )
    caplog.set_level(logging.WARNING, logger="mcop.adapters.arcagi3_agent")
    agent.play("ls20")

    stuck_warnings = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.WARNING and "appears stuck" in rec.getMessage()
    ]
    assert len(stuck_warnings) == 1, stuck_warnings
    msg = stuck_warnings[0]
    assert "play(ls20)" in msg
    assert "period-2" in msg
    assert "ACTION3" in msg and "ACTION1" in msg
    assert "levels=0" in msg


def test_play_no_stuck_warning_on_diverse_actions(
    monkeypatch: Any, caplog: Any
) -> None:
    """Regression guard: a non-looping action sequence (rotating
    through all 4 actions) MUST NOT trigger the stuck warning even
    when levels never advance. Without this guard the detector would
    flag any long random run as `stuck`."""
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    env = _FakeEnv()
    arcade = _FakeArcade(env=env)
    _patch_sdk_with(monkeypatch, arcade)

    agent = MCOPArcAgi3Agent(
        strategy=_ScriptedStrategy(
            ["ACTION1", "ACTION2", "ACTION3", "ACTION4"]
        ),
        api_key="x",
        max_actions=12,
    )
    caplog.set_level(logging.WARNING, logger="mcop.adapters.arcagi3_agent")
    agent.play("ls20")

    stuck_warnings = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno == logging.WARNING and "appears stuck" in rec.getMessage()
    ]
    # Period-4 is not detected (we only check period-2 and period-3),
    # so a clean rotation across 4 actions must not fire.
    assert stuck_warnings == []
    assert arcade.close_scorecard_calls == ["scorecard-test-id"]


# ---- _format_history (action-history prompt block) ------------------------


def test_format_history_empty_says_first_pick() -> None:
    """First call has no history; the block must not look like Grok
    has 'forgotten' previous actions, just say none yet."""
    out = _format_history([], [])
    assert "(none yet" in out
    assert "first pick" in out


def test_format_history_pairs_actions_with_levels() -> None:
    """The whole point of the new block: each action shows the level
    counter it produced, so Grok can see at a glance whether picks are
    advancing or stagnating."""
    out = _format_history(
        ["ACTION1", "ACTION3", "ACTION1", "ACTION3"],
        [0, 0, 0, 0],
    )
    assert "ACTION1->lvl0" in out
    assert "ACTION3->lvl0" in out
    # All four actions are listed in order.
    assert out.index("ACTION1->lvl0") < out.index("ACTION3->lvl0")


def test_format_history_includes_oscillation_nudge() -> None:
    """The model needs an explicit instruction or it ignores the
    history. The exact wording matters less than that it tells the
    model what to do when picks are oscillating with no progress."""
    out = _format_history(["ACTION1", "ACTION3"], [0, 0])
    assert "oscillating" in out
    assert "different action" in out


def test_format_history_handles_levels_shorter_than_actions() -> None:
    """Defensive: if play() is mid-step and the levels list lags by one,
    the helper must still produce sensible output for every action --
    the trailing actions just show without a level suffix."""
    out = _format_history(
        ["ACTION1", "ACTION3", "ACTION1"],
        [0, 0],  # one short
    )
    assert "ACTION1->lvl0" in out
    # Trailing action without paired level still appears in the list.
    assert out.count("ACTION1") == 2


def test_format_history_emits_oldest_to_newest_label() -> None:
    """The order is meaningful (you can detect a loop in 1,3,1,3 but
    not in {1, 3}), so the label must say which end is latest."""
    out = _format_history(["ACTION1", "ACTION3"], [0, 0])
    assert "oldest to newest" in out


# ---- Prompt integration: history block visible in user message ------------


def test_build_prompt_includes_history_block() -> None:
    """`GrokStrategy._build_prompt` must surface the new block so the
    standalone --strategy grok run also benefits from history-aware
    picks."""
    prompt = _build_prompt(
        _FakeFrame(),
        {
            "resonance": 0.0,
            "recent": ["ACTION1", "ACTION3", "ACTION1"],
            "recent_levels": [0, 0, 0],
        },
        ALLOWED_4,
    )
    assert "Your last 3 actions" in prompt
    assert "ACTION1->lvl0" in prompt
    assert "ACTION3->lvl0" in prompt
    # The old `Memory: ... recent=[...]` shape MUST NOT come back, or
    # we'd be sending the history twice and confusing the model.
    assert "recent_actions=" not in prompt
    assert "recent=[" not in prompt


def test_mapping_grok_exploit_user_msg_includes_history_block() -> None:
    """`MappingGrokStrategy._exploit` must inject the same block. This
    is the one that mattered for the ls20 run since mapping-grok was
    the strategy stuck in the [ACTION1, ACTION3] loop."""
    strat = MappingGrokStrategy(api_key="x")
    strat._initialized = True
    strat._mapping_queue = []
    strat.action_effects = {}

    fake_client = mock.Mock()
    fake_client.chat.completions.create.return_value = _make_completion(
        '{"action": "ACTION2"}'
    )
    strat.grok._client = fake_client

    strat._exploit(
        _FakeFrame(),
        {
            "resonance": 0.0,
            "recent": ["ACTION1", "ACTION3", "ACTION1", "ACTION3"],
            "recent_levels": [0, 0, 0, 0],
        },
        ALLOWED_4,
    )

    args, kwargs = fake_client.chat.completions.create.call_args
    user_msg = next(
        m["content"] for m in kwargs["messages"] if m["role"] == "user"
    )
    assert "Your last 4 actions" in user_msg
    assert "ACTION1->lvl0" in user_msg
    assert "ACTION3->lvl0" in user_msg
    assert "oscillating" in user_msg
    # Old buried-in-Memory shape is gone.
    assert "recent=[" not in user_msg


def test_build_prompt_no_history_says_first_pick() -> None:
    """First step of a run: history is empty. The block must still be
    present (so Grok learns to look there) but say so honestly."""
    prompt = _build_prompt(
        _FakeFrame(),
        {"resonance": 0.0, "recent": [], "recent_levels": []},
        ALLOWED_4,
    )
    assert "Your recent actions" in prompt
    assert "(none yet" in prompt


# ---- play() wires history through to the strategy --------------------------


def test_play_passes_recent_levels_alongside_actions(
    monkeypatch: Any,
) -> None:
    """End-to-end: play() must populate `memory_summary['recent_levels']`
    paired index-wise with `recent`, so the strategy's prompt-builder
    can render the action->level pairs the helper expects.

    Without this wiring the history block would still render but every
    action would lose its level suffix, defeating the point of giving
    Grok visibility into 'levels stayed at 0 for the last 8 picks'."""
    from mcop.adapters.arcagi3_agent import MCOPArcAgi3Agent

    captured: List[Dict[str, Any]] = []

    class _CapturingStrategy:
        def choose(
            self,
            frame: Any,
            tensor: Any,
            memory_summary: Dict[str, Any],
            available_action_names: List[str],
        ) -> Tuple[str, Dict[str, Any]]:
            captured.append(
                {
                    "recent": list(memory_summary.get("recent", [])),
                    "recent_levels": list(
                        memory_summary.get("recent_levels", [])
                    ),
                }
            )
            return ("ACTION1", {})

    env = _FakeEnv()  # never wins, never interrupts
    arcade = _FakeArcade(env=env)
    _patch_sdk_with(monkeypatch, arcade)

    agent = MCOPArcAgi3Agent(
        strategy=_CapturingStrategy(),
        api_key="x",
        max_actions=4,
    )
    agent.play("ls20")

    # Step 0: empty history.
    assert captured[0]["recent"] == []
    assert captured[0]["recent_levels"] == []
    # Step 1: one prior action paired with one prior level.
    assert captured[1]["recent"] == ["ACTION1"]
    assert captured[1]["recent_levels"] == [0]
    # Step 3: three priors, lengths must match for the prompt block to
    # render `ACTION1->lvl0, ACTION1->lvl0, ACTION1->lvl0`.
    assert len(captured[3]["recent"]) == 3
    assert len(captured[3]["recent_levels"]) == 3
    assert captured[3]["recent_levels"] == [0, 0, 0]


# ---- HolographicShadowStrategy --------------------------------------------

def _grid_with_goal(goal_positions: List[Tuple[int, int]]) -> List[List[List[int]]]:
    """Build a single 8x8 layer with goal cells (color 8) at the given (row, col)."""
    layer = [[0 for _ in range(8)] for _ in range(8)]
    for r, c in goal_positions:
        layer[r][c] = 8
    return [layer]


class _HoloFrame:
    def __init__(self, grid: List[List[List[int]]], levels_completed: int = 0) -> None:
        self.frame = grid
        self.levels_completed = levels_completed
        self.state = mock.Mock(value="PLAYING")


def test_holographic_strategy_goal_centroid_ignores_non_goal_colors() -> None:
    grid = _grid_with_goal([(2, 4), (4, 2)])
    grid[0][0][0] = 5  # color 5 should be ignored
    grid[0][7][7] = 3  # so should other colors
    strat = HolographicShadowStrategy()
    centroid = strat._goal_centroid(_HoloFrame(grid))
    assert centroid == (3.0, 3.0)


def test_holographic_strategy_state_hash_only_depends_on_goal_layer() -> None:
    """Non-goal cell churn must not invalidate the wall/visit cache."""
    grid_a = _grid_with_goal([(1, 1)])
    grid_b = _grid_with_goal([(1, 1)])
    grid_b[0][5][5] = 5  # different non-goal cell — hash should still match
    strat = HolographicShadowStrategy()
    assert strat._state_hash(_HoloFrame(grid_a)) == strat._state_hash(_HoloFrame(grid_b))


def test_holographic_strategy_classifies_blocked_wobble_below_threshold() -> None:
    """Goal centroid stationary => blocked_wobble + wall registered."""
    strat = HolographicShadowStrategy()
    prev = _HoloFrame(_grid_with_goal([(0, 0)]))
    # Set last_goal_centroid the way choose() would.
    strat._last_state_hash = strat._state_hash(prev)
    strat._last_goal_centroid = strat._goal_centroid(prev)
    # Non-goal cell flips while the goal stays at (0,0). Centroid delta
    # is 0.0 (< wobble threshold of 0.5) => blocked_wobble.
    wobble_grid = _grid_with_goal([(0, 0)])
    wobble_grid[0][7][7] = 5
    next_wobble = _HoloFrame(wobble_grid)
    strat.observe(prev, "ACTION1", next_wobble)
    # Both a blocked_wobble outcome record and a debug_wall_learning
    # follow-up are appended; assert against types rather than the
    # trailing index so future debug etches don't break the test.
    types = [rec["type"] for rec in strat.provenance]
    assert "blocked_wobble" in types
    assert "debug_wall_learning" in types
    assert strat.walls[(strat._last_state_hash, "ACTION1")] == 1


def test_holographic_strategy_ambiguous_drift_does_not_register_wall() -> None:
    """0.5..1.5 cell centroid drift is ambiguous: no move, no wall."""
    strat = HolographicShadowStrategy()
    prev = _HoloFrame(_grid_with_goal([(0, 0)]))
    strat._last_state_hash = strat._state_hash(prev)
    strat._last_goal_centroid = strat._goal_centroid(prev)
    # Hand-set centroids straddling the dead zone (delta = 1.0).
    strat._last_goal_centroid = (10.0, 10.0)
    nxt = _HoloFrame(_grid_with_goal([(1, 0)]))  # any next frame is fine
    # Patch _goal_centroid to return a deterministic in-zone centroid.
    original = strat._goal_centroid
    strat._goal_centroid = lambda frame: (11.0, 10.0)  # type: ignore
    try:
        strat.observe(prev, "ACTION4", nxt)
    finally:
        strat._goal_centroid = original  # type: ignore
    record = next(
        r for r in strat.provenance
        if r.get("action") == "ACTION4" and r.get("type") != "debug_wall_learning"
    )
    assert record["type"] == "ambiguous_drift"
    assert (strat._last_state_hash, "ACTION4") not in strat.walls
    assert strat.action_stats["ACTION4"]["moved_count"] == 0
    # No debug_wall_learning should be emitted for ambiguous drifts.
    assert all(
        r["type"] != "debug_wall_learning"
        for r in strat.provenance
    )


def test_holographic_strategy_emits_debug_loop_detected_on_oscillation() -> None:
    """First-time oscillation triggers a debug_loop_detected provenance entry."""
    strat = HolographicShadowStrategy()
    strat._centroid_history = [
        (1.0, 1.0), (1.0, 2.0),
        (1.0, 1.0), (1.0, 2.0),
        (1.0, 1.0), (1.0, 2.0),
    ]
    strat.choose(_HoloFrame(_grid_with_goal([(1, 1)])), [], {}, ["ACTION1", "ACTION2"])
    debug_entries = [
        r for r in strat.provenance if r["type"] == "debug_loop_detected"
    ]
    assert len(debug_entries) == 1
    entry = debug_entries[0]
    assert entry["novelty_pick"] in {"ACTION1", "ACTION2"}
    assert len(entry["centroid_window"]) == strat.HISTORY_WINDOW
    # Re-running with an identical signature must not spam the trace.
    strat.choose(_HoloFrame(_grid_with_goal([(1, 1)])), [], {}, ["ACTION1", "ACTION2"])
    debug_entries = [
        r for r in strat.provenance if r["type"] == "debug_loop_detected"
    ]
    assert len(debug_entries) == 1


def test_holographic_strategy_oscillation_breaks_via_least_tried_action() -> None:
    """Both alternating actions register as real_move; novelty must still flip."""
    strat = HolographicShadowStrategy()
    state_hash = "abcd"
    strat._last_state_hash = state_hash
    # Both actions have moved every time, so wall_hits == 0 for both
    # and only the per-state try counter discriminates them.
    strat.action_stats["ACTION1"] = {
        "count": 10.0, "moved_count": 10.0, "total_centroid_delta": 10.0,
    }
    strat.action_stats["ACTION2"] = {
        "count": 4.0, "moved_count": 4.0, "total_centroid_delta": 4.0,
    }
    strat.state_action_tries[(state_hash, "ACTION1")] = 8
    strat.state_action_tries[(state_hash, "ACTION2")] = 2
    strat._centroid_history = [
        (1.0, 1.0), (1.0, 2.0),
        (1.0, 1.0), (1.0, 2.0),
        (1.0, 1.0), (1.0, 2.0),
    ]
    # Force choose() to use our seeded state_hash.
    frame = _HoloFrame(_grid_with_goal([(1, 1)]))
    original = strat._state_hash
    strat._state_hash = lambda f: state_hash  # type: ignore
    try:
        chosen, _ = strat.choose(frame, [], {}, ["ACTION1", "ACTION2"])
    finally:
        strat._state_hash = original  # type: ignore
    assert chosen == "ACTION2"


def test_holographic_strategy_wobble_threshold_validation() -> None:
    """Reject configurations where wobble_threshold > move_threshold."""
    import pytest
    with pytest.raises(ValueError):
        HolographicShadowStrategy(
            move_threshold_centroid=1.0,
            wobble_threshold_centroid=2.0,
        )


def test_holographic_strategy_classifies_real_move_at_threshold() -> None:
    strat = HolographicShadowStrategy()
    # Goal moves from (0,0) to (3,3): two cells change (old becomes 0, new
    # becomes 8) => n_changed == 2 == MOVE_THRESHOLD_CELLS => real_move.
    prev = _HoloFrame(_grid_with_goal([(0, 0)]))
    strat._last_state_hash = strat._state_hash(prev)
    strat._last_goal_centroid = strat._goal_centroid(prev)
    nxt = _HoloFrame(_grid_with_goal([(3, 3)]))
    strat.observe(prev, "ACTION2", nxt)
    record = strat.provenance[-1]
    assert record["type"] == "real_move"
    assert record["goal_centroid_delta"] > 0
    assert (strat._last_state_hash, "ACTION2") not in strat.walls


def test_holographic_strategy_wall_learning_avoids_repeated_blocked_action() -> None:
    """After three blocked observations of ACTION1, choose() should prefer ACTION2."""
    strat = HolographicShadowStrategy()
    prev = _HoloFrame(_grid_with_goal([(0, 0)]))
    # Learn that ACTION1 is a wall in this state.
    for _ in range(3):
        strat._last_state_hash = strat._state_hash(prev)
        strat._last_goal_centroid = strat._goal_centroid(prev)
        # No change -> blocked_wobble
        strat.observe(prev, "ACTION1", _HoloFrame(_grid_with_goal([(0, 0)])))
    # Now ask for an action — ACTION1 should NOT win.
    chosen, _ = strat.choose(prev, [], {}, ["ACTION1", "ACTION2"])
    assert chosen == "ACTION2"


def test_holographic_strategy_oscillation_triggers_novelty_pick() -> None:
    """ABAB centroid pattern + heavily-tried ACTION1 should flip choice to ACTION2."""
    strat = HolographicShadowStrategy()
    # Seed action_stats so ACTION1 looks 'great' under normal scoring
    # (high move rate) and ACTION2 is rarely tried — without oscillation
    # the chooser would pick ACTION1; with oscillation novelty-bias flips it.
    strat.action_stats["ACTION1"] = {
        "count": 20.0,
        "moved_count": 20.0,
        "total_centroid_delta": 20.0,
    }
    strat.action_stats["ACTION2"] = {
        "count": 0.0,
        "moved_count": 0.0,
        "total_centroid_delta": 0.0,
    }
    # Inject an alternating centroid history (a, b, a, b, a, b).
    strat._centroid_history = [
        (1.0, 1.0), (1.0, 2.0),
        (1.0, 1.0), (1.0, 2.0),
        (1.0, 1.0), (1.0, 2.0),
    ]
    assert strat._detect_oscillation() is True
    chosen, _ = strat.choose(
        _HoloFrame(_grid_with_goal([(1, 1)])), [], {}, ["ACTION1", "ACTION2"]
    )
    assert chosen == "ACTION2"


def test_holographic_strategy_provenance_records_levels_delta() -> None:
    strat = HolographicShadowStrategy()
    prev = _HoloFrame(_grid_with_goal([(0, 0)]), levels_completed=0)
    strat._last_state_hash = strat._state_hash(prev)
    strat._last_goal_centroid = strat._goal_centroid(prev)
    nxt = _HoloFrame(_grid_with_goal([(3, 3)]), levels_completed=1)
    strat.observe(prev, "ACTION3", nxt)
    record = strat.provenance[-1]
    assert record["levels_delta"] == 1
    assert record["action"] == "ACTION3"


def test_holographic_strategy_returns_action1_when_no_actions_available() -> None:
    strat = HolographicShadowStrategy()
    chosen, data = strat.choose(_HoloFrame(_grid_with_goal([])), [], {}, [])
    assert chosen == "ACTION1"
    assert data == {}


def test_holographic_strategy_complex_action_gets_default_coordinates() -> None:
    strat = HolographicShadowStrategy(complex_action_default=(10, 20))
    # With only ACTION6 available it must win regardless of score.
    chosen, data = strat.choose(_HoloFrame(_grid_with_goal([])), [], {}, ["ACTION6"])
    assert chosen == "ACTION6"
    assert data == {"x": 10, "y": 20}


# ---- _GoalColorDetector ----------------------------------------------------

def _grid_with_color(color_positions: List[Tuple[int, int, int]]) -> List[List[List[int]]]:
    """Build an 8x8 layer with arbitrary (row, col, color) cells."""
    layer = [[0 for _ in range(8)] for _ in range(8)]
    for r, c, val in color_positions:
        layer[r][c] = val
    return [layer]


def test_goal_color_detector_returns_none_before_any_advance() -> None:
    det = _GoalColorDetector()
    prev = _HoloFrame(_grid_with_color([(0, 0, 7)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_color([(1, 1, 7)]), levels_completed=0)
    det.observe(prev, nxt)
    assert det.current() is None


def test_goal_color_detector_credits_color_present_in_advance_diff() -> None:
    """A level advance that touches color 7 should make 7 the inferred goal."""
    det = _GoalColorDetector()
    prev = _HoloFrame(_grid_with_color([(0, 0, 7)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_color([]), levels_completed=1)  # 7 vacated to 0
    det.observe(prev, nxt)
    assert det.current() == 7


def test_goal_color_detector_excludes_background_color_zero() -> None:
    """Even though every advance touches 0 (vacated cells), 0 must not win."""
    det = _GoalColorDetector()
    prev = _HoloFrame(_grid_with_color([(0, 0, 4), (1, 1, 4)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_color([]), levels_completed=1)
    det.observe(prev, nxt)
    assert det.current() == 4


def test_goal_color_detector_picks_highest_credit_when_multiple_colors() -> None:
    det = _GoalColorDetector()
    # Color 5 appears in 4 changed cells, color 9 in 2.
    prev = _HoloFrame(
        _grid_with_color(
            [(0, 0, 5), (0, 1, 5), (1, 0, 5), (1, 1, 5), (2, 2, 9), (2, 3, 9)]
        ),
        levels_completed=0,
    )
    nxt = _HoloFrame(_grid_with_color([]), levels_completed=1)
    det.observe(prev, nxt)
    assert det.current() == 5


def test_goal_color_detector_ignores_non_advance_steps() -> None:
    det = _GoalColorDetector()
    prev = _HoloFrame(_grid_with_color([(0, 0, 6)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_color([(1, 1, 6)]), levels_completed=0)
    det.observe(prev, nxt)
    assert det.advances_seen == 0
    assert det.current() is None


def test_goal_color_detector_min_advances_gates_output() -> None:
    det = _GoalColorDetector(min_advances=2)
    prev = _HoloFrame(_grid_with_color([(0, 0, 7)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_color([]), levels_completed=1)
    det.observe(prev, nxt)
    assert det.current() is None  # only 1 advance seen
    # Second advance: now we cross the threshold.
    prev2 = _HoloFrame(_grid_with_color([(2, 2, 7)]), levels_completed=1)
    nxt2 = _HoloFrame(_grid_with_color([]), levels_completed=2)
    det.observe(prev2, nxt2)
    assert det.current() == 7


# ---- _ForwardModel ---------------------------------------------------------

def test_forward_model_returns_none_when_no_terminals_seen() -> None:
    fm = _ForwardModel()
    fm.add_transition("s0", "ACTION1", "s1", levels_delta=0)
    assert fm.plan("s0", ["ACTION1", "ACTION2"]) is None


def test_forward_model_direct_hit_returns_that_action() -> None:
    fm = _ForwardModel()
    fm.add_transition("s0", "ACTION2", "GOAL", levels_delta=1)
    assert fm.plan("s0", ["ACTION1", "ACTION2"]) == "ACTION2"


def test_forward_model_returns_first_action_of_shortest_path() -> None:
    """Two-step path: s0 -ACTION1-> s1 -ACTION3-> GOAL must yield ACTION1."""
    fm = _ForwardModel()
    fm.add_transition("s0", "ACTION1", "s1", levels_delta=0)
    fm.add_transition("s1", "ACTION3", "GOAL", levels_delta=1)
    assert fm.plan("s0", ["ACTION1", "ACTION2", "ACTION3"]) == "ACTION1"


def test_forward_model_prefers_direct_over_indirect() -> None:
    """Direct (s0,ACTION3)->GOAL beats indirect (s0,ACTION1)->s1->GOAL."""
    fm = _ForwardModel()
    fm.add_transition("s0", "ACTION1", "s1", levels_delta=0)
    fm.add_transition("s1", "ACTION2", "GOAL", levels_delta=1)
    fm.add_transition("s0", "ACTION3", "GOAL", levels_delta=1)
    assert fm.plan("s0", ["ACTION1", "ACTION2", "ACTION3"]) == "ACTION3"


def test_forward_model_respects_max_plan_depth() -> None:
    """A path longer than max_plan_depth must not be returned."""
    fm = _ForwardModel(max_plan_depth=2)
    # Depth-3 chain: s0 -> s1 -> s2 -> GOAL
    fm.add_transition("s0", "ACTION1", "s1", levels_delta=0)
    fm.add_transition("s1", "ACTION1", "s2", levels_delta=0)
    fm.add_transition("s2", "ACTION1", "GOAL", levels_delta=1)
    assert fm.plan("s0", ["ACTION1"]) is None


def test_forward_model_reset_clears_graph_and_terminals() -> None:
    fm = _ForwardModel()
    fm.add_transition("s0", "ACTION1", "GOAL", levels_delta=1)
    assert fm.plan("s0", ["ACTION1"]) == "ACTION1"
    fm.reset()
    assert fm.plan("s0", ["ACTION1"]) is None
    assert fm.transitions == {}
    assert fm.terminal_states == set()


def test_forward_model_returns_none_when_no_actions_available() -> None:
    fm = _ForwardModel()
    fm.add_transition("s0", "ACTION1", "GOAL", levels_delta=1)
    assert fm.plan("s0", []) is None


# ---- HolographicShadowStrategy integration --------------------------------

def test_holographic_strategy_uses_planner_over_score() -> None:
    """Planner pick must override score-based pick when a path exists."""
    strat = HolographicShadowStrategy(goal_color=8)
    # Make ACTION1 look great on score so we know the planner overrode it.
    strat.action_stats["ACTION1"] = {
        "count": 10.0, "moved_count": 10.0, "total_centroid_delta": 10.0,
    }
    # Seed forward model: from start_hash, ACTION2 leads to a known terminal.
    start_frame = _HoloFrame(_grid_with_goal([(0, 0)]))
    start_hash = strat._state_hash(start_frame)
    strat._forward_model.add_transition(
        start_hash, "ACTION2", "TERMINAL_HASH", levels_delta=1,
    )
    chosen, _ = strat.choose(start_frame, [], {}, ["ACTION1", "ACTION2"])
    assert chosen == "ACTION2"


def test_holographic_strategy_falls_back_to_score_when_planner_empty() -> None:
    """No terminals known -> planner returns None -> score-based pick."""
    strat = HolographicShadowStrategy()
    strat.action_stats["ACTION2"] = {
        "count": 5.0, "moved_count": 5.0, "total_centroid_delta": 5.0,
    }
    chosen, _ = strat.choose(
        _HoloFrame(_grid_with_goal([(1, 1)])), [], {}, ["ACTION1", "ACTION2"]
    )
    assert chosen == "ACTION2"


def test_holographic_strategy_disable_planner_via_max_plan_depth_zero() -> None:
    strat = HolographicShadowStrategy(max_plan_depth=0)
    start_frame = _HoloFrame(_grid_with_goal([(0, 0)]))
    start_hash = strat._state_hash(start_frame)
    # Even with a baited terminal, max_plan_depth=0 must skip the planner.
    strat._forward_model.add_transition(
        start_hash, "ACTION2", "TERMINAL", levels_delta=1,
    )
    strat.action_stats["ACTION1"] = {
        "count": 10.0, "moved_count": 10.0, "total_centroid_delta": 10.0,
    }
    chosen, _ = strat.choose(start_frame, [], {}, ["ACTION1", "ACTION2"])
    assert chosen == "ACTION1"


def test_holographic_strategy_records_transitions_into_forward_model() -> None:
    strat = HolographicShadowStrategy(goal_color=8)
    prev = _HoloFrame(_grid_with_goal([(0, 0)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_goal([(3, 3)]), levels_completed=1)
    strat._last_state_hash = strat._state_hash(prev)
    strat._last_goal_centroid = strat._goal_centroid(prev)
    strat.observe(prev, "ACTION1", nxt)
    next_hash = strat._state_hash(nxt)
    assert (strat._last_state_hash, "ACTION1") in strat._forward_model.transitions
    assert next_hash in strat._forward_model.terminal_states


def test_holographic_strategy_auto_discovery_flips_goal_color_and_resets_caches() -> None:
    """A level advance involving color 7 should retarget goal_color and clear walls."""
    strat = HolographicShadowStrategy(goal_color=8)  # initial guess: 8
    # Pre-populate a wall under the OLD goal_color to verify it gets cleared.
    strat.walls[("stale_hash", "ACTION9")] = 5
    prev = _HoloFrame(_grid_with_color([(0, 0, 7)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_color([]), levels_completed=1)
    strat._last_state_hash = strat._state_hash(prev)
    strat._last_goal_centroid = strat._goal_centroid(prev)
    strat.observe(prev, "ACTION1", nxt)
    assert strat.goal_color == 7
    assert strat.walls.get(("stale_hash", "ACTION9")) is None  # reset


def test_holographic_strategy_auto_discovery_can_be_disabled() -> None:
    strat = HolographicShadowStrategy(
        goal_color=8, auto_discover_goal_color=False
    )
    prev = _HoloFrame(_grid_with_color([(0, 0, 7)]), levels_completed=0)
    nxt = _HoloFrame(_grid_with_color([]), levels_completed=1)
    strat._last_state_hash = strat._state_hash(prev)
    strat._last_goal_centroid = strat._goal_centroid(prev)
    strat.observe(prev, "ACTION1", nxt)
    assert strat.goal_color == 8  # unchanged
    # Detector still runs (so discovery can be enabled later) but is not applied.
    assert strat._goal_detector.current() == 7


# ---- run_arcagi3_agent CLI dispatch ---------------------------------------


def test_run_arcagi3_agent_dispatches_holographic_strategy(
    monkeypatch: Any,
) -> None:
    """``--strategy holographic`` constructs a HolographicShadowStrategy.

    Regression guard for the workflow_dispatch dropdown in
    ``.github/workflows/arcagi3-run.yml`` -- the workflow exposes
    ``holographic`` as a choice, and the CLI must accept it and wire it
    to the right Strategy class.
    """
    import sys
    # ``mcop_package`` is a directory, not an importable package (the
    # installable distribution is ``mcop``). pytest runs from inside
    # ``mcop_package/``, so ``run_arcagi3_agent`` is importable directly.
    import run_arcagi3_agent  # type: ignore[import-not-found]

    captured: Dict[str, Any] = {}

    class _FakeAgent:
        def __init__(self, **kwargs: Any) -> None:
            captured["init_kwargs"] = kwargs
            captured["strategy_type"] = type(kwargs["strategy"]).__name__

        def list_games(self) -> List[str]:  # pragma: no cover -- not exercised
            return []

        def play(self, game_id: str) -> GameResult:  # pragma: no cover
            captured["played"] = game_id
            return GameResult(game_id=game_id, final_state="WIN")

    monkeypatch.setenv("ARC_API_KEY", "test-key")
    monkeypatch.setattr(run_arcagi3_agent, "MCOPArcAgi3Agent", _FakeAgent)
    # No game_id => list_games path; strategy still has to be constructed.
    monkeypatch.setattr(
        sys, "argv", ["run_arcagi3_agent", "--strategy", "holographic"]
    )

    rc = run_arcagi3_agent.main()
    assert rc == 0
    assert captured["strategy_type"] == "HolographicShadowStrategy"


def test_run_arcagi3_agent_rejects_unknown_strategy(
    monkeypatch: Any,
    capsys: Any,
) -> None:
    """argparse must reject unknown strategies (no silent fallback)."""
    import sys
    import run_arcagi3_agent  # type: ignore[import-not-found]

    monkeypatch.setenv("ARC_API_KEY", "test-key")
    monkeypatch.setattr(
        sys, "argv", ["run_arcagi3_agent", "--strategy", "doesnotexist"]
    )
    try:
        run_arcagi3_agent.main()
    except SystemExit as exc:
        assert exc.code == 2
    else:  # pragma: no cover -- argparse must exit
        raise AssertionError("argparse accepted unknown strategy")
    err = capsys.readouterr().err
    assert "invalid choice" in err
