import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


def load_self_audit():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "self_audit.py"
    spec = importlib.util.spec_from_file_location("self_audit", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def write(path: Path, content: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class SelfAuditTests(unittest.TestCase):
    def test_build_audit_record_scores_stigmergic_front_door(self):
        module = load_self_audit()
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            write(repo / "README.md", "benchmark\nreproducible\ncomparison\n")
            write(repo / "CONTRIBUTING.md", "resonance-report\netch-extension\nfriction-report\n")
            write(repo / "CODE_OF_CONDUCT.md", "code\n")
            write(repo / "SECURITY.md", "security\n")
            write(repo / "CITATION.cff", "cff\n")
            write(repo / "COMPARISONS.md", "comparison\n")
            write(repo / "docs/badges/reproducible-benchmark.svg", "<svg />\n")
            write(repo / "examples/reproducible-benchmark/notebooks/reproduce-22700-ops.ipynb", "{}\n")
            write(repo / ".github/ISSUE_TEMPLATE/resonance-report.yml", "name: Resonance Report\n")
            write(repo / ".github/ISSUE_TEMPLATE/etch-extension.yml", "name: Etch Extension\n")
            write(repo / ".github/ISSUE_TEMPLATE/friction-report.yml", "name: Friction Report\n")

            record = module.build_audit_record(repo, generated_at="2026-05-24T00:00:00Z")

        self.assertEqual(record["schema_version"], 1)
        self.assertEqual(record["generated_at"], "2026-05-24T00:00:00Z")
        self.assertEqual(record["checks"]["benchmark_notebook"]["status"], "pass")
        self.assertEqual(record["checks"]["stigmergic_issue_templates"]["status"], "pass")
        self.assertEqual(record["checks"]["comparison_document"]["status"], "pass")
        self.assertEqual(record["scores"]["front_door_readiness"], 1.0)

    def test_append_ledger_preserves_existing_jsonl(self):
        module = load_self_audit()
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "audit" / "ledger.jsonl"
            first = {"schema_version": 1, "generated_at": "2026-05-23T00:00:00Z"}
            ledger.parent.mkdir(parents=True)
            ledger.write_text(json.dumps(first) + "\n", encoding="utf-8")

            second = {"schema_version": 1, "generated_at": "2026-05-24T00:00:00Z"}
            module.append_ledger(ledger, second)

            rows = [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines()]

        self.assertEqual(rows, [first, second])


if __name__ == "__main__":
    unittest.main()
