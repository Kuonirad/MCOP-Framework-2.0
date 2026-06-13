import json

import pytest

from arc_agi2 import grid as G
from arc_agi2.scoring import score_submission
from arc_agi2.submission import (
    build_submission,
    validate_submission,
    write_submission,
)
from arc_agi2.task import parse_challenges
from tests.helpers import make_task


def _identity_tasks():
    return {
        "t1": make_task("t1", [([[1, 2]], [[1, 2]])], [[[3, 4]]], test_outputs=[[[3, 4]]]),
        "t2": make_task(
            "t2",
            [([[5]], [[5]])],
            [[[6]], [[7]]],
            test_outputs=[[[6]], [[7]]],
        ),
    }


def test_build_and_validate_submission():
    tasks = _identity_tasks()
    sub = build_submission(tasks)
    validate_submission(sub, tasks)  # should not raise
    assert set(sub) == set(tasks)
    assert len(sub["t2"]) == 2  # one entry per test input


def test_validate_catches_missing_task():
    tasks = _identity_tasks()
    sub = build_submission(tasks)
    del sub["t1"]
    with pytest.raises(ValueError, match="missing"):
        validate_submission(sub, tasks)


def test_validate_catches_wrong_count():
    tasks = _identity_tasks()
    sub = build_submission(tasks)
    sub["t2"] = sub["t2"][:1]  # drop a required prediction
    with pytest.raises(ValueError, match="expected 2 predictions"):
        validate_submission(sub, tasks)


def test_validate_catches_bad_grid():
    tasks = _identity_tasks()
    sub = build_submission(tasks)
    sub["t1"][0]["attempt_1"] = [[1, 2], [3]]  # ragged
    with pytest.raises(ValueError, match="not a valid grid"):
        validate_submission(sub, tasks)


def test_write_submission_roundtrip(tmp_path):
    tasks = _identity_tasks()
    sub = build_submission(tasks)
    path = write_submission(sub, tmp_path / "submission.json", tasks=tasks)
    reloaded = json.loads(path.read_text())
    assert reloaded == sub


def test_scoring_perfect_identity():
    tasks = _identity_tasks()
    sub = build_submission(tasks)
    report = score_submission(sub, tasks)
    assert report.score == 1.0
    assert report.total_outputs == 3  # 1 + 2 test outputs
    assert report.solved_tasks == 2


def test_scoring_counts_best_of_two():
    task = make_task("x", [([[1]], [[1]])], [[[2]]], test_outputs=[[[2]]])
    tasks = {"x": task}
    # attempt_1 wrong, attempt_2 right → still scores.
    sub = {"x": [{"attempt_1": [[9]], "attempt_2": [[2]]}]}
    report = score_submission(sub, tasks)
    assert report.score == 1.0


def test_parse_challenges_with_solutions():
    challenges = {
        "a": {
            "train": [{"input": [[1]], "output": [[2]]}],
            "test": [{"input": [[3]]}],
        }
    }
    solutions = {"a": [[[4]]]}
    tasks = parse_challenges(challenges, solutions)
    assert tasks["a"].test_outputs == [[[4]]]
    assert tasks["a"].num_test == 1
