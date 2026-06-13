"""arc_agi2 — a dependency-free ARC-AGI-2 baseline for ARC Prize 2026.

The package is intentionally pure standard-library Python so it imports and
runs unchanged inside an offline Kaggle code-competition kernel. The public
surface mirrors a competition workflow:

    >>> from arc_agi2 import load_tasks, build_submission, write_submission
    >>> tasks = load_tasks("arc-agi_test_challenges.json")
    >>> sub = build_submission(tasks)
    >>> write_submission(sub, "submission.json", tasks)

See ``arc_prize_2026/README.md`` for the full setup and Kaggle constraints.
"""

from __future__ import annotations

from .grid import Grid
from .scoring import ScoreReport, score_submission
from .solve import TestPrediction, predict_task
from .solvers import DEFAULT_SOLVERS
from .submission import (
    build_submission,
    validate_submission,
    write_submission,
)
from .task import Pair, Task, load_tasks, parse_challenges

__version__ = "0.1.0"

__all__ = [
    "Grid",
    "Pair",
    "Task",
    "load_tasks",
    "parse_challenges",
    "predict_task",
    "TestPrediction",
    "DEFAULT_SOLVERS",
    "build_submission",
    "validate_submission",
    "write_submission",
    "score_submission",
    "ScoreReport",
    "__version__",
]
