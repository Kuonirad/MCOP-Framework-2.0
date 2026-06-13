"""Turn fitted solvers into two ranked predictions per test input.

The competition lets us submit two attempts per test output and scores the
better of the two. So the job here is to produce, for every test input, an
ordered list of distinct candidate grids and keep the top two — falling
back to safe guesses when no rule fits, because *every* task id must appear
in the submission with both attempts populated.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

from . import grid as G
from .grid import Grid
from .solvers import DEFAULT_SOLVERS
from .solvers.base import Predictor, Solver
from .task import Task


@dataclass
class TestPrediction:
    """The two attempts submitted for a single test input."""

    attempt_1: Grid
    attempt_2: Grid


def candidate_grids(task: Task, test_input: Grid, solvers: Sequence[Solver]) -> List[Grid]:
    """Ordered, de-duplicated candidate outputs for one test input.

    Solvers are fitted in priority order; each fitting solver contributes
    one prediction. Identical grids are collapsed so the two attempts we
    eventually pick are genuinely different guesses.
    """
    seen: List[Grid] = []
    for solver in solvers:
        predictor = _safe_fit(solver, task)
        if predictor is None:
            continue
        try:
            out = predictor(test_input)
        except Exception:
            # A rule that fit the demos can still blow up on an oddly shaped
            # test input; never let one bad solver sink the whole submission.
            continue
        if G.is_grid(out) and out not in seen:
            seen.append(out)
    return seen


def _safe_fit(solver: Solver, task: Task) -> Predictor | None:
    try:
        return solver.fit(task)
    except Exception:
        return None


def _fallbacks(test_input: Grid) -> List[Grid]:
    """Cheap distinct guesses used when solvers produce fewer than two."""
    guesses = [
        G.copy_grid(test_input),          # the input unchanged is a strong prior
        G.rotate180(test_input),
        G.flip_h(test_input),
        G.tile(test_input, 1, 1),
    ]
    out: List[Grid] = []
    for g in guesses:
        if g not in out:
            out.append(g)
    return out


def predict_task(task: Task, solvers: Sequence[Solver] = DEFAULT_SOLVERS) -> List[TestPrediction]:
    """Predict two attempts for every test input of ``task``."""
    predictions: List[TestPrediction] = []
    for test_input in task.test_inputs:
        candidates = candidate_grids(task, test_input, solvers)
        candidates = candidates + [g for g in _fallbacks(test_input) if g not in candidates]
        # candidates is guaranteed non-empty: _fallbacks always yields the input.
        attempt_1 = candidates[0]
        attempt_2 = candidates[1] if len(candidates) > 1 else G.copy_grid(attempt_1)
        predictions.append(TestPrediction(attempt_1, attempt_2))
    return predictions
