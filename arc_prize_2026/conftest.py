"""Make ``arc_agi2`` importable when running pytest from anywhere.

The package lives at ``arc_prize_2026/arc_agi2`` and ships without an
installable distribution (it is meant to be vendored into a Kaggle kernel),
so we put its parent directory on ``sys.path`` for the test session.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
