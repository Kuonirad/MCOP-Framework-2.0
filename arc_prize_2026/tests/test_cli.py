import json

from arc_agi2.cli import main
from arc_agi2.submission import validate_submission
from arc_agi2.task import load_tasks


def _write_json(path, payload):
    path.write_text(json.dumps(payload))
    return path


def _sample_files(tmp_path):
    challenges = {
        "identity": {
            "train": [{"input": [[1, 2]], "output": [[1, 2]]}],
            "test": [{"input": [[3, 4]]}],
        },
        "rotate": {
            "train": [{"input": [[1, 2], [3, 4]], "output": [[3, 1], [4, 2]]}],
            "test": [{"input": [[5, 6], [7, 8]]}],
        },
    }
    solutions = {
        "identity": [[[3, 4]]],
        "rotate": [[[7, 5], [8, 6]]],
    }
    return (
        _write_json(tmp_path / "sample_challenges.json", challenges),
        _write_json(tmp_path / "sample_solutions.json", solutions),
    )


def test_solve_command_writes_a_valid_submission(tmp_path, capsys):
    challenges_path, _ = _sample_files(tmp_path)
    out_path = tmp_path / "submission.json"

    assert main(["solve", "--challenges", str(challenges_path), "--out", str(out_path)]) == 0

    captured = capsys.readouterr()
    assert f"wrote {out_path}" in captured.out
    submission = json.loads(out_path.read_text())
    tasks = load_tasks(challenges_path)
    validate_submission(submission, tasks)
    assert set(submission) == {"identity", "rotate"}


def test_score_command_scores_against_known_solutions(tmp_path, capsys):
    challenges_path, solutions_path = _sample_files(tmp_path)

    assert (
        main(
            [
                "score",
                "--challenges",
                str(challenges_path),
                "--solutions",
                str(solutions_path),
            ]
        )
        == 0
    )

    captured = capsys.readouterr()
    assert "score=1.0000" in captured.out
    assert "(2/2 outputs, 2/2 tasks fully solved)" in captured.out
