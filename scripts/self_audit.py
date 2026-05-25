#!/usr/bin/env python3
"""Append a compact, read-only MCOP repository self-audit record."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


EXPECTED_TEMPLATES = (
    ".github/ISSUE_TEMPLATE/resonance-report.yml",
    ".github/ISSUE_TEMPLATE/etch-extension.yml",
    ".github/ISSUE_TEMPLATE/friction-report.yml",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--ledger", type=Path, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    ledger = args.ledger or repo_root / "audit" / "ledger.jsonl"
    record = build_audit_record(repo_root)

    if not args.dry_run:
        append_ledger(ledger, record)

    print(json.dumps(record, sort_keys=True))
    if args.dry_run:
        print("self-audit dry run: ledger not modified")
    else:
        print(f"self-audit appended: {ledger}")
    return 0


def build_audit_record(repo_root: Path, generated_at: str | None = None) -> dict[str, Any]:
    generated_at = generated_at or datetime.now(UTC).replace(microsecond=0).isoformat()
    checks = {
        "benchmark_notebook": file_check(
            repo_root,
            "examples/reproducible-benchmark/notebooks/reproduce-22700-ops.ipynb",
        ),
        "benchmark_badge": file_check(repo_root, "docs/badges/reproducible-benchmark.svg"),
        "stigmergic_issue_templates": all_files_check(repo_root, EXPECTED_TEMPLATES),
        "contribution_scaffolding": content_check(
            repo_root,
            "CONTRIBUTING.md",
            ("resonance-report", "etch-extension", "friction-report"),
        ),
        "comparison_document": file_check(repo_root, "COMPARISONS.md"),
        "governance_signals": all_files_check(
            repo_root,
            ("CODE_OF_CONDUCT.md", "SECURITY.md", "CITATION.cff"),
        ),
    }

    readiness = sum(1 for check in checks.values() if check["status"] == "pass") / len(checks)
    return {
        "schema_version": 1,
        "kind": "mcop-self-audit",
        "generated_at": generated_at,
        "repo": {
            "root": str(repo_root),
            "head": git_output(repo_root, "rev-parse", "HEAD"),
            "branch": git_output(repo_root, "branch", "--show-current"),
        },
        "scores": {
            "front_door_readiness": round(readiness, 4),
        },
        "checks": checks,
        "revision_triggers": {
            "front_door_readiness": "Re-open Phase 0 if score drops below 0.85.",
            "benchmark_notebook": "Do not claim reproducible benchmarks if the notebook disappears.",
            "stigmergic_issue_templates": "Restore templates before soliciting external reports.",
        },
    }


def append_ledger(ledger_path: Path, record: dict[str, Any]) -> None:
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, sort_keys=True, separators=(",", ":")))
        handle.write("\n")


def file_check(repo_root: Path, relative_path: str) -> dict[str, Any]:
    path = repo_root / relative_path
    return {
        "status": "pass" if path.is_file() else "fail",
        "path": relative_path,
    }


def all_files_check(repo_root: Path, relative_paths: tuple[str, ...]) -> dict[str, Any]:
    missing = [path for path in relative_paths if not (repo_root / path).is_file()]
    return {
        "status": "pass" if not missing else "fail",
        "paths": list(relative_paths),
        "missing": missing,
    }


def content_check(repo_root: Path, relative_path: str, required_terms: tuple[str, ...]) -> dict[str, Any]:
    path = repo_root / relative_path
    if not path.is_file():
        return {
            "status": "fail",
            "path": relative_path,
            "missing_terms": list(required_terms),
        }

    content = path.read_text(encoding="utf-8").lower()
    missing_terms = [term for term in required_terms if term.lower() not in content]
    return {
        "status": "pass" if not missing_terms else "fail",
        "path": relative_path,
        "missing_terms": missing_terms,
    }


def git_output(repo_root: Path, *args: str) -> str | None:
    try:
        return subprocess.check_output(
            ("git", *args),
            cwd=repo_root,
            encoding="utf-8",
            stderr=subprocess.DEVNULL,
        ).strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


if __name__ == "__main__":
    raise SystemExit(main())
