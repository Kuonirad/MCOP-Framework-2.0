"""Command-line entry point: generate and score ARC-AGI-2 submissions.

Examples
--------
Generate a submission from a challenges file::

    python -m arc_agi2 solve \\
        --challenges arc-agi_evaluation_challenges.json \\
        --out submission.json

Score it locally against the matching solutions file::

    python -m arc_agi2 score \\
        --challenges arc-agi_evaluation_challenges.json \\
        --solutions arc-agi_evaluation_solutions.json
"""

from __future__ import annotations

import argparse
import sys
from typing import Optional, Sequence

from .scoring import score_submission
from .submission import build_submission, write_submission
from .task import load_tasks


def _cmd_solve(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.challenges)
    submission = build_submission(tasks)
    path = write_submission(submission, args.out, tasks=tasks)
    print(f"wrote {path} ({len(submission)} tasks)")
    return 0


def _cmd_score(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.challenges, args.solutions)
    submission = build_submission(tasks)
    report = score_submission(submission, tasks)
    print(report)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="arc_agi2", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_solve = sub.add_parser("solve", help="generate submission.json")
    p_solve.add_argument("--challenges", required=True, help="path to *_challenges.json")
    p_solve.add_argument("--out", default="submission.json", help="output path")
    p_solve.set_defaults(func=_cmd_solve)

    p_score = sub.add_parser("score", help="score the baseline against known solutions")
    p_score.add_argument("--challenges", required=True, help="path to *_challenges.json")
    p_score.add_argument("--solutions", required=True, help="path to *_solutions.json")
    p_score.set_defaults(func=_cmd_score)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
