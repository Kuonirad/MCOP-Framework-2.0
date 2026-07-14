import sys
try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib  # type: ignore[no-redef]
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mcop
from mcop.cli import build_parser, format_solution_output


def test_pyproject_version_matches_runtime_version():
    pyproject = tomllib.loads((Path(__file__).resolve().parents[1] / "pyproject.toml").read_text())
    assert pyproject["project"]["version"] == mcop.__version__


def test_protocol_version_matches_packaging_metadata():
    pyproject = tomllib.loads(
        (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text()
    )
    assert mcop.__version__ == "4.0.0"
    assert mcop.TRIAD_PROTOCOL_VERSION == "2.4.0"
    assert pyproject["tool"]["mcop"]["protocol-version"] == "2.4.0"


def test_cli_displays_the_runtime_distribution_version():
    help_text = build_parser().format_help()
    assert f"M-COP v{mcop.__version__}" in help_text
    assert "M-COP v3.1" not in help_text

    solution = type(
        "SolutionFixture",
        (),
        {
            "content": "Versioned result",
            "confidence": 0.5,
            "grounding_index": 0.5,
            "evidence_chain": [],
            "alternative_solutions": [],
            "key_uncertainties": [],
        },
    )()
    rendered = format_solution_output(solution)
    assert f"M-COP v{mcop.__version__} SOLUTION" in rendered
    assert "M-COP v3.1" not in rendered
