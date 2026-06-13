"""Concrete rule-based solvers.

Each solver follows the same shape: derive candidate parameters from the
*first* train pair, then accept only if those parameters reproduce **every**
train output exactly. This "explain-all-demonstrations" gate is what makes a
rule trustworthy enough to apply to the unseen test input — a rule that
fits 2 of 3 demos is almost always the wrong rule for ARC.
"""

from __future__ import annotations

from typing import Dict, Optional

from .. import grid as G
from ..grid import Grid
from ..task import Task
from .base import Predictor


def _explains_all(task: Task, predictor: Predictor) -> bool:
    """Return ``True`` iff ``predictor`` reproduces every train output."""
    return all(predictor(p.input) == p.output for p in task.train)


class IdentitySolver:
    """Output equals input."""

    name = "identity"

    def fit(self, task: Task) -> Optional[Predictor]:
        predictor: Predictor = G.copy_grid
        return predictor if _explains_all(task, predictor) else None


class DihedralSolver:
    """A single fixed dihedral transform (rotation/flip) maps input to output."""

    name = "dihedral"

    def fit(self, task: Task) -> Optional[Predictor]:
        for tname, transform in G.DIHEDRAL.items():
            if tname == "identity":
                continue  # IdentitySolver owns this case.
            if _explains_all(task, transform):
                return transform
        return None


class ColorMapSolver:
    """A consistent colour-to-colour relabelling, with grid shape unchanged."""

    name = "color_map"

    def fit(self, task: Task) -> Optional[Predictor]:
        mapping: Dict[int, int] = {}
        for pair in task.train:
            if G.dims(pair.input) != G.dims(pair.output):
                return None
            for in_row, out_row in zip(pair.input, pair.output):
                for src, dst in zip(in_row, out_row):
                    if mapping.setdefault(src, dst) != dst:
                        return None  # same colour mapped two ways → no rule
        if all(src == dst for src, dst in mapping.items()):
            return None  # pure identity; let IdentitySolver claim it
        frozen = dict(mapping)
        return lambda g: G.replace_colors(g, frozen)


class ScaleSolver:
    """Output is the input upscaled by integer factors (each cell becomes a block)."""

    name = "scale"

    def fit(self, task: Task) -> Optional[Predictor]:
        ih, iw = G.dims(task.train[0].input)
        oh, ow = G.dims(task.train[0].output)
        if ih == 0 or iw == 0 or oh % ih or ow % iw:
            return None
        ky, kx = oh // ih, ow // iw
        if ky < 1 or kx < 1 or (ky == 1 and kx == 1):
            return None
        predictor: Predictor = lambda g: G.scale(g, ky, kx)
        return predictor if _explains_all(task, predictor) else None


class TileSolver:
    """Output is the input repeated as a grid of unmodified copies."""

    name = "tile"

    def fit(self, task: Task) -> Optional[Predictor]:
        ih, iw = G.dims(task.train[0].input)
        oh, ow = G.dims(task.train[0].output)
        if ih == 0 or iw == 0 or oh % ih or ow % iw:
            return None
        ry, rx = oh // ih, ow // iw
        if ry < 1 or rx < 1 or (ry == 1 and rx == 1):
            return None
        predictor: Predictor = lambda g: G.tile(g, ry, rx)
        return predictor if _explains_all(task, predictor) else None


class SymmetricTileSolver:
    """Output is an ``m x n`` mosaic of dihedral variants of the input.

    Generalises plain tiling and mirror-tiling: each block position gets
    its own fixed dihedral transform, provided one transform is consistent
    across all train pairs for that position. Captures the very common ARC
    "reflect into the next quadrant" family.
    """

    name = "symmetric_tile"

    def fit(self, task: Task) -> Optional[Predictor]:
        ih, iw = G.dims(task.train[0].input)
        oh, ow = G.dims(task.train[0].output)
        if ih == 0 or iw == 0 or oh % ih or ow % iw:
            return None
        m, n = oh // ih, ow // iw
        if m * n <= 1:
            return None
        # Square-preserving dihedral transforms keep (h, w); the diagonal
        # ones swap the axes, so they only fit square inputs.
        block_transform: Dict[tuple, str] = {}
        for bi in range(m):
            for bj in range(n):
                chosen: Optional[str] = None
                for tname, transform in G.DIHEDRAL.items():
                    if self._block_matches(task, transform, bi, bj, ih, iw):
                        chosen = tname
                        break
                if chosen is None:
                    return None
                block_transform[(bi, bj)] = chosen

        frozen = dict(block_transform)

        def predict(g: Grid) -> Grid:
            h, w = G.dims(g)
            out = [[0] * (w * n) for _ in range(h * m)]
            for (bi, bj), tname in frozen.items():
                block = G.DIHEDRAL[tname](g)
                if G.dims(block) != (h, w):
                    # Diagonal transform on a non-square block: skip safely.
                    block = g
                for r in range(h):
                    for c in range(w):
                        out[bi * h + r][bj * w + c] = block[r][c]
            return out

        return predict if _explains_all(task, predict) else None

    @staticmethod
    def _block_matches(task: Task, transform, bi, bj, ih, iw) -> bool:
        for pair in task.train:
            h, w = G.dims(pair.input)
            block = transform(pair.input)
            if G.dims(block) != (h, w):
                return False
            for r in range(h):
                for c in range(w):
                    if pair.output[bi * h + r][bj * w + c] != block[r][c]:
                        return False
        return True


class CropToContentSolver:
    """Output is the input cropped to the bounding box of its foreground."""

    name = "crop_to_content"

    def fit(self, task: Task) -> Optional[Predictor]:
        def predict(g: Grid) -> Grid:
            return G.crop_to_content(g, G.background_color(g))

        try:
            if _explains_all(task, predict):
                return predict
        except ValueError:
            return None
        return None


class ConstantOutputSolver:
    """Every train output is the same grid; predict it regardless of input.

    Low precedence — it ignores the test input entirely, so it is only a
    sensible guess when the demonstrations are genuinely constant.
    """

    name = "constant_output"

    def fit(self, task: Task) -> Optional[Predictor]:
        first = task.train[0].output
        if not all(p.output == first for p in task.train):
            return None
        frozen = G.copy_grid(first)
        return lambda _g: G.copy_grid(frozen)
