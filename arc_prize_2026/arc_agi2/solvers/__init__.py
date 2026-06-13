"""Solver library for ARC-AGI-2.

A *solver* inspects a task's train pairs and, if it can explain **all** of
them with one consistent rule, returns a :data:`Predictor` — a function
mapping a test input grid to a predicted output grid. Solvers that cannot
explain the demonstrations return ``None`` and contribute nothing.

This package-level module exposes :data:`DEFAULT_SOLVERS`, an ordered list
used by :mod:`arc_agi2.solve`. Order matters only as a tie-break: more
specific / higher-precision rules come first.
"""

from __future__ import annotations

from .base import Predictor, Solver
from .primitives import (
    ColorMapSolver,
    ConstantOutputSolver,
    CropToContentSolver,
    DihedralSolver,
    IdentitySolver,
    ScaleSolver,
    SymmetricTileSolver,
    TileSolver,
)

#: Ordered so the most constrained rules are preferred on ties.
DEFAULT_SOLVERS = [
    IdentitySolver(),
    DihedralSolver(),
    ColorMapSolver(),
    ScaleSolver(),
    TileSolver(),
    SymmetricTileSolver(),
    CropToContentSolver(),
    ConstantOutputSolver(),
]

__all__ = [
    "Predictor",
    "Solver",
    "DEFAULT_SOLVERS",
    "IdentitySolver",
    "DihedralSolver",
    "ColorMapSolver",
    "ScaleSolver",
    "TileSolver",
    "SymmetricTileSolver",
    "CropToContentSolver",
    "ConstantOutputSolver",
]
