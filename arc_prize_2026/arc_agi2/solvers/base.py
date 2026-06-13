"""Solver protocol shared by every concrete solver."""

from __future__ import annotations

from typing import Callable, Optional, Protocol, runtime_checkable

from ..grid import Grid
from ..task import Task

#: Maps a single test input grid to a predicted output grid.
Predictor = Callable[[Grid], Grid]


@runtime_checkable
class Solver(Protocol):
    """A rule that may explain a task's train demonstrations.

    Implementations set :attr:`name` and implement :meth:`fit`. ``fit``
    returns a :data:`Predictor` when the rule reproduces every train
    output exactly, otherwise ``None``.
    """

    name: str

    def fit(self, task: Task) -> Optional[Predictor]:
        ...
