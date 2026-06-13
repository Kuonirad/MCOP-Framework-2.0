"""The official ARC-AGI-2 scoring metric.

From the competition rules: for each task test output, you make two
attempts; you score 1 for that output if *either* attempt matches the
ground truth exactly, else 0. The final score is the mean of the per-output
scores across all test outputs (so a task with two test inputs contributes
two equally weighted outputs).

This module lets you score a submission locally against the
``*_solutions.json`` of the train/eval splits before burning a Kaggle
submission slot.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .submission import Submission
from .task import Task


@dataclass
class ScoreReport:
    """Aggregate score plus the raw counts used to compute it."""

    correct_outputs: int
    total_outputs: int
    solved_tasks: int
    total_tasks: int

    @property
    def score(self) -> float:
        """Mean per-output score in ``[0, 1]`` — the leaderboard metric."""
        return self.correct_outputs / self.total_outputs if self.total_outputs else 0.0

    def __str__(self) -> str:
        return (
            f"score={self.score:.4f} "
            f"({self.correct_outputs}/{self.total_outputs} outputs, "
            f"{self.solved_tasks}/{self.total_tasks} tasks fully solved)"
        )


def score_submission(submission: Submission, tasks: Mapping[str, Task]) -> ScoreReport:
    """Score ``submission`` against tasks that carry ground-truth outputs.

    Tasks whose ``test_outputs`` are unknown (the hidden test set) are
    skipped. Raises :class:`ValueError` if no task has ground truth.
    """
    correct = 0
    total = 0
    solved = 0
    scored_tasks = 0
    for task_id, task in tasks.items():
        if task.test_outputs is None:
            continue
        scored_tasks += 1
        entries = submission.get(task_id, [])
        task_correct = 0
        for i, truth in enumerate(task.test_outputs):
            total += 1
            entry = entries[i] if i < len(entries) else {}
            if truth in (entry.get("attempt_1"), entry.get("attempt_2")):
                correct += 1
                task_correct += 1
        if task_correct == len(task.test_outputs):
            solved += 1
    if scored_tasks == 0:
        raise ValueError("no tasks with ground-truth outputs to score against")
    return ScoreReport(correct, total, solved, scored_tasks)
