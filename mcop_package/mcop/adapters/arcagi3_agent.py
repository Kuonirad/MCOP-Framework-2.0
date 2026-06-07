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

import hashlib
import json
import logging
import math
import os
import random
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Sequence, Tuple

from mcop.adapters.base_adapter import EtchLedger, StigmergyStore
from mcop.triad import nova_neo_encode

logger = logging.getLogger(__name__)

# Action names that require an (x, y) coordinate payload. ARC-AGI-3
# convention: ACTION6 is the click/place action; everything else is a
# directional / button press.
COMPLEX_ACTIONS = frozenset({"ACTION6"})

# Production ARC-Grok defaults: route through the requested Grok 4.3 model
# while keeping the adapter-side MCOP memory footprint aligned with the
# TypeScript GROK_4_3_LOW_MEMORY_MCOP_PRESET (32-dim tensors, 256 traces).
DEFAULT_GROK_MODEL = "grok-4.3"
LOW_MEMORY_ENCODER_DIMS = 32
GOAL_COLOR = 8
LOW_MEMORY_MAX_TRACES = 256

# Production ARC-Qwen defaults: route through Qwen3.5-flash on the
# international DashScope OpenAI-compatible endpoint. Mirrors the
# TypeScript ``mapping_qwen`` production profile in
# ``src/adapters/qwenAdapter.ts`` so the Python ARC pipeline picks the
# same model as the cross-language Universal Adapter Protocol v2.1
# router by default.
DEFAULT_QWEN_MODEL = "qwen3.5-flash"
DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"


def _positive_int_env(name: str, fallback: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return fallback
    try:
        value = int(raw)
    except ValueError:
        logger.warning("Ignoring non-integer %s=%r; using %d", name, raw, fallback)
        return fallback
    if value <= 0:
        logger.warning("Ignoring non-positive %s=%r; using %d", name, raw, fallback)
        return fallback
    return value


def _low_memory_stigmergy_store() -> StigmergyStore:
    return StigmergyStore(
        max_traces=_positive_int_env("MCOP_MAX_TRACES", LOW_MEMORY_MAX_TRACES)
    )


# Pulls the integer suffix out of names like "ACTION5" / "Action 5" / "action5".
# Used by snap-to-allowed when the model picks a forbidden action so we can
# fall to the closest neighbour by numeric distance instead of going random.
_ACTION_NUM_RE = re.compile(r"ACTION\s*(\d+)", re.IGNORECASE)


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

    def as_dict(self) -> Dict[str, Any]:
        return {
            "step": self.step,
            "action": self.action,
            "state": self.state,
            "levels_completed": self.levels_completed,
            "score": self.score,
        }


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
            "steps": [step.as_dict() for step in self.steps],
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
        # Default ARC-Grok dispatch now targets Grok 4.3. Override via
        # the `GROK_MODEL` env var (workflow input or local export) or
        # the `model=` constructor kwarg for local experiments.
        self.model = model or os.environ.get("GROK_MODEL", DEFAULT_GROK_MODEL)
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
        logger.info(
            "Grok client initialised: model=%s base_url=%s",
            self.model,
            self.base_url,
        )
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
                            "This is the ARC-AGI-3 environment. Each turn "
                            "you pick one action expected to make progress "
                            "on the current level. Respond with a JSON "
                            'object such as {"action": "ACTION3"}, choosing '
                            "the name from the `Available actions` list in "
                            "the user message. For ACTION6, also include "
                            "integer x and y target coordinates."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                max_tokens=64,
            )
            text = completion.choices[0].message.content or ""
            parsed, outcome = _decide_action(text, available_action_names)
            if parsed is not None:
                _log_parse_outcome("grok", outcome, parsed[0])
                return parsed
            _log_parse_failure(
                "grok", outcome, text, available_action_names
            )
            return self.fallback.choose(
                frame, tensor, memory_summary, available_action_names
            )
        except Exception as exc:  # pragma: no cover -- network path
            logger.warning("Grok call failed: %s; using fallback", exc)
            return self.fallback.choose(
                frame, tensor, memory_summary, available_action_names
            )


def _format_history(actions: List[str], levels: List[int]) -> str:
    """Render recent action history as a prominent, action-aligned block.

    The pre-fix prompt buried recent actions inside a `Memory:` line as
    `recent=[...]`, which Grok routinely ignored -- on `ls20` the model
    cycled `[ACTION1, ACTION3]` for 50+ steps because each turn it picked
    fresh from the current grid with no awareness of what it had just
    tried. Pairing each action with the levels_completed it produced and
    naming the field explicitly gives the model a chance to notice
    oscillation and break out of it.
    """
    if not actions:
        return "Your recent actions: (none yet, this is the first pick)\n"
    pairs: List[str] = []
    for i, name in enumerate(actions):
        if i < len(levels):
            pairs.append(f"{name}->lvl{levels[i]}")
        else:
            pairs.append(name)
    return (
        f"Your last {len(actions)} actions (oldest to newest): "
        f"{', '.join(pairs)}. "
        "If your recent picks are oscillating between the same actions "
        "and levels are not advancing, try a different action that "
        "you have not just tried.\n"
    )


def _build_prompt(
    frame: Any,
    memory_summary: Dict[str, Any],
    available_action_names: List[str],
) -> str:
    grid = _grid_as_list(frame)
    levels = getattr(frame, "levels_completed", 0)
    state = getattr(getattr(frame, "state", None), "value", str(frame))
    recent_actions = list(memory_summary.get("recent", []) or [])
    recent_levels = list(memory_summary.get("recent_levels", []) or [])
    return (
        f"State: {state}\n"
        f"Levels completed: {levels}\n"
        f"Available actions: {available_action_names}\n"
        + _format_history(recent_actions, recent_levels)
        + f"Memory resonance score: "
        f"{memory_summary.get('resonance', 0):.3f}\n"
        f"Grid (truncated): {json.dumps(grid, default=_json_default)[:2000]}\n"
        "Choose the next action."
    )


@dataclass
class _ParseOutcome:
    """Why an LLM action selection succeeded, was salvaged, or failed.

    Kinds:
      ``ok``                  -- model picked an allowed action.
      ``snapped``              -- model picked a disallowed action but we
                                  snapped to the closest allowed neighbour.
      ``disallowed_no_snap``   -- disallowed action and no numeric neighbour;
                                  caller should random-fall-back.
      ``no_braces``            -- no ``{...}`` in the response.
      ``invalid_json``         -- braces present but JSON parse failed.
      ``missing_action``       -- JSON parsed but had no ``action`` field.
    """

    kind: str
    raw_action: Optional[str] = None
    snapped_to: Optional[str] = None


def _snap_to_allowed(raw_action: str, allowed: List[str]) -> Optional[str]:
    """Return the allowed action whose numeric suffix is closest to ``raw``.

    Ties prefer the lower number (deterministic). Returns ``None`` when
    either ``raw_action`` has no ACTIONn-style suffix or no allowed action
    does — in that case the caller should fall back to its random strategy.
    """
    m = _ACTION_NUM_RE.search(raw_action or "")
    if not m:
        return None
    target = int(m.group(1))
    candidates: List[Tuple[int, int, str]] = []
    for name in allowed:
        cm = _ACTION_NUM_RE.search(name)
        if not cm:
            continue
        num = int(cm.group(1))
        candidates.append((abs(num - target), num, name))
    if not candidates:
        return None
    candidates.sort()
    return candidates[0][2]


def _data_for_action(
    name: str,
    obj: Dict[str, Any],
    complex_default: Tuple[int, int] = (0, 0),
) -> Dict[str, Any]:
    if name not in COMPLEX_ACTIONS:
        return {}
    x = obj.get("x", complex_default[0])
    y = obj.get("y", complex_default[1])
    try:
        return {"x": int(x) % 64, "y": int(y) % 64}
    except (TypeError, ValueError):
        return {"x": complex_default[0], "y": complex_default[1]}


def _decide_action(
    text: str,
    allowed: List[str],
    complex_default: Tuple[int, int] = (0, 0),
) -> Tuple[Optional[Tuple[str, Dict[str, Any]]], _ParseOutcome]:
    """Parse an LLM response into ``(name, data)`` with a diagnostic.

    On exact match: ``(parsed, kind="ok")``.
    On disallowed-but-snappable: ``(snapped, kind="snapped")`` so the agent
    keeps making intentional moves instead of silently going random.
    All other paths return ``(None, kind=...)`` and the caller logs + falls
    back to its random strategy.
    """
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None, _ParseOutcome(kind="no_braces")
    try:
        obj = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None, _ParseOutcome(kind="invalid_json")
    raw = obj.get("action")
    if raw is None:
        return None, _ParseOutcome(kind="missing_action")
    name = str(raw).upper().strip()
    if name in allowed:
        return (
            (name, _data_for_action(name, obj, complex_default)),
            _ParseOutcome(kind="ok"),
        )
    snapped = _snap_to_allowed(name, allowed)
    if snapped is not None:
        return (
            (snapped, _data_for_action(snapped, obj, complex_default)),
            _ParseOutcome(kind="snapped", raw_action=name, snapped_to=snapped),
        )
    return None, _ParseOutcome(kind="disallowed_no_snap", raw_action=name)


def _parse_action(
    text: str, allowed: List[str]
) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Backward-compatible wrapper: returns the action only on exact match.

    Disallowed / snap-to-allowed paths are handled by callers that want the
    diagnostic; this helper preserves the original strict semantics for any
    external users of the module.
    """
    parsed, outcome = _decide_action(text, allowed)
    if outcome.kind == "ok":
        return parsed
    return None


def _log_parse_outcome(tag: str, outcome: _ParseOutcome, action: str) -> None:
    """Log a successful pick (``ok`` or ``snapped``)."""
    if outcome.kind == "snapped":
        logger.warning(
            "%s picked disallowed action %s; snapping to nearest "
            "allowed %s",
            tag,
            outcome.raw_action,
            outcome.snapped_to,
        )
    else:
        logger.info("%s pick: %s", tag, action)


def _log_parse_failure(
    tag: str,
    outcome: _ParseOutcome,
    raw_text: str,
    allowed: List[str],
) -> None:
    """Log a parse failure with a kind-specific message before falling back.

    The pre-existing log was a single ``response unparseable`` warning that
    conflated four very different conditions, so a Grok response of
    ``{"action": "ACTION5"}`` (perfectly valid JSON, just not in the
    allowed list) was indistinguishable from genuine garbage. Each branch
    now emits a distinct message so the failure mode is unambiguous.
    """
    snippet = raw_text[:200]
    if outcome.kind == "disallowed_no_snap":
        logger.warning(
            "%s picked disallowed action %r (allowed=%s, no numeric "
            "neighbour to snap to); falling back to random",
            tag,
            outcome.raw_action,
            allowed,
        )
    elif outcome.kind == "no_braces":
        logger.warning(
            "%s response had no JSON object, falling back. Raw: %r",
            tag,
            snippet,
        )
    elif outcome.kind == "invalid_json":
        logger.warning(
            "%s response was not valid JSON, falling back. Raw: %r",
            tag,
            snippet,
        )
    elif outcome.kind == "missing_action":
        logger.warning(
            "%s response had no `action` field, falling back. Raw: %r",
            tag,
            snippet,
        )
    else:  # pragma: no cover -- defensive: unknown kind
        logger.warning(
            "%s response unparseable (%s), falling back. Raw: %r",
            tag,
            outcome.kind,
            snippet,
        )


class _StuckDetector:
    """Periodicity-based loop detector for the ``play()`` action stream.

    Watches the last ``_WINDOW`` (action, levels_completed) pairs and
    emits a one-line description when *all* of the following are true:

    * the level counter never advances within the window (so the agent
      isn't actually solving anything), AND
    * the action sequence is exactly a period-2 cycle repeated 3 times
      (e.g. ``ACTION3, ACTION1, ACTION3, ACTION1, ACTION3, ACTION1``)
      OR a period-3 cycle repeated 2 times
      (e.g. ``ACTION1, ACTION2, ACTION3, ACTION1, ACTION2, ACTION3``),
      with the cycle containing at least two distinct actions. A
      single-action repeat (``ACTION2, ACTION2, ...``) is its own
      pathology and intentionally NOT flagged here -- that one shows up
      directly in the per-step log.

    The detector emits each unique stuck-signature exactly once, so a
    long-running loop produces a single warning rather than a per-step
    flood. The signature includes the levels value, so re-entering the
    same cycle at a different level (very rare) re-warns. If the agent
    breaks out (level advances OR action sequence changes), the
    next time it falls back into a loop will warn again.
    """

    _WINDOW = 6

    def __init__(self) -> None:
        self._actions: List[str] = []
        self._levels: List[int] = []
        self._last_warned: Optional[str] = None

    def observe(self, action: str, levels: int) -> Optional[str]:
        """Append (action, levels) and return a warning string if a NEW
        stuck pattern crystallised on this step. Returns ``None`` when
        no warning is due (insufficient data, no loop, or already-warned
        loop)."""
        self._actions.append(action)
        self._levels.append(levels)
        if len(self._actions) < self._WINDOW:
            return None
        window_actions = self._actions[-self._WINDOW:]
        window_levels = self._levels[-self._WINDOW:]
        # Any level change in the window means progress -- not stuck.
        if len(set(window_levels)) > 1:
            self._last_warned = None
            return None
        for period in (2, 3):
            if self._WINDOW % period != 0:
                continue  # pragma: no cover -- _WINDOW=6 covers both
            cycles = self._WINDOW // period
            cycle = window_actions[:period]
            if len(set(cycle)) < 2:
                # Flat repeat (all same action) -- not what this detector
                # targets. The per-step log already shows the action name
                # repeating; we don't want to double-flag that case.
                continue
            if window_actions != cycle * cycles:
                continue
            # Rotation-invariant signature: sliding the window by one
            # step produces the same cycle in a different order
            # (e.g. ``[3,1]`` vs ``[1,3]``), so signing on the raw
            # cycle would re-warn every step. Sort the unique elements
            # to collapse all rotations of the same loop into one
            # signature.
            sig_parts = ",".join(sorted(set(cycle)))
            signature = f"period-{period}:{sig_parts}@{window_levels[0]}"
            if signature == self._last_warned:
                return None
            self._last_warned = signature
            return (
                f"period-{period} loop {cycle} repeated "
                f"{cycles}x with no levels_delta "
                f"(levels={window_levels[0]})"
            )
        # No periodic loop matched -- if the agent has clearly moved on
        # (last action different from the one before), forget the warned
        # signature so a future stuck-state can re-warn.
        if (
            len(window_actions) >= 2
            and window_actions[-1] != window_actions[-2]
        ):
            self._last_warned = None
        return None


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


def _color_centroids(grid: List[Any]) -> Dict[int, Tuple[float, float]]:
    """Mean (row, col) position of every colour present in ``grid``.

    Used by :class:`_PlayerColorDetector` to track per-colour centroid
    drift across actions. Walks the full grid so the centroid is
    unbiased; returns an empty dict for an empty grid.
    """
    sums_r: Dict[int, float] = {}
    sums_c: Dict[int, float] = {}
    counts: Dict[int, int] = {}
    for layer in grid:
        for ri, row in enumerate(layer):
            for ci, val in enumerate(row):
                colour = int(val)
                sums_r[colour] = sums_r.get(colour, 0.0) + ri
                sums_c[colour] = sums_c.get(colour, 0.0) + ci
                counts[colour] = counts.get(colour, 0) + 1
    return {
        colour: (sums_r[colour] / counts[colour], sums_c[colour] / counts[colour])
        for colour in counts
    }


def _diff_color_tally(prev: Any, curr: Any) -> Dict[int, int]:
    """For every cell that changed between ``prev`` and ``curr``, count
    how many times each colour value appeared on either side of the
    change. Used by :class:`_GoalColorDetector` to credit colours that
    co-occur with level advances. Walks the full grid (not just
    ``_frame_diff``'s 12-sample subset) so the credit is unbiased.
    """
    p = _grid_as_list(prev)
    c = _grid_as_list(curr)
    tally: Dict[int, int] = {}
    for pl, cl in zip(p, c):
        for pr, cr in zip(pl, cl):
            for pv, cv in zip(pr, cr):
                if pv != cv:
                    tally[int(pv)] = tally.get(int(pv), 0) + 1
                    tally[int(cv)] = tally.get(int(cv), 0) + 1
    return tally


class _GoalColorDetector:
    """Online, no-prior-knowledge goal-colour discovery.

    Watches every observed transition and, on the steps where
    ``levels_delta > 0``, tallies which colour values participated in
    the diff (either as the ``from`` or ``to`` value of any changed
    cell). The colour that accumulates the most credit across advances
    is the inferred goal colour.

    Background colour 0 is excluded — every level advance also tends
    to vacate cells back to 0, which would otherwise dominate the
    tally and wash out the real signal.

    Returns ``None`` until ``min_advances`` advances have been
    observed; callers should fall back to a configured default during
    that bootstrap window. Fully ARC-AGI-3 compliant: zero offline
    data, zero per-game hardcoding, learned strictly online.
    """

    def __init__(self, min_advances: int = 1) -> None:
        self.min_advances = min_advances
        self.advance_credits: Dict[int, int] = {}
        self.advances_seen = 0

    def observe(self, prev_frame: Any, next_frame: Any) -> None:
        if prev_frame is None or next_frame is None:
            return
        prev_levels = getattr(prev_frame, "levels_completed", 0)
        next_levels = getattr(next_frame, "levels_completed", 0)
        if next_levels - prev_levels <= 0:
            return
        self.advances_seen += 1
        for colour, count in _diff_color_tally(prev_frame, next_frame).items():
            if colour == 0:
                continue  # background; exclude.
            self.advance_credits[colour] = (
                self.advance_credits.get(colour, 0) + count
            )

    def current(self) -> Optional[int]:
        if self.advances_seen < self.min_advances or not self.advance_credits:
            return None
        # Highest credit wins; ties broken by lower colour index for
        # determinism (so two scorecards on the same trace agree).
        return max(
            self.advance_credits.items(),
            key=lambda kv: (kv[1], -kv[0]),
        )[0]


class _PlayerColorDetector:
    """Online, no-prior-knowledge player-colour discovery.

    Watches every observed ``(prev_frame, action, next_frame)``
    transition. For each colour visible in both frames, records the
    centroid drift vector keyed by the action that produced the
    transition. The "player" is the colour whose mean drift vector
    *varies the most across actions* (i.e. ACTION1 produces a clearly
    different drift than ACTION2 etc).

    Static colours (centroid never moves), large-area colours whose
    centroid is dominated by background fill, and ticking colours
    whose centroid drifts the *same* on every action (e.g. a timer)
    all have low cross-action variance and are correctly filtered out.

    Returns ``None`` until

    * at least ``min_observations`` transitions have contributed
      drift data for at least one colour, **and**
    * at least ``min_actions`` distinct action names have been seen,
      **and**
    * the leading candidate's cross-action variance exceeds
      ``min_variance``.

    Fully ARC-AGI-3 / Kaggle compliant: zero offline data, zero
    per-game hardcoding, learned strictly online from the live play.
    """

    def __init__(
        self,
        min_observations: int = 4,
        min_actions: int = 2,
        min_variance: float = 0.5,
        switch_margin: float = 1.5,
    ) -> None:
        self.min_observations = min_observations
        self.min_actions = min_actions
        self.min_variance = min_variance
        # Hysteresis: once a player colour is committed, a challenger
        # must beat its variance by this factor before we switch. Two
        # colours with near-equal action-drift variance (e.g. the player
        # sprite and a goal token that both shift with the camera) would
        # otherwise make the argmax flip-flop every observation, and each
        # flip resets the strategy's state-dependent caches -- thrashing
        # the very forward-model / visit history exploration relies on.
        self.switch_margin = switch_margin
        # per-(colour, action_name) -> list of (dr, dc) drift vectors
        self.drifts: Dict[Tuple[int, str], List[Tuple[float, float]]] = {}
        self.observations_seen = 0
        self._cached: Optional[int] = None
        self._cache_obs_count = -1
        # Sticky committed choice for the hysteresis above.
        self._committed: Optional[int] = None

    def observe(
        self,
        prev_frame: Any,
        action_name: str,
        next_frame: Any,
    ) -> None:
        if prev_frame is None or next_frame is None:
            return
        prev_centroids = _color_centroids(_grid_as_list(prev_frame))
        next_centroids = _color_centroids(_grid_as_list(next_frame))
        recorded = False
        for colour, prev_c in prev_centroids.items():
            if colour == 0:
                continue  # background; exclude.
            next_c = next_centroids.get(colour)
            if next_c is None:
                continue  # colour disappeared on this transition.
            dr = next_c[0] - prev_c[0]
            dc = next_c[1] - prev_c[1]
            self.drifts.setdefault((colour, action_name), []).append((dr, dc))
            recorded = True
        if recorded:
            self.observations_seen += 1
        # Invalidate cache; next current() call recomputes.
        self._cached = None

    def current(self) -> Optional[int]:
        if (
            self._cached is not None
            and self._cache_obs_count == self.observations_seen
        ):
            return self._cached
        if self.observations_seen < self.min_observations:
            return None
        actions_seen = {a for _, a in self.drifts}
        if len(actions_seen) < self.min_actions:
            return None
        scores: Dict[int, float] = {}
        colours = {c for c, _ in self.drifts}
        for colour in colours:
            action_means: Dict[str, Tuple[float, float]] = {}
            for (col, act), vecs in self.drifts.items():
                if col != colour or not vecs:
                    continue
                mean_dr = sum(v[0] for v in vecs) / len(vecs)
                mean_dc = sum(v[1] for v in vecs) / len(vecs)
                action_means[act] = (mean_dr, mean_dc)
            if len(action_means) < self.min_actions:
                continue
            avg_dr = sum(v[0] for v in action_means.values()) / len(action_means)
            avg_dc = sum(v[1] for v in action_means.values()) / len(action_means)
            variance = sum(
                (v[0] - avg_dr) ** 2 + (v[1] - avg_dc) ** 2
                for v in action_means.values()
            ) / len(action_means)
            scores[colour] = variance
        if not scores:
            return None
        # Highest variance wins; ties broken by lower colour index for
        # determinism (so two scorecards on the same trace agree).
        best_colour, best_var = max(
            scores.items(), key=lambda kv: (kv[1], -kv[0])
        )
        if best_var < self.min_variance:
            return None
        # Hysteresis: stick with the committed colour unless a different
        # colour beats it by ``switch_margin``. The first qualifying
        # discovery commits freely (nothing to beat).
        committed = self._committed
        if (
            committed is not None
            and committed != best_colour
            and committed in scores
            and best_var < scores[committed] * self.switch_margin
        ):
            best_colour = committed
        self._committed = best_colour
        self._cached = best_colour
        self._cache_obs_count = self.observations_seen
        return best_colour


class _ForwardModel:
    """Online-learned (state, action) -> next_state graph + bounded BFS.

    Records every observed transition so the strategy can plan
    short action sequences toward a state that previously produced a
    level advance. The graph is built strictly from in-episode
    ``observe()`` calls: no offline data, no leaked answers, no
    per-game priors — fully ARC-AGI-3 compliant.

    ``plan(start, available)`` returns the *first action* of the
    shortest action-path from ``start`` to any state in
    ``terminal_states`` whose length is at most ``max_plan_depth``.
    Returns ``None`` when no such path exists in the learned graph,
    so the caller can fall back to its own scoring logic. Planning
    consumes zero env steps.
    """

    def __init__(self, max_plan_depth: int = 6) -> None:
        self.max_plan_depth = max_plan_depth
        self.transitions: Dict[Tuple[str, str], str] = {}
        self.terminal_states: set = set()

    def add_transition(
        self,
        state: str,
        action: str,
        next_state: str,
        levels_delta: int,
    ) -> None:
        self.transitions[(state, action)] = next_state
        if levels_delta > 0:
            self.terminal_states.add(next_state)

    def reset(self) -> None:
        self.transitions.clear()
        self.terminal_states.clear()

    def plan(
        self, start: str, available: List[str]
    ) -> Optional[str]:
        from collections import deque

        if not self.terminal_states or not available:
            return None
        # Direct hit: any (start, a) -> terminal short-circuits BFS.
        for action in available:
            nxt = self.transitions.get((start, action))
            if nxt is not None and nxt in self.terminal_states:
                return action
        visited = {start}
        queue: Any = deque()
        for action in available:
            nxt = self.transitions.get((start, action))
            if nxt is not None and nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, action, 1))
        while queue:
            state, first_action, depth = queue.popleft()
            if depth >= self.max_plan_depth:
                continue
            for action in available:
                nxt = self.transitions.get((state, action))
                if nxt is None:
                    continue
                if nxt in self.terminal_states:
                    return first_action
                if nxt not in visited:
                    visited.add(nxt)
                    queue.append((nxt, first_action, depth + 1))
        return None


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
            # Surface the deterministic mapping pick at INFO so the full
            # action sequence is visible without --verbose. Without this
            # the only Phase A signal in the log was the eventual jump to
            # Phase B's first Grok call, making it impossible to confirm
            # the mapping queue was actually consumed in order.
            logger.info(
                "mapping-grok phase-A pick: %s (learned=%d/%d)",
                candidate,
                len(self.action_effects),
                len(self.action_effects) + len(self._mapping_queue),
            )
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
        recent_actions = list(memory_summary.get("recent", []) or [])
        recent_levels = list(memory_summary.get("recent_levels", []) or [])
        user_msg = (
            f"State: {state}\n"
            f"Levels completed: {levels}\n"
            f"Available actions: {available_action_names}\n"
            f"Action mapping (action -> effect on grid):\n"
            + "\n".join(mapping_lines)
            + "\n"
            + last_block
            + _format_history(recent_actions, recent_levels)
            + f"Memory resonance score: "
            f"{memory_summary.get('resonance', 0):.3f}\n"
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
                            "This is the ARC-AGI-3 environment. You have a "
                            "learned mapping of what each action does on "
                            "this game; use it to make purposeful moves "
                            "that increase levels_completed. Respond with "
                            'a JSON object such as {"action": "ACTION3"}, '
                            "choosing the name from the `Available actions` "
                            "list in the user message. For ACTION6, also "
                            "include integer x and y target coordinates."
                        ),
                    },
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=80,
            )
            text = completion.choices[0].message.content or ""
            parsed, outcome = _decide_action(
                text,
                available_action_names,
                complex_default=self._complex_default,
            )
            if parsed is not None:
                _log_parse_outcome("mapping-grok", outcome, parsed[0])
                return parsed
            _log_parse_failure(
                "mapping-grok", outcome, text, available_action_names
            )
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


class QwenStrategy:
    """LLM-driven action selection via Alibaba Qwen (DashScope OpenAI-compatible).

    Strict parity with :class:`GrokStrategy`. The only differences are:

    * Default endpoint is the international DashScope compatible-mode
      base URL (``https://dashscope-intl.aliyuncs.com/compatible-mode/v1``),
      not ``https://api.x.ai/v1``.
    * Default model is :data:`DEFAULT_QWEN_MODEL` (``"qwen3.5-flash"``)
      to mirror the TypeScript ``mapping_qwen`` production profile in
      ``src/adapters/qwenAdapter.ts``.
    * Credentials are read from ``QWEN_API_KEY`` with a documented
      fall-through to ``DASHSCOPE_API_KEY`` for users coming from the
      upstream SDK naming convention.

    Every other code path -- prompt building, snap-to-allowed,
    parse-outcome logging, fallback to ``RandomStrategy`` -- is
    bit-identical to ``GrokStrategy`` so the agent's compliance and
    provenance surfaces are unchanged between providers.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        fallback: Optional[Strategy] = None,
    ) -> None:
        self.api_key = (
            api_key
            or os.environ.get("QWEN_API_KEY")
            or os.environ.get("DASHSCOPE_API_KEY")
            or ""
        )
        self.base_url = (
            base_url
            or os.environ.get("QWEN_BASE_URL")
            or os.environ.get("DASHSCOPE_BASE_URL")
            or DEFAULT_QWEN_BASE_URL
        )
        self.model = model or os.environ.get("QWEN_MODEL", DEFAULT_QWEN_MODEL)
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
        logger.info(
            "Qwen client initialised: model=%s base_url=%s",
            self.model,
            self.base_url,
        )
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
                            "This is the ARC-AGI-3 environment. Each turn "
                            "you pick one action expected to make progress "
                            "on the current level. Respond with a JSON "
                            'object such as {"action": "ACTION3"}, choosing '
                            "the name from the `Available actions` list in "
                            "the user message. For ACTION6, also include "
                            "integer x and y target coordinates."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                max_tokens=64,
            )
            text = completion.choices[0].message.content or ""
            parsed, outcome = _decide_action(text, available_action_names)
            if parsed is not None:
                _log_parse_outcome("qwen", outcome, parsed[0])
                return parsed
            _log_parse_failure(
                "qwen", outcome, text, available_action_names
            )
            return self.fallback.choose(
                frame, tensor, memory_summary, available_action_names
            )
        except Exception as exc:  # pragma: no cover -- network path
            logger.warning("Qwen call failed: %s; using fallback", exc)
            return self.fallback.choose(
                frame, tensor, memory_summary, available_action_names
            )


class MappingQwenStrategy:
    """Map action semantics, then exploit them via Qwen.

    Drop-in mirror of :class:`MappingGrokStrategy`. Phase A cycles every
    available action once, observing :func:`_frame_diff`. Phase B hands
    Qwen the learned mapping plus the last action's diff. Both phases
    share the exact prompt shape used by Grok, so any prompt-engineering
    improvement (history block, oscillation-break hint, mapping
    summary) automatically benefits both providers.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        fallback: Optional[Strategy] = None,
        complex_action_default: Tuple[int, int] = (32, 32),
    ) -> None:
        self.qwen = QwenStrategy(
            api_key=api_key, base_url=base_url, model=model, fallback=fallback
        )
        self.fallback = self.qwen.fallback
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
            logger.info(
                "mapping-qwen phase-A pick: %s (learned=%d/%d)",
                candidate,
                len(self.action_effects),
                len(self.action_effects) + len(self._mapping_queue),
            )
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
        client = self.qwen._ensure_client()
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
        recent_actions = list(memory_summary.get("recent", []) or [])
        recent_levels = list(memory_summary.get("recent_levels", []) or [])
        user_msg = (
            f"State: {state}\n"
            f"Levels completed: {levels}\n"
            f"Available actions: {available_action_names}\n"
            f"Action mapping (action -> effect on grid):\n"
            + "\n".join(mapping_lines)
            + "\n"
            + last_block
            + _format_history(recent_actions, recent_levels)
            + f"Memory resonance score: "
            f"{memory_summary.get('resonance', 0):.3f}\n"
            f"Grid (truncated): {json.dumps(grid, default=_json_default)[:1500]}\n"
            "Pick the next action. Goal: increase levels_completed."
        )
        try:
            completion = client.chat.completions.create(
                model=self.qwen.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "This is the ARC-AGI-3 environment. You have a "
                            "learned mapping of what each action does on "
                            "this game; use it to make purposeful moves "
                            "that increase levels_completed. Respond with "
                            'a JSON object such as {"action": "ACTION3"}, '
                            "choosing the name from the `Available actions` "
                            "list in the user message. For ACTION6, also "
                            "include integer x and y target coordinates."
                        ),
                    },
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=80,
            )
            text = completion.choices[0].message.content or ""
            parsed, outcome = _decide_action(
                text,
                available_action_names,
                complex_default=self._complex_default,
            )
            if parsed is not None:
                _log_parse_outcome("mapping-qwen", outcome, parsed[0])
                return parsed
            _log_parse_failure(
                "mapping-qwen", outcome, text, available_action_names
            )
        except Exception as exc:  # pragma: no cover -- network path
            logger.warning("Qwen exploit call failed: %s", exc)
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


class HolographicShadowStrategy:
    """Player-tracking, oscillation-aware action chooser with debug provenance.

    Adapts the v2 holographic-shadow design to the discrete ARC-AGI-3
    grid (no env rollback, integer cells). Six behaviours:

    1. Goal-mask + player-position state keying. The state hash
       captures the goal-colour mask (an invariant landmark for
       planning) **and** the player centroid binned to integer cells.
       Goal mask alone collapses the cache in goal-static games (e.g.
       ls20 keeps the goal at one corner), so wall-learning would
       grow uniformly across all actions and produce a deterministic
       cycle; including the player position makes walls per-cell.
    2. Dual movement thresholds keyed on **player-centroid** drift.
       When both prev and curr frames expose a player centroid,
       ``observe()`` classifies a step as ``real_move`` when the
       centroid moved further than ``move_threshold_centroid``
       (default 1.5 cells) and as ``blocked_wobble`` only when it
       moved less than ``wobble_threshold_centroid`` (default 0.5
       cells). Drifts in between are ``ambiguous_drift`` and update
       neither the move-rate nor the wall counter, so sub-cell sprite
       jitter no longer reads as either progress or a wall. Until
       the player colour has been auto-discovered, the strategy
       falls back to the cell-count threshold
       (``move_threshold_cells``, default 2 cells).
    3. Per-step debug provenance. Every observed transition appends a
       record to ``provenance`` (type, action, n_changed,
       player-centroid delta, wall hit count, levels delta).
       Wall-learning hits also emit a dedicated ``debug_wall_learning``
       entry the first time a given (state, action) is registered as
       blocked, and oscillation-driven novelty picks emit a
       ``debug_loop_detected`` entry the first time a given centroid
       pattern triggers, so a stuck state can be reconstructed
       exactly after the fact.
    4. Wall learning. ``blocked_wobble`` increments
       ``walls[(state_hash, action)]``; the chooser subtracts that
       count from the score so repeated walls fall to the back.
    5. Oscillation -> novelty. A short ring buffer of player
       centroids detects ABAB-style alternation; while detected, the
       score is biased toward the least-tried action at the current
       state (``state_action_tries``) so the agent breaks out of the
       cycle even when no action has yet been classified as a wall.

    Three further behaviours, all fully ARC-AGI-3 / Kaggle compliant
    (no offline data, no per-game hardcoding, learned strictly
    online from the live play):

    6. Auto goal-colour discovery. A :class:`_GoalColorDetector`
       watches every transition; once it has seen ``min_advances``
       level advances it credits the colour most associated with them
       and the strategy re-keys its state-dependent caches. Until
       then the configured ``goal_color`` (default 8) is used.
       Disable with ``auto_discover_goal_color=False``.
    7. Auto player-colour discovery. A :class:`_PlayerColorDetector`
       records per-(colour, action) centroid drift vectors and picks
       the colour whose drift varies the most across actions. Static
       and ticking colours (centroid drifts the same on every action,
       like a timer) are filtered out by the variance signal. The
       default ``player_color`` is ``None``: until enough
       cross-action observations exist, movement classification
       falls back to the cell-count threshold. Disable with
       ``auto_discover_player_color=False`` (and pass an explicit
       ``player_color`` for offline determinism testing).
    8. Forward-model planning. A :class:`_ForwardModel` records
       observed ``(state, action) -> next_state`` transitions and
       flags any next-state that produced a level advance. On each
       :meth:`choose` the strategy runs a bounded BFS over the
       learned graph; if a short action sequence reaches a known
       advance state, the first action of that path is returned in
       preference to the score-based pick. Planning consumes zero
       env steps. Disable with ``max_plan_depth=0``.

    The strategy learns from real outcomes via ``observe()`` (same
    channel :class:`MappingGrokStrategy` uses), so no env probing is
    required. Falls back to ``fallback`` (default
    :class:`RandomStrategy`) only when no available actions are passed.
    """

    GOAL_COLOR = 8
    MOVE_THRESHOLD_CELLS = 2
    MOVE_THRESHOLD_CENTROID = 1.5
    WOBBLE_THRESHOLD_CENTROID = 0.5
    HISTORY_WINDOW = 6
    OSCILLATION_REPEAT = 3
    MAX_PLAN_DEPTH = 6
    # Default weight on the "shadow biased toward the goal" attraction
    # term. Cosine alignment ∈ [-1, 1], so a weight of 0.5 puts goal
    # attraction on the same order as the wall-hit penalty (1.0) only
    # in the limit of perfectly aligned drift; exploration still wins
    # when no aligned action has been observed yet.
    GOAL_ALIGNMENT_WEIGHT = 0.8  # increased to leverage full MCOP goal-shadow from holographicEtch + positiveResonanceAmplifier in the repo
    # Default search depth for the goal-BFS planner. Generous enough
    # that the planner can route around several walls but small enough
    # to bound per-step cost on a 64x64 grid.
    GOAL_BFS_MAX_DEPTH = 24
    # Minimum number of distinct actions with a learned mean drift
    # before the BFS planner is allowed to engage. Below this floor
    # the move model is too sparse to plan against and the strategy
    # falls back to the score-based chooser (which already has
    # goal-directional bias from PR #648).
    GOAL_BFS_MIN_ACTION_DRIFTS = 2
    # Always-on per-(state, action) novelty penalty applied on *every*
    # score-based pick, not only once an ABAB oscillation is detected.
    # This diversifies action choice from the first steps instead of
    # locking onto whichever action happened to move first (the ls20
    # "ACTION1 for 8 steps" failure mode). Kept small relative to the
    # move-rate (≈1.0) and wall (−1.0) signal so learned movement still
    # dominates once real evidence accumulates.
    EXPLORATION_TRIES_WEIGHT = 0.15
    # Frontier-exploration weight. Active ONLY while no goal colour is
    # trusted yet (``goal_color is None`` -- the bootstrap regime before
    # any level advance has been credited to a colour). In that regime
    # the strategy has no meaningful goal direction, so instead of
    # fixating on a phantom default-colour centroid (the bug that pinned
    # every game at 0 levels: navigating into a non-matching lock that
    # acts as a wall, then oscillating), it drives toward the
    # least-visited learned next-state. This is what bootstraps the goal
    # detector: systematic coverage eventually triggers a level advance,
    # which credits the real goal colour, which flips the strategy out of
    # explore mode and into the goal-seeking machinery below. Sized to
    # dominate the optimistic move-rate prior (≈0.5-1.0) so the agent
    # actually fans out instead of repeating the first action that moved.
    # Once a goal colour is known the term switches off and goal-BFS /
    # goal-alignment lead, so behaviour with an explicit ``goal_color``
    # (e.g. unit tests, an operator-supplied colour) is unchanged.
    FRONTIER_WEIGHT = 1.5
    # Epsilon for epsilon-greedy exploration in the bootstrap regime
    # (``goal_color is None``). Fraction of steps that take a uniformly
    # random available action instead of the frontier-greedy pick, with
    # random tie-breaking on the greedy steps. Adds the trajectory
    # variety a deterministic walk lacks, which is what lets the agent
    # cover enough of a stochastic game to trip the first level advance.
    # Ignored once a goal colour is known (goal-seeking stays
    # deterministic).
    EXPLORATION_EPSILON = 0.25
    # PositiveResonanceAmplifier port. MCOP memory resonance (from
    # ``memory_summary['resonance']``, the stigmergy alignment score)
    # multiplies the goal-directional term by
    # ``1 + RESONANCE_AMPLIFY_WEIGHT * resonance`` so high-resonance
    # frames trust the learned goal shadow more while low-resonance
    # frames fall back to plain exploration. resonance == 0 reproduces
    # the pre-resonance ordering exactly. Note: the previous
    # implementation added ``−0.4 * resonance`` uniformly to every
    # candidate's sort key, which left the *ordering* unchanged — the
    # resonance signal was silently inert. This per-action form makes
    # it actually influence selection.
    RESONANCE_AMPLIFY_WEIGHT = 0.5
    # Resonance at or above this level is surfaced as a
    # ``positive_growth_event`` (logged at INFO and etched into
    # provenance) so post-run inspection can correlate high-resonance
    # steps with the action chosen.
    RESONANCE_EVENT_THRESHOLD = 0.25

    def __init__(
        self,
        fallback: Optional[Strategy] = None,
        # ``None`` means "no trusted goal colour yet -- explore until a
        # level advance reveals it" (the robust production default set by
        # run_arcagi3_agent). An explicit int trusts that colour as the
        # goal from step 0 (operator override / deterministic tests). The
        # class default stays GOAL_COLOR so callers that omit it keep the
        # historical goal-seeking behaviour.
        goal_color: Optional[int] = GOAL_COLOR,
        move_threshold_cells: int = MOVE_THRESHOLD_CELLS,
        move_threshold_centroid: float = MOVE_THRESHOLD_CENTROID,
        wobble_threshold_centroid: float = WOBBLE_THRESHOLD_CENTROID,
        complex_action_default: Tuple[int, int] = (32, 32),
        auto_discover_goal_color: bool = True,
        min_advances_for_discovery: int = 1,
        max_plan_depth: int = MAX_PLAN_DEPTH,
        # Player-colour auto-discovery (online, no offline data, no
        # per-game hardcoding). ``player_color=None`` means the
        # detector has the floor: until enough cross-action drift
        # observations exist, movement classification falls back to
        # the cell-count threshold. Pass an explicit value only for
        # offline determinism testing.
        player_color: Optional[int] = None,
        auto_discover_player_color: bool = True,
        min_observations_for_player_discovery: int = 4,
        min_actions_for_player_discovery: int = 2,
        min_variance_for_player_discovery: float = 0.5,
        # Goal-directional bias (the "holographic shadow biased toward
        # the goal" attraction term from the v2 spec). Score boost is
        # ``goal_alignment_weight`` * cosine(action mean drift, vector
        # from player centroid to goal centroid). Both vectors are
        # learned strictly online from observe() — no offline data,
        # no per-game hint about which axis any action moves on.
        # ``goal_alignment_weight=0.0`` disables the bias entirely.
        goal_alignment_weight: float = GOAL_ALIGNMENT_WEIGHT,
        min_action_observations_for_alignment: int = 1,  # lowered to engage goal alignment faster using repo MCOP patterns
        # Exploration / resonance shaping (see class-level constants).
        exploration_tries_weight: float = EXPLORATION_TRIES_WEIGHT,
        # Frontier-exploration weight, active only in the no-trusted-goal
        # bootstrap regime (``goal_color is None``). See FRONTIER_WEIGHT.
        frontier_weight: float = FRONTIER_WEIGHT,
        # Epsilon-greedy exploration in the bootstrap regime. See
        # EXPLORATION_EPSILON. ``exploration_seed`` seeds the PRNG used for
        # the random jumps / tie-breaks. Defaults to a FIXED seed (0) so a
        # fresh strategy replays identically given the same frame sequence
        # -- ARC Prize / repo determinism-and-replay compliance (a run is
        # reproducible and auditable). Pass a different int for a different
        # but still-reproducible trajectory; pass None only for a
        # deliberately nondeterministic run.
        exploration_epsilon: float = EXPLORATION_EPSILON,
        exploration_seed: Optional[int] = 0,
        resonance_amplify_weight: float = RESONANCE_AMPLIFY_WEIGHT,
        resonance_event_threshold: float = RESONANCE_EVENT_THRESHOLD,
        # Goal-BFS planner. Once at least
        # ``goal_bfs_min_action_drifts`` distinct actions have an
        # observed mean drift, plan a shortest-path through the
        # learned per-position wall map (also accumulated online
        # from observe()) up to ``goal_bfs_max_depth`` actions deep.
        # First action of the path overrides the score-based pick.
        # ``enable_goal_bfs=False`` restores PR #648 behaviour
        # exactly. ARC-compliant: nothing read from outside
        # observe(); both walls and drifts are learned in-game.
        enable_goal_bfs: bool = True,
        goal_bfs_max_depth: int = GOAL_BFS_MAX_DEPTH,
        goal_bfs_min_action_drifts: int = GOAL_BFS_MIN_ACTION_DRIFTS,
    ) -> None:
        if wobble_threshold_centroid > move_threshold_centroid:
            raise ValueError(
                "wobble_threshold_centroid must be <= move_threshold_centroid"
            )
        if goal_alignment_weight < 0:
            raise ValueError("goal_alignment_weight must be >= 0")
        if goal_bfs_max_depth < 0:
            raise ValueError("goal_bfs_max_depth must be >= 0")
        if goal_bfs_min_action_drifts < 1:
            raise ValueError("goal_bfs_min_action_drifts must be >= 1")
        if exploration_tries_weight < 0:
            raise ValueError("exploration_tries_weight must be >= 0")
        if frontier_weight < 0:
            raise ValueError("frontier_weight must be >= 0")
        if not 0.0 <= exploration_epsilon <= 1.0:
            raise ValueError("exploration_epsilon must be in [0, 1]")
        if resonance_amplify_weight < 0:
            raise ValueError("resonance_amplify_weight must be >= 0")
        self.fallback = fallback or RandomStrategy()
        self.goal_color = goal_color
        self.player_color = player_color
        self.move_threshold_cells = move_threshold_cells
        self.move_threshold_centroid = move_threshold_centroid
        self.wobble_threshold_centroid = wobble_threshold_centroid
        self._complex_default = complex_action_default
        self.auto_discover_goal_color = auto_discover_goal_color
        self.auto_discover_player_color = auto_discover_player_color
        self.goal_alignment_weight = goal_alignment_weight
        self.min_action_observations_for_alignment = (
            min_action_observations_for_alignment
        )
        self.exploration_tries_weight = exploration_tries_weight
        self.frontier_weight = frontier_weight
        self.exploration_epsilon = exploration_epsilon
        self._rng = random.Random(exploration_seed)
        self.resonance_amplify_weight = resonance_amplify_weight
        self.resonance_event_threshold = resonance_event_threshold
        # Click-sweep state for click-driven games (only ACTION6 / a
        # complex action available, no movable player). A fixed default
        # coordinate makes the agent click the same cell forever; instead
        # we lazily build a systematic sweep of candidate cells from the
        # first frame we need it on and advance through it on each complex
        # pick. See _next_click_target / _build_click_targets.
        self._click_targets: List[Tuple[int, int]] = []
        self._click_ptr = 0
        self.action_stats: Dict[str, Dict[str, float]] = {}
        # Per-action mean player-centroid drift, accumulated online
        # from observe(). action_drift_sums[name] = (sum_dr, sum_dc),
        # action_drift_counts[name] = n. Drift is meaningful only
        # after player_color is known; pre-discovery the cell-count
        # path runs and these stay empty.
        self.action_drift_sums: Dict[str, Tuple[float, float]] = {}
        self.action_drift_counts: Dict[str, int] = {}
        self.walls: Dict[Tuple[str, str], int] = {}
        # Per-position blocked-action map populated alongside
        # ``walls`` whenever a blocked_wobble is observed at a known
        # binned player position. The BFS planner consults this map
        # directly so it sees the same wall evidence as the scorer.
        # Stored separately (rather than re-derived from walls) so a
        # planner expansion is O(1) per (pos, action) lookup.
        self.position_walls: Dict[Tuple[int, int], set] = {}
        self.state_action_tries: Dict[Tuple[str, str], int] = {}
        self.state_visits: Dict[str, int] = {}
        self.enable_goal_bfs = enable_goal_bfs
        self.goal_bfs_max_depth = goal_bfs_max_depth
        self.goal_bfs_min_action_drifts = goal_bfs_min_action_drifts
        # ``_centroid_history`` tracks the *player* centroid post-
        # discovery (the entity that actually moves and oscillates);
        # pre-discovery it stays empty so oscillation detection waits
        # for a real signal instead of firing on the static goal.
        self._centroid_history: List[Tuple[float, float]] = []
        self._last_state_hash: Optional[str] = None
        self._last_player_centroid: Optional[Tuple[float, float]] = None
        self._loop_signatures_seen: set = set()
        self.provenance: List[Dict[str, Any]] = []
        self._goal_detector = _GoalColorDetector(
            min_advances=min_advances_for_discovery
        )
        self._player_detector = _PlayerColorDetector(
            min_observations=min_observations_for_player_discovery,
            min_actions=min_actions_for_player_discovery,
            min_variance=min_variance_for_player_discovery,
        )
        self._forward_model = _ForwardModel(max_plan_depth=max_plan_depth)
        self._max_plan_depth = max_plan_depth

    def _reset_state_dependent_caches(self) -> None:
        """Drop caches keyed on a state-hash component that just changed.

        Called when either :class:`_GoalColorDetector` flips
        ``goal_color`` or :class:`_PlayerColorDetector` flips
        ``player_color`` mid-episode. Previously stored state hashes
        (and the walls, visits, forward-model transitions, and
        centroid history they feed) are no longer comparable under
        the new keying, so we wipe them and let the strategy relearn
        from scratch under the better signal.
        """
        self.walls.clear()
        self.position_walls.clear()
        self.state_action_tries.clear()
        self.state_visits.clear()
        self._centroid_history.clear()
        self._loop_signatures_seen.clear()
        self._forward_model.reset()
        # Per-action mean drift was learned against the pre-flip
        # player centroid; under the new keying it no longer
        # describes the right entity. Wipe and relearn online.
        self.action_drift_sums.clear()
        self.action_drift_counts.clear()
        self._last_state_hash = None
        self._last_player_centroid = None

    # Back-compat alias: external code (and tests) may call the old
    # name. The behaviour is identical now that the cache also depends
    # on player_color.
    _reset_goal_dependent_state = _reset_state_dependent_caches

    def _goal_centroid(
        self, frame: Any
    ) -> Optional[Tuple[float, float]]:
        return self._color_centroid(frame, self.goal_color)

    def _player_centroid(
        self, frame: Any
    ) -> Optional[Tuple[float, float]]:
        if self.player_color is None:
            return None
        return self._color_centroid(frame, self.player_color)

    @staticmethod
    def _color_centroid(
        frame: Any, colour: Optional[int]
    ) -> Optional[Tuple[float, float]]:
        if colour is None:
            return None
        rs: List[int] = []
        cs: List[int] = []
        for layer in _grid_as_list(frame):
            for ri, row in enumerate(layer):
                for ci, val in enumerate(row):
                    if val == colour:
                        rs.append(ri)
                        cs.append(ci)
        if not rs:
            return None
        return (sum(rs) / len(rs), sum(cs) / len(cs))

    @staticmethod
    def _grid_fingerprint(frame: Any) -> List[List[List[int]]]:
        """Downsampled (~16x16 per layer) snapshot of the whole grid.

        Used as the bootstrap state key (no goal, no player yet). The
        stride collapses sub-cell jitter while preserving cell-level
        changes, so distinct play states hash distinctly without the key
        exploding on a 64x64 frame.
        """
        snapshot: List[List[List[int]]] = []
        for layer in _grid_as_list(frame):
            h = len(layer)
            w = len(layer[0]) if (layer and layer[0]) else 0
            if not h or not w:
                continue
            sr = max(1, h // 16)
            sc = max(1, w // 16)
            snapshot.append(
                [
                    [int(layer[r][c]) for c in range(0, w, sc)]
                    for r in range(0, h, sr)
                ]
            )
        return snapshot

    def _state_hash(self, frame: Any) -> str:
        # Goal-colour mask gives the strategy an invariant landmark
        # against which it can later bias planning, but it is the
        # *player position* that actually differentiates one game
        # state from the next: the goal almost always sits still
        # (e.g. ls20 keeps colour 8 pinned at row 61, col 59 across
        # every level) while the player moves cell-by-cell. Hashing
        # only the goal mask collapses every step into the same
        # key in goal-static games, which makes wall-learning grow
        # uniformly across all actions and produces a deterministic
        # ACTION1→4 cycle. Including the player centroid (binned to
        # integer cells, post-discovery) ensures walls accrue per
        # position so the strategy actually navigates.
        #
        # Pure-bootstrap exception: when there is no trusted goal colour
        # AND no player has been discovered yet, both components above are
        # degenerate -- the goal mask is all-zero (goal_color is None
        # matches nothing) and player_pos is None -- so every frame would
        # collapse to one key and the frontier term could not tell states
        # apart, stalling exploration before discovery ever fires. Key on
        # a downsampled snapshot of the whole grid instead, so any
        # meaningful change (the player sprite moving, a clicked cell
        # toggling) yields a distinct state and exploration can fan out.
        if self.goal_color is None and self.player_color is None:
            payload = json.dumps(
                {"snap": self._grid_fingerprint(frame)},
                default=_json_default,
            ).encode()
            return hashlib.sha256(payload).hexdigest()[:16]
        masked = [
            [
                [1 if v == self.goal_color else 0 for v in row]
                for row in layer
            ]
            for layer in _grid_as_list(frame)
        ]
        player_pos: Optional[Tuple[int, int]] = None
        if self.player_color is not None:
            cen = self._player_centroid(frame)
            if cen is not None:
                player_pos = (int(cen[0]), int(cen[1]))
        payload = json.dumps(
            {"goal_mask": masked, "player_pos": player_pos},
            default=_json_default,
        ).encode()
        # SHA-256 (not SHA-1) for state identification — the hash is a
        # non-cryptographic dedupe key (truncated to 16 hex chars), but
        # SHA-1 is flagged by CodeQL py/weak-cryptographic-algorithm and
        # SHA-256 is a drop-in replacement that satisfies the rule.
        return hashlib.sha256(payload).hexdigest()[:16]

    def _detect_oscillation(self) -> bool:
        if len(self._centroid_history) < self.HISTORY_WINDOW:
            return False
        recent = self._centroid_history[-self.HISTORY_WINDOW:]
        alternations = sum(
            1
            for i in range(2, len(recent))
            if recent[i] == recent[i - 2] and recent[i] != recent[i - 1]
        )
        return alternations >= self.OSCILLATION_REPEAT

    def _action_mean_drift(
        self, name: str
    ) -> Optional[Tuple[float, float]]:
        """Mean ``(dr, dc)`` drift of the player centroid for ``name``.

        Returns ``None`` until at least
        ``min_action_observations_for_alignment`` real-move
        transitions on this action have been observed; the early
        observations are noisy (single-step centroid drift can
        misclassify wobble) and would mislead the goal-alignment
        score.
        """
        n = self.action_drift_counts.get(name, 0)
        if n < self.min_action_observations_for_alignment:
            return None
        sums = self.action_drift_sums.get(name, (0.0, 0.0))
        return (sums[0] / n, sums[1] / n)

    def _goal_alignment(
        self,
        name: str,
        player_centroid: Optional[Tuple[float, float]],
        goal_centroid: Optional[Tuple[float, float]],
    ) -> float:
        """Cosine alignment between ``name``'s mean drift and the
        player→goal vector. Returns 0.0 (no bias either way) if
        any input is missing or either vector has zero magnitude.
        """
        if player_centroid is None or goal_centroid is None:
            return 0.0
        drift = self._action_mean_drift(name)
        if drift is None:
            return 0.0
        dgr = goal_centroid[0] - player_centroid[0]
        dgc = goal_centroid[1] - player_centroid[1]
        goal_mag = (dgr * dgr + dgc * dgc) ** 0.5
        drift_mag = (drift[0] * drift[0] + drift[1] * drift[1]) ** 0.5
        if goal_mag == 0.0 or drift_mag == 0.0:
            return 0.0
        return (drift[0] * dgr + drift[1] * dgc) / (drift_mag * goal_mag)

    def _score_action(
        self,
        name: str,
        state_hash: str,
        oscillating: bool,
        player_centroid: Optional[Tuple[float, float]] = None,
        goal_centroid: Optional[Tuple[float, float]] = None,
        resonance: float = 0.0,
    ) -> float:
        wall_hits = self.walls.get((state_hash, name), 0)
        stats = self.action_stats.get(name, {})
        n = stats.get("count", 0)
        moved = stats.get("moved_count", 0)
        avg_delta = (
            stats.get("total_centroid_delta", 0.0) / n if n > 0 else 0.0
        )
        # Optimistic prior for untried actions so the chooser explores
        # before settling on the first action that happened to move.
        move_rate = (moved / n) if n > 0 else 0.5
        score = move_rate + 0.1 * avg_delta - 1.0 * wall_hits
        # Goal-directional bias: pull the chooser toward actions whose
        # observed mean drift aligns with the player→goal direction.
        # Pure cosine ∈ [-1, 1]; weight is configurable. ARC-compliant:
        # both vectors are learned strictly online and the alignment
        # term degrades gracefully to 0 when either is unavailable.
        # MCOP memory resonance amplifies this positive signal
        # (PositiveResonanceAmplifier): at resonance r the contribution
        # scales by ``1 + resonance_amplify_weight * r`` so a confident
        # goal shadow is trusted more. resonance == 0 leaves the term
        # at its unamplified value, preserving prior behaviour.
        if self.goal_alignment_weight > 0:
            amplifier = 1.0 + self.resonance_amplify_weight * resonance
            score += (
                self.goal_alignment_weight
                * amplifier
                * self._goal_alignment(name, player_centroid, goal_centroid)
            )
        # Always-on novelty penalty: bias away from the most-tried action
        # at *this* state from the very first steps, before any ABAB
        # oscillation is detected. Small enough that a single learned
        # wall (−1.0) or a high move-rate still wins.
        tries_here = self.state_action_tries.get((state_hash, name), 0)
        score -= self.exploration_tries_weight * tries_here
        # Frontier exploration (bootstrap regime only). Until a goal
        # colour is trusted, bias toward the action whose learned
        # next-state has been visited least -- and maximally toward
        # actions whose next-state is still unknown (an unexplored
        # frontier). This is what lets the agent fan out and actually
        # cover the level instead of fixating; it is what bootstraps the
        # goal detector toward the first level advance. When the forward
        # model is empty every next-state is unknown, so the term is
        # uniform across actions and cannot change the ordering -- which
        # keeps explicit-goal callers (goal_color set, e.g. tests) and
        # early pre-learning steps on exactly their prior behaviour.
        if self.goal_color is None and self.frontier_weight > 0:
            nxt = self._forward_model.transitions.get((state_hash, name))
            frontier = (
                1.0
                if nxt is None
                else 1.0 / (1.0 + self.state_visits.get(nxt, 0))
            )
            score += self.frontier_weight * frontier
        if oscillating:
            # Stronger novelty seeking once an ABAB cycle is detected:
            # prefer the action we have tried least at this state even
            # when no wall has been registered yet. This breaks cycles
            # like (25,46)<->(25,48) where both alternating actions
            # register as "real_move" and so neither gets a wall penalty
            # under normal scoring.
            score -= 0.6 * tries_here + 0.5 * n
        return score

    def _goal_bfs(
        self,
        player_centroid: Optional[Tuple[float, float]],
        goal_centroid: Optional[Tuple[float, float]],
        available_action_names: List[str],
    ) -> Optional[str]:
        """BFS over the learned per-position wall map for a path to the goal.

        Returns the first action of the shortest path from the binned
        player position to the binned goal position, or ``None`` when:

        * planning is disabled, or
        * fewer than ``goal_bfs_min_action_drifts`` distinct actions
          have a learned mean drift (move model too sparse), or
        * either centroid is unavailable, or
        * no path exists within ``goal_bfs_max_depth`` actions.

        The move model is the per-action mean drift learned in
        observe(); walls come from ``position_walls`` which mirrors
        ``self.walls`` per binned player position. Both are
        accumulated strictly online — no offline data, no per-game
        knowledge.
        """
        if not self.enable_goal_bfs or self.goal_bfs_max_depth == 0:
            return None
        if player_centroid is None or goal_centroid is None:
            return None
        # Move table: action -> rounded-integer drift. Skip actions
        # without enough drift samples or whose mean drift rounds
        # to (0, 0) (e.g. a no-op button).
        moves: Dict[str, Tuple[int, int]] = {}
        for name in available_action_names:
            drift = self._action_mean_drift(name)
            if drift is None:
                continue
            dr = int(round(drift[0]))
            dc = int(round(drift[1]))
            if dr == 0 and dc == 0:
                continue
            moves[name] = (dr, dc)
        if len(moves) < self.goal_bfs_min_action_drifts:
            return None
        # Reach tolerance: half the largest single-step move so that
        # the BFS terminates when the planner can step onto a cell
        # that overlaps the goal centroid even with sub-cell error.
        max_step = max(abs(dr) + abs(dc) for dr, dc in moves.values())
        tol = max(1, max_step // 2)
        start = (int(player_centroid[0]), int(player_centroid[1]))
        goal = (int(goal_centroid[0]), int(goal_centroid[1]))
        if abs(start[0] - goal[0]) <= tol and abs(start[1] - goal[1]) <= tol:
            # Already at goal — let the score-based chooser act on
            # any local refinement (or the env will advance the
            # level on the next step).
            return None
        # Sort actions for deterministic exploration order so the
        # planner picks the same first action when multiple shortest
        # paths exist (matches the rest of the strategy's lex tiebreak).
        ordered = sorted(moves.items(), key=lambda kv: kv[0])
        # Standard BFS: queue holds (pos, first_action). We only need
        # the first action of the shortest path, so once a state is
        # reached we never need to revisit it.
        from collections import deque
        queue: "deque[Tuple[Tuple[int, int], str]]" = deque()
        visited: set = {start}
        for name, (dr, dc) in ordered:
            if name in self.position_walls.get(start, set()):
                continue
            nxt = (start[0] + dr, start[1] + dc)
            if (
                abs(nxt[0] - goal[0]) <= tol
                and abs(nxt[1] - goal[1]) <= tol
            ):
                return name
            if nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, name))
        depth = 1
        while queue and depth < self.goal_bfs_max_depth:
            level_size = len(queue)
            for _ in range(level_size):
                pos, first_action = queue.popleft()
                blocked_here = self.position_walls.get(pos, set())
                for name, (dr, dc) in ordered:
                    if name in blocked_here:
                        continue
                    nxt = (pos[0] + dr, pos[1] + dc)
                    if (
                        abs(nxt[0] - goal[0]) <= tol
                        and abs(nxt[1] - goal[1]) <= tol
                    ):
                        return first_action
                    if nxt not in visited:
                        visited.add(nxt)
                        queue.append((nxt, first_action))
            depth += 1
        return None

    def _build_click_targets(self, frame: Any) -> List[Tuple[int, int]]:
        """Systematic sweep of candidate click cells for a complex action.

        Returns ``(x, y)`` pairs (x = column, y = row) covering the grid
        on a coarse stride (~16x16), with non-background cells first so
        the interactive elements of a click-driven game are probed before
        empty floor. Returns ``[]`` for a featureless grid (no cell
        differs from the background), so the caller falls back to the
        configured ``complex_action_default`` -- this preserves the
        single-cell default behaviour when there is nothing to sweep.
        """
        grid = _grid_as_list(frame)
        layer = grid[0] if grid else []
        h = len(layer)
        w = len(layer[0]) if (layer and layer[0]) else 0
        if not h or not w:
            return []
        counts: Dict[int, int] = {}
        for row in layer:
            for v in row:
                counts[int(v)] = counts.get(int(v), 0) + 1
        if not counts:
            return []
        # Background = most common colour; ties broken by lowest index
        # for determinism.
        background = max(counts.items(), key=lambda kv: (kv[1], -kv[0]))[0]
        step = max(1, min(h, w) // 16)
        nonbg: List[Tuple[int, int]] = []
        bgcells: List[Tuple[int, int]] = []
        seen: set = set()
        for r in range(0, h, step):
            for c in range(0, w, step):
                key = (c, r)
                if key in seen:
                    continue
                seen.add(key)
                (nonbg if int(layer[r][c]) != background else bgcells).append(key)
        # Only sweep when the grid actually has features; a uniform grid
        # has nothing meaningful to click, so signal "use the default".
        return nonbg + bgcells if nonbg else []

    def _next_click_target(self, frame: Any) -> Tuple[int, int]:
        """Next ``(x, y)`` in the click sweep, cycling when exhausted.

        Falls back to ``complex_action_default`` when the grid has no
        sweepable features.
        """
        if not self._click_targets:
            self._click_targets = self._build_click_targets(frame)
        if not self._click_targets:
            return self._complex_default
        target = self._click_targets[self._click_ptr % len(self._click_targets)]
        self._click_ptr += 1
        return target

    def _action_data(self, name: str, frame: Any) -> Dict[str, Any]:
        """Payload for ``name``: a swept click target for complex actions
        (so click-driven games actually probe different cells), empty for
        simple directional actions."""
        if name not in COMPLEX_ACTIONS:
            return {}
        x, y = self._next_click_target(frame)
        return {"x": x, "y": y}

    def choose(
        self,
        frame: Any,
        tensor: Sequence[float],
        memory_summary: Dict[str, Any],
        available_action_names: List[str],
    ) -> Tuple[str, Dict[str, Any]]:
        if not available_action_names:
            return ("ACTION1", {})
        state_hash = self._state_hash(frame)
        self._last_state_hash = state_hash
        player_centroid = self._player_centroid(frame)
        goal_centroid = self._goal_centroid(frame)
        self._last_player_centroid = player_centroid
        self.state_visits[state_hash] = (
            self.state_visits.get(state_hash, 0) + 1
        )
        # Planner first: if the learned forward model knows a short path
        # from this state to a previously-observed level-advancing
        # state, take the first action of that path. Skips entirely if
        # planning is disabled (max_plan_depth == 0) or no terminal has
        # been seen yet, so early-game behaviour matches v1.
        if self._max_plan_depth > 0:
            planned = self._forward_model.plan(
                state_hash, available_action_names
            )
            if planned is not None:
                logger.info(
                    "holographic-shadow planner pick=%s (terminals=%d)",
                    planned,
                    len(self._forward_model.terminal_states),
                )
                return (planned, self._action_data(planned, frame))
        # Goal-BFS planner: shortest-path search through the learned
        # per-position wall map using the learned per-action drifts
        # as the move table. Only engages when both the player and
        # goal centroids are known and at least
        # ``goal_bfs_min_action_drifts`` actions have a learned drift.
        # Falls through to the score-based chooser when no path is
        # found within ``goal_bfs_max_depth`` so the strategy still
        # makes progress while accumulating wall evidence.
        bfs_pick = self._goal_bfs(
            player_centroid, goal_centroid, available_action_names
        )
        if bfs_pick is not None:
            logger.info(
                "holographic-shadow goal-BFS pick=%s "
                "(walls=%d positions=%d)",
                bfs_pick,
                len(self.walls),
                len(self.position_walls),
            )
            self.provenance.append(
                {
                    "type": "debug_goal_bfs",
                    "action": bfs_pick,
                    "player_pos": (
                        int(player_centroid[0]),  # type: ignore[index]
                        int(player_centroid[1]),  # type: ignore[index]
                    ),
                    "goal_pos": (
                        int(goal_centroid[0]),  # type: ignore[index]
                        int(goal_centroid[1]),  # type: ignore[index]
                    ),
                    "walls_known": len(self.walls),
                    "positions_with_walls": len(self.position_walls),
                }
            )
            return (bfs_pick, self._action_data(bfs_pick, frame))
        oscillating = self._detect_oscillation()
        resonance = (
            float(memory_summary.get("resonance", 0.0))
            if memory_summary
            else 0.0
        )
        # Score every candidate once (resonance now amplifies the
        # per-action goal-alignment term inside _score_action rather
        # than being added uniformly to every key, where it could not
        # affect the ordering). Caching the scores lets us log the
        # winning pick alongside the runner-up breakdown below.
        action_scores = {
            name: self._score_action(
                name,
                state_hash,
                oscillating,
                player_centroid,
                goal_centroid,
                resonance,
            )
            for name in available_action_names
        }
        # Highest score wins; lexical action name breaks ties so the
        # pick stays deterministic across runs (goal-seeking regime).
        scored = sorted(
            available_action_names,
            key=lambda n: (-action_scores[n], n),
        )
        if self.goal_color is None:
            # Bootstrap regime: stochastic exploration. A purely
            # deterministic explorer commits to a single trajectory, so
            # on these (stochastic) games it under-covers relative to a
            # noisy random walk -- which matters because completing a
            # level here is largely a coverage/variety game until the
            # goal colour is discovered. Epsilon-greedy over the frontier
            # score gives both: mostly frontier-directed, occasionally a
            # random jump, with random tie-breaking among equal-score
            # actions. Driven by ``self._rng`` (seeded from
            # ``exploration_seed``, default fixed) so the trajectory is
            # reproducible -- a fresh strategy replays identically on the
            # same frames, satisfying the determinism/replay compliance
            # requirement while still exploring within a run.
            if self._rng.random() < self.exploration_epsilon:
                chosen = self._rng.choice(available_action_names)
            else:
                best = action_scores[scored[0]]
                top = [
                    n for n in available_action_names
                    if action_scores[n] >= best - 1e-9
                ]
                chosen = self._rng.choice(top)
        else:
            chosen = scored[0]
        # Explicit observability for the previously-silent resonance and
        # exploration score modifiers: emit one concise line per
        # score-based pick so their effect is visible in run traces.
        tries_at_state = self.state_action_tries.get((state_hash, chosen), 0)
        logger.info(
            "holographic-shadow score pick=%s score=%.3f resonance=%.3f "
            "oscillating=%s tries@state=%d runners-up=%s",
            chosen,
            action_scores[chosen],
            resonance,
            oscillating,
            tries_at_state,
            {n: round(action_scores[n], 3) for n in scored[1:4]},
        )
        # Surface a PositiveGrowthEvent when the frame carries strong
        # MCOP resonance, so high-signal steps can be correlated with
        # the action taken during post-run analysis.
        if resonance >= self.resonance_event_threshold:
            logger.info(
                "holographic-shadow PositiveGrowthEvent resonance=%.3f "
                "pick=%s score=%.3f",
                resonance,
                chosen,
                action_scores[chosen],
            )
            self.provenance.append(
                {
                    "type": "positive_growth_event",
                    "resonance": round(resonance, 4),
                    "pick": chosen,
                    "score": round(action_scores[chosen], 4),
                    "state_hash": state_hash,
                }
            )
        data = self._action_data(chosen, frame)
        if oscillating:
            logger.info(
                "holographic-shadow oscillation detected; novelty pick=%s",
                chosen,
            )
            # Etch a debug entry the first time a given oscillation
            # signature is seen, so post-mortem inspection of
            # ``provenance`` shows exactly which centroid pattern
            # triggered the novelty pick. Re-triggers are suppressed
            # to keep the trace readable.
            recent_centroids = tuple(
                self._centroid_history[-self.HISTORY_WINDOW:]
            )
            signature = (state_hash, recent_centroids)
            if signature not in self._loop_signatures_seen:
                self._loop_signatures_seen.add(signature)
                self.provenance.append(
                    {
                        "type": "debug_loop_detected",
                        "state_hash": state_hash,
                        "centroid_window": [
                            [round(r, 3), round(c, 3)]
                            for r, c in recent_centroids
                        ],
                        "novelty_pick": chosen,
                        "available": list(available_action_names),
                    }
                )
        return (chosen, data)

    def observe(
        self,
        prev_frame: Any,
        action_name: str,
        next_frame: Any,
    ) -> None:
        if prev_frame is None or next_frame is None:
            return
        # Colour-detector observations first, since updating either
        # ``goal_color`` or ``player_color`` invalidates every cache
        # keyed on the old mask / position. Re-keying ahead of the
        # rest of observe() ensures the wall/visit/forward-model
        # entries this call writes use the new keying consistently.
        self._goal_detector.observe(prev_frame, next_frame)
        self._player_detector.observe(prev_frame, action_name, next_frame)
        if self.auto_discover_goal_color:
            discovered = self._goal_detector.current()
            if discovered is not None and discovered != self.goal_color:
                logger.info(
                    "holographic-shadow goal-colour discovered: %s -> %d "
                    "(advances=%d); resetting state-dependent caches",
                    self.goal_color,  # may be None (no trusted goal yet)
                    discovered,
                    self._goal_detector.advances_seen,
                )
                self.goal_color = discovered
                self._reset_state_dependent_caches()
        if self.auto_discover_player_color:
            discovered_player = self._player_detector.current()
            if (
                discovered_player is not None
                and discovered_player != self.player_color
            ):
                logger.info(
                    "holographic-shadow player-colour discovered: %s -> %d "
                    "(observations=%d); resetting state-dependent caches",
                    self.player_color,
                    discovered_player,
                    self._player_detector.observations_seen,
                )
                self.player_color = discovered_player
                self._reset_state_dependent_caches()
        diff = _frame_diff(prev_frame, next_frame)
        # Movement classification is keyed on the *player* centroid
        # (the entity that actually moves), not the goal centroid.
        # Tracking the goal here was a regression: in goal-static
        # games (e.g. ls20, where colour 8 sits pinned at one corner
        # across every level) every step would read centroid_delta=0
        # and the strategy would treat every action as a wall.
        prev_centroid = self._last_player_centroid
        curr_centroid = self._player_centroid(next_frame)
        centroid_delta = 0.0
        centroid_available = (
            prev_centroid is not None and curr_centroid is not None
        )
        if centroid_available:
            centroid_delta = math.hypot(
                curr_centroid[0] - prev_centroid[0],
                curr_centroid[1] - prev_centroid[1],
            )

        # Three-way classification keyed on player-centroid drift
        # when both centroids are available; otherwise fall back to
        # the cell-count threshold so the bootstrap window before
        # auto-discovery still classifies deterministically.
        # ``ambiguous_drift`` means the player moved within the
        # dead-zone between ``wobble_threshold_centroid`` (truly
        # blocked) and ``move_threshold_centroid`` (real movement)
        # — neither the move-rate nor the wall counter is updated,
        # so sub-cell sprite jitter no longer reads as either
        # progress or a wall.
        if centroid_available:
            if centroid_delta > self.move_threshold_centroid:
                outcome = "real_move"
            elif centroid_delta < self.wobble_threshold_centroid:
                outcome = "blocked_wobble"
            else:
                outcome = "ambiguous_drift"
        else:
            outcome = (
                "real_move"
                if diff["n_changed"] >= self.move_threshold_cells
                else "blocked_wobble"
            )
        moved = outcome == "real_move"
        blocked = outcome == "blocked_wobble"

        stats = self.action_stats.setdefault(
            action_name,
            {"count": 0.0, "moved_count": 0.0, "total_centroid_delta": 0.0},
        )
        stats["count"] += 1
        if moved:
            stats["moved_count"] += 1
        stats["total_centroid_delta"] += centroid_delta

        # Per-action mean drift vector for goal-directional bias.
        # Only accumulate on real_move transitions where both
        # centroids were available — wobble and ambiguous-drift
        # observations carry too much noise (sub-cell sprite jitter)
        # to be a useful "where does this action move me" signal.
        if (
            self.goal_alignment_weight > 0
            and centroid_available
            and moved
            and prev_centroid is not None
            and curr_centroid is not None
        ):
            dr = curr_centroid[0] - prev_centroid[0]
            dc = curr_centroid[1] - prev_centroid[1]
            sums = self.action_drift_sums.get(action_name, (0.0, 0.0))
            self.action_drift_sums[action_name] = (
                sums[0] + dr,
                sums[1] + dc,
            )
            self.action_drift_counts[action_name] = (
                self.action_drift_counts.get(action_name, 0) + 1
            )

        # Track every (state, action) try so the oscillation-novelty
        # picker can prefer the least-tried action even when no wall
        # has yet been learned for the current state.
        if self._last_state_hash is not None:
            tries_key = (self._last_state_hash, action_name)
            self.state_action_tries[tries_key] = (
                self.state_action_tries.get(tries_key, 0) + 1
            )

        # Wall learning is gated on ``blocked`` rather than ``not
        # moved`` so the ambiguous dead-zone never increments walls.
        wall_first_hit = False
        if blocked and self._last_state_hash is not None:
            key = (self._last_state_hash, action_name)
            existing = self.walls.get(key, 0)
            wall_first_hit = existing == 0
            self.walls[key] = existing + 1
            # Mirror the wall into the per-position planner map so
            # the BFS expansion sees the same blocked transitions
            # that the scorer penalises. Keyed on the binned player
            # centroid at the time the action was taken (i.e. the
            # ``prev_centroid`` from this observation).
            if prev_centroid is not None:
                pos = (int(prev_centroid[0]), int(prev_centroid[1]))
                self.position_walls.setdefault(pos, set()).add(
                    action_name
                )

        if curr_centroid is not None:
            self._centroid_history.append(curr_centroid)
            cap = 4 * self.HISTORY_WINDOW
            if len(self._centroid_history) > cap:
                self._centroid_history = self._centroid_history[-cap:]

        wall_hits = self.walls.get(
            (self._last_state_hash or "", action_name), 0
        )
        self.provenance.append(
            {
                "type": outcome,
                "action": action_name,
                "n_changed": diff["n_changed"],
                "player_centroid_delta": round(centroid_delta, 3),
                "wall_hits": wall_hits,
                "levels_delta": diff["levels_delta"],
            }
        )

        # Emit a dedicated debug etch the first time a given (state,
        # action) is registered as a wall, so reviewers can correlate
        # wall-learning decisions with the centroid drift that
        # triggered them without scanning every observe() record.
        if wall_first_hit and self._last_state_hash is not None:
            self.provenance.append(
                {
                    "type": "debug_wall_learning",
                    "action": action_name,
                    "state_hash": self._last_state_hash,
                    "player_centroid_delta": round(centroid_delta, 3),
                    "n_changed": diff["n_changed"],
                    "wobble_threshold_centroid": (
                        self.wobble_threshold_centroid
                    ),
                }
            )

        # Record the transition in the learned forward model. Use the
        # post-discovery goal_color for both endpoints so the planner's
        # graph is internally consistent.
        if self._last_state_hash is not None and self._max_plan_depth > 0:
            next_state_hash = self._state_hash(next_frame)
            self._forward_model.add_transition(
                self._last_state_hash,
                action_name,
                next_state_hash,
                diff["levels_delta"],
            )


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
    encoder_dims: int = field(
        default_factory=lambda: _positive_int_env(
            "MCOP_ENCODER_DIMS", LOW_MEMORY_ENCODER_DIMS
        )
    )
    stigmergy: StigmergyStore = field(default_factory=_low_memory_stigmergy_store)
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
            try:
                arcade.close_scorecard(scorecard_id)
            except Exception:  # pragma: no cover -- best-effort cleanup
                pass
            raise RuntimeError(f"Arcade.make returned None for {game_id!r}")

        frame: Optional[Any] = None
        interrupted = False
        # Stuck-detector watches the (action, levels) stream for period-2 /
        # period-3 cycles with no level progress -- the failure mode where
        # Grok bounces between "ACTION3, ACTION1, ACTION3, ACTION1, ..."
        # without solving the puzzle. Without this an 80-action cancellation
        # window can be wasted entirely before anyone notices.
        stuck = _StuckDetector()
        try:
            frame = env.reset()
            recent: List[str] = []
            recent_levels: List[int] = []
            for step in range(self.max_actions):
                if frame is None:
                    logger.warning("Null frame at step %d; stopping", step)
                    break

                tensor = nova_neo_encode(
                    _frame_to_features(frame),
                    self.encoder_dims,
                    normalize=True,
                )
                resonance = self.stigmergy.get_resonance(tensor)
                memory_summary = {
                    "resonance": resonance.score,
                    # `recent_levels` is paired index-wise with `recent`
                    # downstream so each action shows its post-step level
                    # in the prompt -- giving Grok the visibility it
                    # needs to detect "I keep picking the same two
                    # actions and levels stays at 0".
                    "recent": recent[-8:],
                    "recent_levels": recent_levels[-8:],
                }
                # GameAction is a compound enum keyed by (int, action_class)
                # tuples, so GameAction(int_value) raises ValueError. Resolve
                # via a value->member scan instead.
                value_to_member = {m.value: m for m in GameAction}
                allowed = [
                    value_to_member[code].name
                    for code in (frame.available_actions or [])
                    if code in value_to_member
                    and value_to_member[code].name != "RESET"
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
                recent_levels.append(levels)
                # One INFO line per step so the action sequence + level
                # counter are both visible in real-time, without needing to
                # parse the eventual `result.json` to learn whether the
                # agent ever advanced. The format is intentionally
                # grep-friendly: `play(<game>) step <i>/<MAX>: <ACTION>
                # levels=<k> state=<STATE>[ data=<dict>]`.
                data_repr = f" data={action_data}" if action_data else ""
                logger.info(
                    "play(%s) step %d/%d: %s levels=%d state=%s%s",
                    game_id,
                    step + 1,
                    self.max_actions,
                    action_name,
                    levels,
                    state_name,
                    data_repr,
                )
                stuck_msg = stuck.observe(action_name, levels)
                if stuck_msg is not None:
                    logger.warning(
                        "play(%s) appears stuck: %s",
                        game_id,
                        stuck_msg,
                    )
                frame = next_frame

                if next_frame is None:
                    break
                if next_frame.state == GameState.WIN:
                    break
                if next_frame.state == GameState.GAME_OVER:
                    # Level reset only -- competition rules forbid full reset.
                    frame = env.reset()
        except KeyboardInterrupt:
            # Triggered both by Ctrl-C and by the SIGTERM-to-KeyboardInterrupt
            # bridge installed by run_arcagi3_agent.main(). The whole point of
            # this branch is that GitHub Actions cancellations and xAI capacity
            # drops used to lose every step we'd taken; now we flush whatever
            # we have so the workflow's `result.json` artefact still answers
            # "what action sequence did the agent run?".
            interrupted = True
            logger.warning(
                "play(%s) interrupted at step %d/%d; flushing partial result",
                game_id,
                len(result.steps),
                self.max_actions,
            )
        finally:
            if frame is not None:
                try:
                    result.final_state = (
                        frame.state.value if frame.state else "UNKNOWN"
                    )
                    result.levels_completed = frame.levels_completed
                    result.win_levels = frame.win_levels
                except Exception as exc:  # pragma: no cover -- defensive
                    logger.warning(
                        "could not snapshot frame on play() exit: %s", exc
                    )
            if interrupted:
                # Overwrites whatever transient state the env was in --
                # callers should be able to grep for INTERRUPTED to spot
                # cancelled runs without parsing logs.
                result.final_state = "INTERRUPTED"

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
