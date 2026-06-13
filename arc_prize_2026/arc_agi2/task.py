"""Loading and representing ARC-AGI-2 tasks.

The competition ships two JSON files per split:

``*_challenges.json``
    ``{task_id: {"train": [{"input": grid, "output": grid}, ...],
                 "test":  [{"input": grid}, ...]}}``

``*_solutions.json`` (train/eval only; absent for the hidden test set)
    ``{task_id: [output_grid, ...]}`` — one ground-truth output per
    test input, in the same order.

These dataclasses wrap that structure so solvers and the scorer can pass
typed objects around instead of nested dicts.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from .grid import Grid, is_grid


@dataclass(frozen=True)
class Pair:
    """A single train demonstration: an input grid and its output grid."""

    input: Grid
    output: Grid


@dataclass
class Task:
    """One ARC task: a handful of train pairs and one or more test inputs.

    ``test_outputs`` holds the ground truth when known (train/eval
    splits) and ``None`` for the hidden test set.
    """

    task_id: str
    train: List[Pair]
    test_inputs: List[Grid]
    test_outputs: Optional[List[Grid]] = None

    @property
    def num_test(self) -> int:
        return len(self.test_inputs)


def _coerce_grid(obj: object, where: str) -> Grid:
    if not is_grid(obj):
        raise ValueError(f"malformed grid at {where}")
    return obj  # type: ignore[return-value]


def parse_challenges(
    challenges: Dict[str, dict],
    solutions: Optional[Dict[str, List[Grid]]] = None,
) -> Dict[str, Task]:
    """Turn raw challenge/solution dicts into ``{task_id: Task}``.

    ``solutions`` is optional; when provided its keys must match
    ``challenges`` and each entry must have one output per test input.
    """
    tasks: Dict[str, Task] = {}
    for task_id, payload in challenges.items():
        train = [
            Pair(
                _coerce_grid(p["input"], f"{task_id}.train.input"),
                _coerce_grid(p["output"], f"{task_id}.train.output"),
            )
            for p in payload["train"]
        ]
        test_inputs = [
            _coerce_grid(p["input"], f"{task_id}.test[{i}].input")
            for i, p in enumerate(payload["test"])
        ]
        test_outputs: Optional[List[Grid]] = None
        if solutions is not None and task_id in solutions:
            test_outputs = [
                _coerce_grid(g, f"{task_id}.solution[{i}]")
                for i, g in enumerate(solutions[task_id])
            ]
            if len(test_outputs) != len(test_inputs):
                raise ValueError(
                    f"{task_id}: {len(test_outputs)} solutions for "
                    f"{len(test_inputs)} test inputs"
                )
        tasks[task_id] = Task(task_id, train, test_inputs, test_outputs)
    return tasks


def load_tasks(
    challenges_path: str | Path,
    solutions_path: Optional[str | Path] = None,
) -> Dict[str, Task]:
    """Load tasks from challenge (and optional solution) JSON files on disk."""
    challenges = json.loads(Path(challenges_path).read_text())
    solutions = None
    if solutions_path is not None:
        solutions = json.loads(Path(solutions_path).read_text())
    return parse_challenges(challenges, solutions)
