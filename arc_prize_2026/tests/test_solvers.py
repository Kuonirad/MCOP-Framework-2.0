from arc_agi2 import grid as G
from arc_agi2.solvers.primitives import (
    ColorMapSolver,
    ConstantOutputSolver,
    CropToContentSolver,
    DihedralSolver,
    IdentitySolver,
    ScaleSolver,
    SymmetricTileSolver,
    TileSolver,
)
from tests.helpers import make_task


def test_identity_solver():
    task = make_task("id", [([[1, 2]], [[1, 2]]), ([[3, 4]], [[3, 4]])], [[[5, 6]]])
    predictor = IdentitySolver().fit(task)
    assert predictor is not None
    assert predictor([[5, 6]]) == [[5, 6]]


def test_dihedral_solver_rotate90():
    pairs = [([[1, 2], [3, 4]], G.rotate90([[1, 2], [3, 4]])),
             ([[5, 6], [7, 8]], G.rotate90([[5, 6], [7, 8]]))]
    task = make_task("rot", pairs, [[[9, 0], [1, 2]]])
    predictor = DihedralSolver().fit(task)
    assert predictor is not None
    assert predictor([[9, 0], [1, 2]]) == G.rotate90([[9, 0], [1, 2]])


def test_dihedral_solver_rejects_identity():
    # Asymmetric grid: only the identity transform reproduces it, so the
    # dihedral solver (which excludes identity) must decline.
    task = make_task("id", [([[1, 2], [3, 4]], [[1, 2], [3, 4]])], [[[5, 6], [7, 8]]])
    assert DihedralSolver().fit(task) is None


def test_color_map_solver():
    pairs = [([[1, 2], [2, 1]], [[3, 4], [4, 3]]),
             ([[1, 1], [2, 2]], [[3, 3], [4, 4]])]
    task = make_task("cmap", pairs, [[[2, 1]]])
    predictor = ColorMapSolver().fit(task)
    assert predictor is not None
    assert predictor([[2, 1]]) == [[4, 3]]


def test_color_map_rejects_inconsistent():
    pairs = [([[1]], [[2]]), ([[1]], [[3]])]  # colour 1 maps two ways
    task = make_task("bad", pairs, [[[1]]])
    assert ColorMapSolver().fit(task) is None


def test_scale_solver():
    base = [[1, 2], [3, 4]]
    pairs = [(base, G.scale(base, 2, 2))]
    task = make_task("scale", pairs, [[[5, 6], [7, 8]]])
    predictor = ScaleSolver().fit(task)
    assert predictor is not None
    assert predictor([[5, 6], [7, 8]]) == G.scale([[5, 6], [7, 8]], 2, 2)


def test_tile_solver():
    base = [[1, 2]]
    pairs = [(base, G.tile(base, 2, 3))]
    task = make_task("tile", pairs, [[[7, 8]]])
    predictor = TileSolver().fit(task)
    assert predictor is not None
    assert predictor([[7, 8]]) == G.tile([[7, 8]], 2, 3)


def test_symmetric_tile_mirror():
    # Output is a 1x2 mosaic: left = input, right = horizontal mirror.
    def build(g):
        return [row + row[::-1] for row in g]

    pairs = [([[1, 2], [3, 4]], build([[1, 2], [3, 4]])),
             ([[5, 6], [7, 8]], build([[5, 6], [7, 8]]))]
    task = make_task("mirror", pairs, [[[9, 0], [1, 2]]])
    predictor = SymmetricTileSolver().fit(task)
    assert predictor is not None
    assert predictor([[9, 0], [1, 2]]) == build([[9, 0], [1, 2]])


def test_crop_to_content_solver():
    def framed(inner):
        return [[0, 0, 0, 0]] + [[0] + row + [0] for row in inner] + [[0, 0, 0, 0]]

    pairs = [(framed([[1, 2], [3, 4]]), [[1, 2], [3, 4]]),
             (framed([[5, 6], [7, 8]]), [[5, 6], [7, 8]])]
    task = make_task("crop", pairs, [framed([[9, 1], [2, 3]])])
    predictor = CropToContentSolver().fit(task)
    assert predictor is not None
    assert predictor(framed([[9, 1], [2, 3]])) == [[9, 1], [2, 3]]


def test_constant_output_solver():
    const = [[7, 7], [7, 7]]
    pairs = [([[1, 2]], const), ([[3, 4], [5, 6]], const)]
    task = make_task("const", pairs, [[[9]]])
    predictor = ConstantOutputSolver().fit(task)
    assert predictor is not None
    assert predictor([[9]]) == const
