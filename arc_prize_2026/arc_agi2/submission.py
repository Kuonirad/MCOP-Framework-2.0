"""Build and validate ``submission.json``.

The competition is strict about format:

* every ``task_id`` in the challenges file must appear in the submission;
* each task maps to a list with one entry per test input, **in order**;
* each entry has both ``attempt_1`` and ``attempt_2`` populated with a grid.

A submission that violates any of these scores zero (or errors), so we
validate before writing and again on read.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Mapping, Sequence

from .grid import is_grid
from .solve import TestPrediction, predict_task
from .solvers import DEFAULT_SOLVERS
from .solvers.base import Solver
from .task import Task

Submission = Dict[str, List[Dict[str, list]]]


def build_submission(
    tasks: Mapping[str, Task],
    solvers: Sequence[Solver] = DEFAULT_SOLVERS,
) -> Submission:
    """Run the solver pipeline over ``tasks`` and assemble a submission dict."""
    submission: Submission = {}
    for task_id, task in tasks.items():
        preds: List[TestPrediction] = predict_task(task, solvers)
        submission[task_id] = [
            {"attempt_1": p.attempt_1, "attempt_2": p.attempt_2} for p in preds
        ]
    return submission


def validate_submission(submission: Submission, tasks: Mapping[str, Task]) -> None:
    """Raise :class:`ValueError` if ``submission`` is not a legal entry.

    Checks task-id coverage, per-task test count, the presence of both
    attempts, and that every attempt is a well-formed grid.
    """
    missing = set(tasks) - set(submission)
    if missing:
        raise ValueError(f"submission missing {len(missing)} task ids, e.g. {sorted(missing)[:3]}")
    extra = set(submission) - set(tasks)
    if extra:
        raise ValueError(f"submission has unknown task ids: {sorted(extra)[:3]}")

    for task_id, task in tasks.items():
        entries = submission[task_id]
        if not isinstance(entries, list) or len(entries) != task.num_test:
            raise ValueError(
                f"{task_id}: expected {task.num_test} predictions, got "
                f"{len(entries) if isinstance(entries, list) else type(entries)}"
            )
        for i, entry in enumerate(entries):
            for key in ("attempt_1", "attempt_2"):
                if key not in entry:
                    raise ValueError(f"{task_id}[{i}] missing {key}")
                if not is_grid(entry[key]):
                    raise ValueError(f"{task_id}[{i}].{key} is not a valid grid")


def write_submission(
    submission: Submission,
    path: str | Path = "submission.json",
    tasks: Mapping[str, Task] | None = None,
) -> Path:
    """Validate (if ``tasks`` given) and write ``submission`` to ``path``."""
    if tasks is not None:
        validate_submission(submission, tasks)
    out = Path(path)
    out.write_text(json.dumps(submission))
    return out
