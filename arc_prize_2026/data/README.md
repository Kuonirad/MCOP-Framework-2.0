# Data directory

Place the ARC Prize 2026 competition files here. They are **gitignored** (see
`.gitignore` in this directory) so the dataset is never committed.

Download from the competition's *Data* tab. Expected files:

| File | Contents |
| --- | --- |
| `arc-agi_training_challenges.json` | train tasks (with outputs) |
| `arc-agi_training_solutions.json` | train ground-truth outputs |
| `arc-agi_evaluation_challenges.json` | public eval tasks |
| `arc-agi_evaluation_solutions.json` | public eval ground-truth outputs |
| `arc-agi_test_challenges.json` | hidden test inputs (no solutions) |

### Challenges format

```json
{
  "<task_id>": {
    "train": [{"input": [[...]], "output": [[...]]}, ...],
    "test":  [{"input": [[...]]}, ...]
  }
}
```

### Solutions format (train/eval only)

```json
{ "<task_id>": [ [[...]], ... ] }
```

One output grid per test input, in the same order as `test`.

A tiny synthetic `sample_challenges.json` / `sample_solutions.json` is committed
here so the CLI and notebook work out of the box before you download the real
data.
