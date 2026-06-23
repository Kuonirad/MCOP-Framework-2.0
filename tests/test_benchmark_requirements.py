import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_REQUIREMENTS = REPO_ROOT / "examples" / "reproducible-benchmark" / "requirements.txt"
BENCHMARK_LOCK = REPO_ROOT / "examples" / "reproducible-benchmark" / "requirements.lock.txt"
PATCHED_JUPYTERLAB = (4, 5, 9)
REQUIREMENT_RE = re.compile(
    r"^\s*(?P<name>[A-Za-z0-9_.-]+)\s*(?P<op>==|>=)\s*(?P<version>\d+(?:\.\d+)*)\b"
)


def parse_requirements(path: Path) -> dict[str, list[tuple[str, tuple[int, ...]]]]:
    requirements: dict[str, list[tuple[str, tuple[int, ...]]]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "--")):
            continue
        match = REQUIREMENT_RE.match(stripped.rstrip("\\").strip())
        if not match:
            continue
        name = match.group("name").lower().replace("_", "-")
        version = tuple(int(part) for part in match.group("version").split("."))
        requirements.setdefault(name, []).append((match.group("op"), version))
    return requirements


class BenchmarkRequirementsTests(unittest.TestCase):
    def test_direct_requirements_keep_jupyterlab_at_or_above_patched_floor(self):
        requirements = parse_requirements(BENCHMARK_REQUIREMENTS)

        self.assertIn("jupyterlab", requirements)
        self.assertEqual(len(requirements["jupyterlab"]), 1)
        operator, version = requirements["jupyterlab"][0]
        self.assertIn(operator, (">=", "=="))
        self.assertGreaterEqual(version, PATCHED_JUPYTERLAB)

    def test_lockfile_pins_jupyterlab_to_patched_or_newer_release(self):
        requirements = parse_requirements(BENCHMARK_LOCK)

        self.assertIn("jupyterlab", requirements)
        self.assertEqual(len(requirements["jupyterlab"]), 1)
        operator, version = requirements["jupyterlab"][0]
        self.assertEqual(operator, "==")
        self.assertGreaterEqual(version, PATCHED_JUPYTERLAB)


if __name__ == "__main__":
    unittest.main()
