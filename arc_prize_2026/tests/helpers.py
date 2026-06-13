"""Small builders for synthetic ARC tasks used across the test suite."""

from __future__ import annotations

from typing import List, Optional

from arc_agi2.grid import Grid
from arc_agi2.task import Pair, Task


def make_task(
    task_id: str,
    train: List[tuple],
    test_inputs: List[Grid],
    test_outputs: Optional[List[Grid]] = None,
) -> Task:
    """Build a :class:`Task` from ``(input, output)`` train tuples."""
    return Task(
        task_id=task_id,
        train=[Pair(i, o) for i, o in train],
        test_inputs=test_inputs,
        test_outputs=test_outputs,
    )
