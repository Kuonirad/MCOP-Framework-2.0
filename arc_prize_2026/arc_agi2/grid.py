"""Pure-Python grid primitives for ARC-AGI-2.

A *grid* is a rectangular ``list[list[int]]`` of integer colours in
``0..9`` — exactly the representation used by the ARC-AGI task JSON. The
whole module is deliberately dependency-free (no NumPy) so it imports and
runs inside an offline Kaggle kernel with nothing pre-installed.

Every transform is *pure*: it returns a fresh grid and never mutates its
argument. Functions raise :class:`ValueError` on malformed input rather
than silently producing a ragged grid, because a ragged prediction is
rejected by the competition scorer.
"""

from __future__ import annotations

from collections import Counter
from typing import Dict, List, Tuple

Grid = List[List[int]]


def is_grid(obj: object) -> bool:
    """Return ``True`` iff ``obj`` is a well-formed, non-empty grid.

    Well-formed means: a non-empty list of equal-length non-empty rows
    whose every cell is an ``int`` in ``0..9``.
    """
    if not isinstance(obj, list) or not obj:
        return False
    if not all(isinstance(row, list) and row for row in obj):
        return False
    width = len(obj[0])
    for row in obj:
        if len(row) != width:
            return False
        for cell in row:
            # bool is a subclass of int; reject it explicitly.
            if isinstance(cell, bool) or not isinstance(cell, int):
                return False
            if cell < 0 or cell > 9:
                return False
    return True


def dims(grid: Grid) -> Tuple[int, int]:
    """Return ``(height, width)`` of ``grid``."""
    return len(grid), len(grid[0])


def copy_grid(grid: Grid) -> Grid:
    """Return a deep copy of ``grid``."""
    return [list(row) for row in grid]


def equal(a: Grid, b: Grid) -> bool:
    """Return ``True`` iff ``a`` and ``b`` are element-wise identical."""
    return a == b


# --- Dihedral group (the 8 symmetries of a rectangle) ---------------------

def rotate90(grid: Grid) -> Grid:
    """Rotate 90 degrees clockwise."""
    return [list(row) for row in zip(*grid[::-1])]


def rotate180(grid: Grid) -> Grid:
    return [row[::-1] for row in grid[::-1]]


def rotate270(grid: Grid) -> Grid:
    """Rotate 90 degrees counter-clockwise."""
    return [list(row) for row in zip(*grid)][::-1]


def flip_h(grid: Grid) -> Grid:
    """Mirror left-right (flip across the vertical axis)."""
    return [row[::-1] for row in grid]


def flip_v(grid: Grid) -> Grid:
    """Mirror top-bottom (flip across the horizontal axis)."""
    return grid[::-1]


def transpose(grid: Grid) -> Grid:
    """Reflect across the main diagonal."""
    return [list(row) for row in zip(*grid)]


def anti_transpose(grid: Grid) -> Grid:
    """Reflect across the anti-diagonal."""
    return rotate180(transpose(grid))


#: The dihedral group D4 keyed by a stable name, used by symmetry solvers.
DIHEDRAL: Dict[str, "Transform"] = {
    "identity": lambda g: copy_grid(g),
    "rotate90": rotate90,
    "rotate180": rotate180,
    "rotate270": rotate270,
    "flip_h": flip_h,
    "flip_v": flip_v,
    "transpose": transpose,
    "anti_transpose": anti_transpose,
}


# --- Scaling / tiling ------------------------------------------------------

def scale(grid: Grid, ky: int, kx: int) -> Grid:
    """Nearest-neighbour upscale by integer factors ``ky`` (rows), ``kx`` (cols)."""
    if ky < 1 or kx < 1:
        raise ValueError(f"scale factors must be >= 1, got ({ky}, {kx})")
    out: Grid = []
    for row in grid:
        new_row: List[int] = []
        for cell in row:
            new_row.extend([cell] * kx)
        for _ in range(ky):
            out.append(list(new_row))
    return out


def tile(grid: Grid, ry: int, rx: int) -> Grid:
    """Repeat ``grid`` ``ry`` times vertically and ``rx`` times horizontally."""
    if ry < 1 or rx < 1:
        raise ValueError(f"tile counts must be >= 1, got ({ry}, {rx})")
    wide = [row * rx for row in grid]
    return [list(row) for _ in range(ry) for row in wide]


# --- Colour utilities ------------------------------------------------------

def color_counts(grid: Grid) -> Counter:
    """Return a :class:`collections.Counter` of colour frequencies."""
    counter: Counter = Counter()
    for row in grid:
        counter.update(row)
    return counter


def palette(grid: Grid) -> set:
    """Return the set of distinct colours present in ``grid``."""
    return {cell for row in grid for cell in row}


def background_color(grid: Grid) -> int:
    """Guess the background colour as the most common colour.

    ARC tasks conventionally use ``0`` (black) for background, but many
    do not, so we fall back to frequency. Ties resolve to the smaller
    colour index for determinism.
    """
    counts = color_counts(grid)
    most = counts.most_common()
    top = max(c for _, c in most)
    return min(color for color, c in most if c == top)


def replace_colors(grid: Grid, mapping: Dict[int, int]) -> Grid:
    """Return ``grid`` with each colour remapped via ``mapping`` (identity default)."""
    return [[mapping.get(cell, cell) for cell in row] for row in grid]


# --- Cropping --------------------------------------------------------------

def content_bbox(grid: Grid, background: int) -> Tuple[int, int, int, int]:
    """Return ``(top, left, bottom, right)`` bounds of non-background cells.

    Bounds are inclusive. Raises :class:`ValueError` when the grid is
    entirely background (there is nothing to crop to).
    """
    rows = [r for r, row in enumerate(grid) if any(c != background for c in row)]
    cols = [c for c in range(len(grid[0]))
            if any(grid[r][c] != background for r in range(len(grid)))]
    if not rows or not cols:
        raise ValueError("grid is entirely background; no content bbox")
    return rows[0], cols[0], rows[-1], cols[-1]


def crop(grid: Grid, top: int, left: int, bottom: int, right: int) -> Grid:
    """Return the inclusive sub-grid ``[top..bottom] x [left..right]``."""
    return [row[left:right + 1] for row in grid[top:bottom + 1]]


def crop_to_content(grid: Grid, background: int) -> Grid:
    """Crop ``grid`` to the bounding box of its non-background cells."""
    top, left, bottom, right = content_bbox(grid, background)
    return crop(grid, top, left, bottom, right)


# Forward reference for the type used in DIHEDRAL above.
from typing import Callable  # noqa: E402

Transform = Callable[[Grid], Grid]
