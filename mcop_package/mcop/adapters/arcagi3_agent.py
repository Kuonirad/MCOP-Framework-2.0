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
LOW_MEMORY_MAX_TRACES = 256


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
