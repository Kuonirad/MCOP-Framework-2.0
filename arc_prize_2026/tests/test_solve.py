from arc_agi2 import grid as G
from arc_agi2.solve import candidate_grids, predict_task
from arc_agi2.solvers import DEFAULT_SOLVERS
from tests.helpers import make_task


def test_predict_task_always_two_attempts():
    # A task no rule explains still yields two populated attempts.
    task = make_task("weird", [([[1]], [[2, 3], [4, 5]])], [[[7]]])
    preds = predict_task(task)
    assert len(preds) == 1
    assert G.is_grid(preds[0].attempt_1)
    assert G.is_grid(preds[0].attempt_2)


def test_predict_task_uses_fitting_solver():
    base = [[1, 2], [3, 4]]
    task = make_task("rot", [(base, G.rotate90(base))], [[[5, 6], [7, 8]]])
    preds = predict_task(task)
    assert preds[0].attempt_1 == G.rotate90([[5, 6], [7, 8]])


def test_multiple_test_inputs_predicted_in_order():
    task = make_task(
        "multi",
        [([[1, 2]], [[1, 2]])],          # identity
        [[[3, 4]], [[5, 6]]],
    )
    preds = predict_task(task)
    assert len(preds) == 2
    assert preds[0].attempt_1 == [[3, 4]]
    assert preds[1].attempt_1 == [[5, 6]]


def test_candidate_grids_are_deduplicated():
    task = make_task("id", [([[1, 2]], [[1, 2]])], [[[9, 9]]])
    cands = candidate_grids(task, [[9, 9]], DEFAULT_SOLVERS)
    # No duplicates among candidates.
    assert all(cands.count(c) == 1 for c in cands)
