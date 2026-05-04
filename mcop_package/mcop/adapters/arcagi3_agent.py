"""
ARC-AGI-3 agent wired through MCOP triad primitives.

Path of least resistance: instead of duplicating the ``arc-agi`` SDK's
HTTP client we wrap :class:`arc_agi.Arcade` and feed each frame through
the MCOP triad — :func:`mcop.triad.nova_neo_encode` for tensorisation,
:class:`mcop.adapters.base_adapter.StigmergyStore` for cross-frame
memory, and :class:`EtchLedger` for confidence accounting.

Three strategies ship in-box:

``RandomStrategy``
    Picks uniformly from ``available_actions``. Useful as a smoke test
    and as the lower bound LLM strategies must beat.

``GrokStrategy``
    Calls xAI's OpenAI-compatible Grok endpoint with the encoded frame
    plus a short stigmergic memory summary, then parses an action name
    out of the response. Falls back to ``RandomStrategy`` when the
    response cannot be parsed so the agent keeps making progress.

``MappingGrokStrategy``
    Two-phase. **Phase A** (mapping) cycles through every available
    action once, observing the resulting frame diff so each action's
    in-game semantics ("ACTION1 moves cursor up", "ACTION6 places at
    click") become explicit. **Phase B** (exploit) hands Grok the
    learned mapping plus the diff produced by the previous action, so
    the LLM picks moves with grounded semantics instead of re-deriving
    them every turn. Strategies optionally implement ``observe`` and
    the agent loop calls it after each step.

The SDK requires Python >= 3.12; this module guards the import so the
rest of ``mcop_package`` stays importable on 3.11.
"""

from __future__ import annotations

import json
import logging
import os
import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Sequence, Tuple

from mcop.adapters.base_adapter import EtchLedger, StigmergyStore
from mcop.triad import nova_neo_encode

logger = logging.getLogger(__name__)

# Action names that require an (x, y) coordinate payload. ARC-AGI-3
# convention: ACTION6 is the click/place action; everything else is a
# directional / button press.
COMPLEX_ACTIONS = frozenset({"ACTION6"})


class SDKUnavailable(RuntimeError):
    """Raised when the ``arc-agi`` SDK cannot be imported."""


def _load_sdk() -> Tuple[Any, Any, Any, Any]:
    try:
        from arc_agi import Arcade
        from arcengine import FrameData, GameAction, GameState
    except ImportError as exc:
        raise SDKUnavailable(
            "arc-agi>=0.9.1 is required (Python >=3.12). "
            "Install with `pip install arc-agi` in a 3.12+ interpreter."
        ) from exc
    return Arcade, FrameData, GameAction, GameState


@dataclass
class StepRecord:
    step: int
    action: str
    state: str
    levels_completed: int
    score: float


@dataclass
class GameResult:
    game_id: str
    steps: List[StepRecord] = field(default_factory=list)
    final_state: str = "NOT_PLAYED"
    levels_completed: int = 0
    win_levels: int = 0
    scorecard_id: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "game_id": self.game_id,
            "final_state": self.final_state,
            "levels_completed": self.levels_completed,
            "win_levels": self.win_levels,
            "scorecard_id": self.scorecard_id,
            "n_steps": len(self.steps),
        }


class Strategy(Protocol):
    """Choose the next action given the encoded frame and memory."""

    def choose(
        self,
        frame: Any,
        tensor: Sequence[float],
        memory_summary: Dict[str, Any],
        available_action_names: List[str],
    ) -> Tuple[str, Dict[str, Any]]:
        """Return (action_name, action_data)."""


class RandomStrategy:
    """Uniform-random baseline. Always valid, beats nothing."""

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)

    def choose(
        self,
        frame: Any,
        tensor: Sequence[float],
        memory_summary: Dict[str, Any],
        available_action_names: List[str],
    ) -> Tuple[str, Dict[str, Any]]:
        if not available_action_names:
            return ("ACTION1", {})
        name = self._rng.choice(available_action_names)
        data: Dict[str, Any] = {}
        if name in COMPLEX_ACTIONS:
            data = {
                "x": self._rng.randint(0, 63),
                "y": self._rng.randint(0, 63),
            }
        return (name, data)


class GrokStrategy:
    """LLM-driven action selection via xAI Grok (OpenAI-compatible)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        fallback: Optional[Strategy] = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("GROK_API_KEY", "")
        self.base_url = (
            base_url
            or os.environ.get("GROK_BASE_URL")
            or "https://api.x.ai/v1"
        )
        self.model = model or os.environ.get("GROK_MODEL", "grok-4-latest")
        self.fallback = fallback or RandomStrategy()
        self._client: Any = None

    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.api_key:
            return None
        try:
            from openai import OpenAI
        except ImportError:
            logger.warning(
                "openai SDK missing; install with `pip install openai`. "
                "Falling back to %s.",
                type(self.fallback).__name__,
            )
            return None
        self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        return self._client

    def choose(
        self,
        frame: Any,
        tensor: Sequence[float],
        memory_summary: Dict[str, Any],
        available_action_names: List[str],
    ) -> Tuple[str, Dict[str, Any]]:
        client = self._ensure_client()
        if client is None or not available_action_names:
            return self.fallback.choose(
                frame, tensor, memory_summary, available_action_names
            )

        prompt = _build_prompt(frame, memory_summary, available_action_names)
        try:
            completion = client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You play ARC-AGI-3. Respond with ONLY a JSON "
                            'object: {"action": "ACTION1..7", "x": int, "y": int}. '
                            "Omit x/y unless action is ACTION6."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                max_tokens=64,
            )
            text = completion.choices[0].message.content or ""
            return _parse_action(text, available_action_names) or self.fallback.choose(
                frame, tensor, memory_summary, available_action_names
            )
        except Exception as exc:  # pragma: no cover -- network path
            logger.warning("Grok call failed: %s; using fallback", exc)
            return self.fallback.choose(
                frame, tensor, memory_summary, available_action_names
            )


def _build_prompt(
    frame: Any,
    memory_summary: Dict[str, Any],
    available_action_names: List[str],
) -> str:
    grid = _grid_as_list(frame)
    levels = getattr(frame, "levels_completed", 0)
    state = getattr(getattr(frame, "state", None), "value", str(frame))
    return (
        f"State: {state}\n"
        f"Levels completed: {levels}\n"
        f"Available actions: {available_action_names}\n"
        f"Memory: resonance_score={memory_summary.get('resonance', 0):.3f}, "
        f"recent_actions={memory_summary.get('recent', [])}\n"
        f"Grid (truncated): {json.dumps(grid, default=_json_default)[:2000]}\n"
        "Choose the next action."
    )


def _parse_action(
    text: str, allowed: List[str]
) -> Optional[Tuple[str, Dict[str, Any]]]:
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    name = str(obj.get("action", "")).upper()
    if name not in allowed:
        return None
    data: Dict[str, Any] = {}
    if name in COMPLEX_ACTIONS:
        x = obj.get("x", 0)
        y = obj.get("y", 0)
        try:
            data = {"x": int(x) % 64, "y": int(y) % 64}
        except (TypeError, ValueError):
            data = {"x": 0, "y": 0}
    return (name, data)


def _grid_as_list(frame: Any) -> List[Any]:
    """Return frame.frame as plain nested lists.

    The arcengine SDK annotates ``FrameData.frame`` as
    ``list[list[list[int]]]`` but at runtime returns either a numpy
    ndarray *or* a python list of ndarray layers. Normalise both shapes
    so json.dumps can handle the result. Falls back to a recursive
    walk that calls ``.tolist()`` on any ndarray it finds.
    """
    grid = getattr(frame, "frame", None)
    if grid is None:
        return []
    if hasattr(grid, "tolist"):
        return grid.tolist()
    return [
        item.tolist() if hasattr(item, "tolist") else item
        for item in grid
    ]


def _json_default(obj: Any) -> Any:
    """json.dumps default= hook for stray ndarrays / numpy scalars."""
    if hasattr(obj, "tolist"):
        return obj.tolist()
    raise TypeError(
        f"Object of type {type(obj).__name__} is not JSON serializable"
    )


def _frame_to_features(frame: Any) -> str:
    """Stable text encoding of a frame for the NOVA-NEO encoder."""
    grid = _grid_as_list(frame)
    state = getattr(getattr(frame, "state", None), "value", "?")
    levels = getattr(frame, "levels_completed", 0)
    return (
        f"state={state}|levels={levels}|"
        f"grid={json.dumps(grid, default=_json_default)}"
    )


def _frame_diff(prev: Any, curr: Any, max_samples: int = 12) -> Dict[str, Any]:
    """Compact diff between two frames suitable for an LLM prompt."""
    p = _grid_as_list(prev)
    c = _grid_as_list(curr)
    n_changed = 0
    samples: List[Dict[str, int]] = []
    for li, (pl, cl) in enumerate(zip(p, c)):
        for ri, (pr, cr) in enumerate(zip(pl, cl)):
            for ci, (pv, cv) in enumerate(zip(pr, cr)):
                if pv != cv:
                    n_changed += 1
                    if len(samples) < max_samples:
                        samples.append(
                            {
                                "layer": li,
                                "row": ri,
                                "col": ci,
                                "from": int(pv),
                                "to": int(cv),
                            }
                        )
    prev_levels = getattr(prev, "levels_completed", 0)
    curr_levels = getattr(curr, "levels_completed", 0)
    prev_state = getattr(getattr(prev, "state", None), "value", "")
    curr_state = getattr(getattr(curr, "state", None), "value", "")
    return {
        "n_changed": n_changed,
        "samples": samples,
        "levels_delta": curr_levels - prev_levels,
        "state_change": prev_state != curr_state,
        "curr_state": curr_state,
    }


class MappingGrokStrategy:
    """Map action semantics, then exploit them via Grok.

    Phase A: queue every available simple action (then complex actions)
    and play them once, recording the resulting :func:`_frame_diff`.
    Phase B: prompt Grok with the action->effect map plus the diff from
    the previous action, asking for the next move.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        fallback: Optional[Strategy] = None,
        complex_action_default: Tuple[int, int] = (32, 32),
    ) -> None:
        self.grok = GrokStrategy(
            api_key=api_key, base_url=base_url, model=model, fallback=fallback
        )
        self.fallback = self.grok.fallback
        self.action_effects: Dict[str, Dict[str, Any]] = {}
        self._mapping_queue: List[str] = []
        self._initialized = False
        self._last_action: Optional[str] = None
        self._last_diff: Optional[Dict[str, Any]] = None
        self._pending_mapping_action: Optional[str] = None
        self._complex_default = complex_action_default

    def _init_queue(self, available: List[str]) -> None:
        simple = [a for a in available if a not in COMPLEX_ACTIONS]
        complex_a = [a for a in available if a in COMPLEX_ACTIONS]
        self._mapping_queue = simple + complex_a
        self._initialized = True

    def choose(
        self,
        frame: Any,
        tensor: Sequence[float],
        memory_summary: Dict[str, Any],
        available_action_names: List[str],
    ) -> Tuple[str, Dict[str, Any]]:
        if not available_action_names:
            return ("ACTION1", {})
        if not self._initialized:
            self._init_queue(available_action_names)

        # Phase A: mapping. Skip already-mapped or unavailable entries.
        while self._mapping_queue:
            candidate = self._mapping_queue[0]
            if candidate in self.action_effects or candidate not in available_action_names:
                self._mapping_queue.pop(0)
                continue
            self._pending_mapping_action = candidate
            data: Dict[str, Any] = {}
            if candidate in COMPLEX_ACTIONS:
                x, y = self._complex_default
                data = {"x": x, "y": y}
            return (candidate, data)

        # Phase B: exploit.
        self._pending_mapping_action = None
        return self._exploit(frame, memory_summary, available_action_names)

    def _exploit(
        self,
        frame: Any,
        memory_summary: Dict[str, Any],
        available_action_names: List[str],
    ) -> Tuple[str, Dict[str, Any]]:
        client = self.grok._ensure_client()
        if client is None:
            return self.fallback.choose(
                frame, [], memory_summary, available_action_names
            )

        grid = _grid_as_list(frame)
        levels = getattr(frame, "levels_completed", 0)
        state = getattr(getattr(frame, "state", None), "value", "?")
        mapping_lines = [
            f"  {name}: changed={eff['n_changed']} cells, "
            f"levels_delta={eff['levels_delta']}, "
            f"samples={eff['samples'][:3]}"
            for name, eff in self.action_effects.items()
        ]
        last_block = (
            f"Last action: {self._last_action} -> "
            f"changed={self._last_diff['n_changed']} cells, "
            f"levels_delta={self._last_diff['levels_delta']}\n"
            if self._last_action and self._last_diff
            else "Last action: (none)\n"
        )
        user_msg = (
            f"State: {state}\n"
            f"Levels completed: {levels}\n"
            f"Available actions: {available_action_names}\n"
            f"Action mapping (action -> effect on grid):\n"
            + "\n".join(mapping_lines)
            + "\n"
            + last_block
            + f"Memory: resonance={memory_summary.get('resonance', 0):.3f}, "
            f"recent={memory_summary.get('recent', [])}\n"
            f"Grid (truncated): {json.dumps(grid, default=_json_default)[:1500]}\n"
            "Pick the next action. Goal: increase levels_completed."
        )
        try:
            completion = client.chat.completions.create(
                model=self.grok.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You play ARC-AGI-3. You have a learned mapping of "
                            "what each action does. Use it to make purposeful "
                            'moves. Reply with ONLY: {"action": "ACTION1..7", '
                            '"x": int, "y": int}. Omit x/y unless action is '
                            "ACTION6. No prose."
                        ),
                    },
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=80,
            )
            text = completion.choices[0].message.content or ""
            parsed = _parse_action(text, available_action_names)
            if parsed is not None:
                return parsed
        except Exception as exc:  # pragma: no cover -- network path
            logger.warning("Grok exploit call failed: %s", exc)
        return self.fallback.choose(
            frame, [], memory_summary, available_action_names
        )

    def observe(
        self,
        prev_frame: Any,
        action_name: str,
        next_frame: Any,
    ) -> None:
        """Called by the agent after each step. Records the diff."""
        if next_frame is None or prev_frame is None:
            return
        diff = _frame_diff(prev_frame, next_frame)
        self._last_action = action_name
        self._last_diff = diff
        if (
            self._pending_mapping_action is not None
            and action_name == self._pending_mapping_action
        ):
            self.action_effects[action_name] = diff
            if self._mapping_queue and self._mapping_queue[0] == action_name:
                self._mapping_queue.pop(0)
            self._pending_mapping_action = None


@dataclass
class MCOPArcAgi3Agent:
    """MCOP-instrumented ARC-AGI-3 agent.

    Each step: encode frame → query Stigmergy → strategy chooses action →
    step env → record etch + new trace.
    """

    strategy: Strategy = field(default_factory=RandomStrategy)
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    max_actions: int = 80
    encoder_dims: int = 64
    stigmergy: StigmergyStore = field(default_factory=StigmergyStore)
    etch: EtchLedger = field(default_factory=EtchLedger)

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.environ.get("ARC_API_KEY", "")
        self.base_url = (
            self.base_url
            or os.environ.get("ARC_BASE_URL")
            or "https://three.arcprize.org"
        )
        if not self.api_key:
            raise ValueError(
                "ARC_API_KEY missing. Set it in the environment or pass "
                "api_key= to MCOPArcAgi3Agent."
            )

    def list_games(self) -> List[str]:
        Arcade, *_ = _load_sdk()
        arcade = Arcade(arc_api_key=self.api_key, arc_base_url=self.base_url)
        return [info.game_id for info in arcade.get_environments()]

    def play(
        self, game_id: str, scorecard_tag: str = "mcop"
    ) -> GameResult:
        Arcade, _FrameData, GameAction, GameState = _load_sdk()
        arcade = Arcade(arc_api_key=self.api_key, arc_base_url=self.base_url)
        scorecard_id = arcade.open_scorecard(tags=[scorecard_tag])
        result = GameResult(game_id=game_id, scorecard_id=scorecard_id)
        env = arcade.make(game_id, scorecard_id=scorecard_id)
        if env is None:
            raise RuntimeError(f"Arcade.make returned None for {game_id!r}")

        frame = env.reset()
        recent: List[str] = []
        for step in range(self.max_actions):
            if frame is None:
                logger.warning("Null frame at step %d; stopping", step)
                break

            tensor = nova_neo_encode(
                _frame_to_features(frame), self.encoder_dims, normalize=True
            )
            resonance = self.stigmergy.get_resonance(tensor)
            memory_summary = {
                "resonance": resonance.score,
                "recent": recent[-5:],
            }
            allowed = [
                GameAction(code).name for code in (frame.available_actions or [])
            ] or [a.name for a in GameAction if a.name != "RESET"]

            action_name, action_data = self.strategy.choose(
                frame, tensor, memory_summary, allowed
            )
            try:
                action = GameAction[action_name]
            except KeyError:
                action = GameAction.ACTION1
                action_name = "ACTION1"

            next_frame = env.step(action, data=action_data or None)

            observe = getattr(self.strategy, "observe", None)
            if callable(observe):
                try:
                    observe(frame, action_name, next_frame)
                except Exception as exc:  # pragma: no cover -- defensive
                    logger.warning("strategy.observe raised: %s", exc)

            self.etch.apply_etch(
                tensor, tensor, note=f"arcagi3:{game_id}:{action_name}"
            )
            self.stigmergy.record_trace(
                tensor,
                tensor,
                metadata={
                    "game_id": game_id,
                    "action": action_name,
                    "step": step,
                },
            )

            state_name = (
                next_frame.state.value
                if next_frame and next_frame.state
                else "UNKNOWN"
            )
            levels = next_frame.levels_completed if next_frame else 0
            result.steps.append(
                StepRecord(
                    step=step,
                    action=action_name,
                    state=state_name,
                    levels_completed=levels,
                    score=float(levels),
                )
            )
            recent.append(action_name)
            frame = next_frame

            if next_frame is None:
                break
            if next_frame.state == GameState.WIN:
                break
            if next_frame.state == GameState.GAME_OVER:
                # Level reset only — competition rules forbid full reset.
                frame = env.reset()

        if frame is not None:
            result.final_state = (
                frame.state.value if frame.state else "UNKNOWN"
            )
            result.levels_completed = frame.levels_completed
            result.win_levels = frame.win_levels

        try:
            arcade.close_scorecard(scorecard_id)
        except Exception as exc:  # pragma: no cover -- network path
            logger.warning("close_scorecard failed: %s", exc)

        return result


__all__ = [
    "COMPLEX_ACTIONS",
    "GameResult",
    "GrokStrategy",
    "MCOPArcAgi3Agent",
    "MappingGrokStrategy",
    "RandomStrategy",
    "SDKUnavailable",
    "StepRecord",
    "Strategy",
]
