import pytest

from arc_agi2 import grid as G


def test_is_grid_accepts_well_formed():
    assert G.is_grid([[0, 1], [2, 3]])
    assert G.is_grid([[5]])


@pytest.mark.parametrize("bad", [
    [],                       # empty
    [[]],                     # empty row
    [[1, 2], [3]],            # ragged
    [[1, 2], [3, 10]],        # colour out of range
    [[1, 2], [3, -1]],        # negative
    [[1, True]],              # bool sneaking in as int
    "not a grid",
    [[1.0, 2.0]],             # floats
])
def test_is_grid_rejects_malformed(bad):
    assert not G.is_grid(bad)


def test_dihedral_round_trips():
    g = [[1, 2, 3], [4, 5, 6]]
    assert G.rotate90(G.rotate270(g)) == g
    assert G.rotate180(G.rotate180(g)) == g
    assert G.flip_h(G.flip_h(g)) == g
    assert G.flip_v(G.flip_v(g)) == g
    assert G.transpose(G.transpose(g)) == g


def test_rotate90_known_value():
    assert G.rotate90([[1, 2], [3, 4]]) == [[3, 1], [4, 2]]


def test_scale_and_tile():
    g = [[1, 2]]
    assert G.scale(g, 2, 3) == [[1, 1, 1, 2, 2, 2], [1, 1, 1, 2, 2, 2]]
    assert G.tile(g, 2, 2) == [[1, 2, 1, 2], [1, 2, 1, 2]]


def test_scale_rejects_bad_factor():
    with pytest.raises(ValueError):
        G.scale([[1]], 0, 1)


def test_color_helpers():
    g = [[0, 0, 1], [0, 2, 2]]
    assert G.background_color(g) == 0
    assert G.palette(g) == {0, 1, 2}
    assert G.replace_colors(g, {0: 9}) == [[9, 9, 1], [9, 2, 2]]


def test_crop_to_content():
    g = [
        [0, 0, 0, 0],
        [0, 3, 4, 0],
        [0, 5, 6, 0],
        [0, 0, 0, 0],
    ]
    assert G.crop_to_content(g, 0) == [[3, 4], [5, 6]]


def test_crop_to_content_all_background_raises():
    with pytest.raises(ValueError):
        G.crop_to_content([[0, 0], [0, 0]], 0)
