"""Tests for ``mcop.guardian``.

The Guardian's contract is "configurable thresholds, minimum 0.70 in
strict mode". These tests pin that contract from both ends — strict
mode rejects below-floor configs, non-strict mode accepts them, and
the verdict surface routes contested / human-review cases through the
right status without ever silently rewriting input artefacts.
"""

from __future__ import annotations

import pytest

from mcop import (
    Evidence,
    Hypothesis,
    ReasoningChain,
    Solution,
)
from mcop.guardian import (
    MIN_GROUNDING_FLOOR,
    GuardianConfig,
    GuardianMetaReasoner,
    GuardianStatus,
)


def _hypothesis(grounding: float, evidence_count: int = 1) -> Hypothesis:
    h = Hypothesis(content="under test", grounding_index=grounding)
    for i in range(evidence_count):
        h.evidence.append(
            Evidence(
                content=f"evidence #{i}",
                source="test",
                evidence_type="peer_reviewed",
                weight=0.9,
            )
        )
    return h


def test_strict_mode_rejects_threshold_below_floor():
    with pytest.raises(ValueError):
        GuardianConfig(min_grounding=0.5, strict_mode=True)


def test_strict_mode_accepts_exactly_floor():
    cfg = GuardianConfig(min_grounding=MIN_GROUNDING_FLOOR, strict_mode=True)
    assert cfg.min_grounding == MIN_GROUNDING_FLOOR


def test_non_strict_mode_allows_below_floor():
    cfg = GuardianConfig(
        min_grounding=0.40,
        human_review_floor=0.20,
        strict_mode=False,
    )
    assert cfg.min_grounding == 0.40


def test_human_review_floor_cannot_exceed_min_grounding():
    with pytest.raises(ValueError):
        GuardianConfig(min_grounding=0.70, human_review_floor=0.80)


def test_hypothesis_above_threshold_is_ratified():
    guardian = GuardianMetaReasoner()
    h = _hypothesis(grounding=0.85)
    verdict = guardian.check_hypothesis(h)
    assert verdict.status == GuardianStatus.RATIFIED
    assert verdict.passed
    assert verdict.deficit == 0.0
    assert not verdict.requires_human_review


def test_hypothesis_between_review_floor_and_threshold_is_contested():
    guardian = GuardianMetaReasoner()
    h = _hypothesis(grounding=0.55)  # in [0.50, 0.70)
    verdict = guardian.check_hypothesis(h)
    assert verdict.status == GuardianStatus.CONTESTED
    assert not verdict.passed
    assert verdict.recommendations  # should suggest gathering more evidence


def test_hypothesis_below_review_floor_requires_human_review():
    guardian = GuardianMetaReasoner()
    h = _hypothesis(grounding=0.10)
    verdict = guardian.check_hypothesis(h)
    assert verdict.status == GuardianStatus.REQUIRES_HUMAN_REVIEW
    assert verdict.requires_human_review


def test_zero_evidence_escalates_even_at_high_grounding():
    guardian = GuardianMetaReasoner()
    h = _hypothesis(grounding=0.99, evidence_count=0)
    verdict = guardian.check_hypothesis(h)
    assert verdict.requires_human_review
    assert verdict.status == GuardianStatus.REQUIRES_HUMAN_REVIEW


def test_check_chain_uses_total_grounding():
    guardian = GuardianMetaReasoner()
    chain = ReasoningChain(total_grounding=0.80)
    chain.add_hypothesis(_hypothesis(grounding=0.80))
    verdict = guardian.check_chain(chain)
    assert verdict.status == GuardianStatus.RATIFIED


def test_check_solution_writes_verdict_to_metadata():
    guardian = GuardianMetaReasoner()
    solution = Solution(
        problem_id="p",
        content="x",
        confidence=0.9,
        grounding_index=0.80,
        evidence_chain=[
            Evidence(
                content="e",
                source="s",
                evidence_type="peer_reviewed",
                weight=0.9,
            )
        ],
    )
    verdict = guardian.check_solution(solution)
    assert verdict.passed
    assert solution.metadata["guardian"]["last_verdict"]["status"] == "RATIFIED"


def test_check_solution_appends_uncertainty_when_below_threshold():
    guardian = GuardianMetaReasoner()
    solution = Solution(
        problem_id="p",
        content="x",
        confidence=0.9,
        grounding_index=0.30,
        evidence_chain=[
            Evidence(
                content="e",
                source="s",
                evidence_type="anecdotal",
                weight=0.3,
            )
        ],
    )
    guardian.check_solution(solution)
    assert any("Guardian" in u for u in solution.key_uncertainties)


def test_checks_performed_counter_increments():
    guardian = GuardianMetaReasoner()
    h = _hypothesis(grounding=0.80)
    assert guardian.checks_performed == 0
    guardian.check_hypothesis(h)
    guardian.check_hypothesis(h)
    assert guardian.checks_performed == 2
