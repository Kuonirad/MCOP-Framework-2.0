# ARC Prize 2026 — ARC-AGI-2 workspace

Scaffolding for our entry to the [ARC Prize 2026 (ARC-AGI-2)](https://kaggle.com/competitions/arc-prize-2026-arc-agi-2)
Kaggle code competition. The goal of ARC-AGI-2 is *novel reasoning*: given a
handful of input→output grid demonstrations, predict the output grid for unseen
test inputs. Submissions are scored on exact-match accuracy, best-of-two
attempts per test output.

This directory contains a small, **dependency-free** Python package
(`arc_agi2`) that turns a challenges file into a valid `submission.json`, plus a
Kaggle notebook and a local scorer. It is a transparent rule-based *baseline* —
a foundation to extend, not a finished solver.

## Why this design

ARC-AGI-2 is a Kaggle **code competition**: solutions run as notebooks with
**no internet access**, a **12-hour** runtime limit, and must emit a file named
`submission.json`. To stay portable into that locked-down kernel, the solver
core uses **only the Python standard library** (no NumPy, no pip installs).
Grids are plain `list[list[int]]`, exactly the task JSON representation.

## Layout

```
arc_prize_2026/
├── arc_agi2/                 # the package (pure stdlib)
│   ├── grid.py               # grid primitives: rotate/flip/scale/tile/crop/recolor
│   ├── task.py               # load + parse challenges/solutions JSON into Task objects
│   ├── solve.py              # rank candidate predictions → two attempts per test input
│   ├── submission.py         # build + validate + write submission.json
│   ├── scoring.py            # the official best-of-two metric, for local evaluation
│   ├── cli.py                # `python -m arc_agi2 solve|score`
│   └── solvers/              # the rule library (extend me!)
│       ├── base.py           # Solver protocol
│       └── primitives.py     # identity, dihedral, color-map, scale, tile, symmetry, crop, constant
├── notebooks/
│   └── arc_prize_2026_submission.ipynb   # the Kaggle submission notebook
├── tests/                    # pytest suite (run locally; not needed on Kaggle)
└── data/                     # put competition JSON here (real data is gitignored)
```

## Local usage

```bash
# from arc_prize_2026/
# Generate a submission from a challenges file
python -m arc_agi2 solve --challenges data/arc-agi_evaluation_challenges.json --out submission.json

# Measure the baseline locally against the matching solutions (best-of-two metric)
python -m arc_agi2 score \
    --challenges data/arc-agi_evaluation_challenges.json \
    --solutions  data/arc-agi_evaluation_solutions.json
```

A tiny synthetic example ships in `data/sample_challenges.json` /
`data/sample_solutions.json` so the commands above work before you download the
real data.

### As a library

```python
from arc_agi2 import load_tasks, build_submission, write_submission, score_submission

tasks = load_tasks("data/arc-agi_evaluation_challenges.json",
                   "data/arc-agi_evaluation_solutions.json")
submission = build_submission(tasks)
print(score_submission(submission, tasks))      # local score
write_submission(submission, "submission.json", tasks=tasks)   # validated write
```

## Submitting on Kaggle

1. Upload the `arc_agi2/` package directory as a Kaggle **Dataset** (suggested
   name `arc-agi2-baseline`). No internet means the package must be attached,
   not pip-installed.
2. Open `notebooks/arc_prize_2026_submission.ipynb` as a new notebook, attach
   the competition data **and** the package dataset, and **disable internet**.
3. Run all cells. The notebook locates the package and the
   `*_test_challenges.json` file automatically, then writes `submission.json`.
4. Commit the notebook and hit **Submit to Competition**.

## Extending the baseline

Add a class under `arc_agi2/solvers/` that implements the `Solver` protocol:
inspect `task.train`, and return a `Predictor` (a `Grid -> Grid` function)
**only if it reproduces every train output exactly** — otherwise return `None`.
Register it in `arc_agi2/solvers/__init__.py::DEFAULT_SOLVERS`, ordered so more
specific rules come first. The `solve` pipeline collects each fitting solver's
prediction, de-duplicates, and keeps the top two as `attempt_1`/`attempt_2`,
filling from safe fallbacks when fewer than two rules fire.

## Tests

```bash
pip install pytest          # dev only; not needed on Kaggle
python -m pytest arc_prize_2026
```
