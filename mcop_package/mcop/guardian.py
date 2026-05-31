"""M-COP v3.3 — Guardian Meta-Reasoner

The :class:`GuardianMetaReasoner` extends the *Guardian v0.1*
calibration surface from a passive audit hook into an active,
self-reflective meta-reasoner that checks the framework's own
grounding index in real time as a solve progresses.

Design tenets:

1.  **Human primacy is non-negotiable.** The Guardian *flags* and
    *recommends*; it never silently rewrites a solution. When a
    hypothesis, chain, or solution falls below the configured
    grounding threshold and the strict-mode floor, the Guardian raises
    a verdict that requires a human reviewer to acknowledge before the
    artefact is treated as ratified.
2.  **Configurable thresholds with a 0.70 floor.** Production
    deployments may dial the grounding threshold up to 1.0, but they
    cannot dial it below 0.70 without explicitly opting out of the
    strict-mode contract — the floor is the framework's contribution
    to evidence hygiene, not a knob to be tuned away.
3.  **Calibrated, not adversarial.** The Guardian doesn't pretend to
    *know* whether a hypothesis is true; it monitors the grounding
    index against the calibrated threshold and surfaces precise
    deficits so downstream agents (or human reviewers) can act.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Iterable, List, Optional

from .mcop_types import (
    EpistemicState,
    Hypothesis,
    ReasoningChain,
    Solution,
)

__all__ = [
    "GuardianStatus",
    "GuardianVerdict",
    "GuardianConfig",
    "GuardianMetaReasoner",
    "MIN_GROUNDING_FLOOR",
]


# The framework-wide minimum grounding threshold. Configurable above
# this value, but going below it requires explicit strict_mode=False.
MIN_GROUNDING_FLOOR: float = 0.70


class GuardianStatus(Enum):
    """Three-state verdict outcome.

    ``RATIFIED`` — grounding ≥ threshold, no action needed.
    ``CONTESTED`` — grounding below threshold but above the human-review
    floor; the artefact is advisory only.
    ``REQUIRES_HUMAN_REVIEW`` — grounding so low (or evidence so absent)
    that the framework refuses to mark the artefact ratified at all
    without an explicit human acknowledgement.
    """

    RATIFIED = auto()
    CONTESTED = auto()
    REQUIRES_HUMAN_REVIEW = auto()


@dataclass
class GuardianVerdict:
    """A single Guardian decision over a hypothesis/chain/solution.

    The verdict is *additive*: the engine attaches it to the artefact's
    metadata rather than mutating the underlying state. Downstream
    consumers (CLI, UI, MCP server) can then surface the verdict
    prominently without losing the original reasoning trace.
    """

    status: GuardianStatus
    grounding_index: float
    threshold: float
    subject_id: str = ""
    subject_kind: str = "hypothesis"  # 'hypothesis' | 'chain' | 'solution'
    deficit: float = 0.0
    evidence_count: int = 0
    recommendations: List[str] = field(default_factory=list)
    requires_human_review: bool = False
    notes: List[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        """True when the artefact cleared the configured threshold."""
        return self.status == GuardianStatus.RATIFIED

    def to_dict(self) -> dict:
        return {
            "status": self.status.name,
            "grounding_index": round(self.grounding_index, 4),
            "threshold": round(self.threshold, 4),
            "subject_id": self.subject_id,
            "subject_kind": self.subject_kind,
            "deficit": round(self.deficit, 4),
            "evidence_count": self.evidence_count,
            "recommendations": list(self.recommendations),
            "requires_human_review": self.requires_human_review,
            "notes": list(self.notes),
        }


@dataclass
class GuardianConfig:
    """Configuration for :class:`GuardianMetaReasoner`.

    ``min_grounding`` is the operative threshold the Guardian enforces.
    When ``strict_mode`` is True (the default), the framework refuses
    to accept a value below :data:`MIN_GROUNDING_FLOOR` and raises
    ``ValueError`` at construction time — that's the contract that
    "configurable thresholds (minimum 0.70)" announces.

    ``human_review_floor`` defines the harder gate: any artefact whose
    grounding falls below this value is escalated to
    ``REQUIRES_HUMAN_REVIEW`` regardless of strict mode.
    """

    min_grounding: float = 0.70
    human_review_floor: float = 0.50
    strict_mode: bool = True
    # When True, hypotheses with zero evidence always escalate to a
    # human reviewer, even if their initial confidence is high.
    require_evidence_for_ratification: bool = True
    # When True, the Guardian writes its verdict into the artefact's
    # metadata under the 'guardian' key. The engine never reads from
    # this key to make routing decisions; it's there for auditability.
    record_in_metadata: bool = True

    def __post_init__(self) -> None:
        if self.strict_mode and self.min_grounding < MIN_GROUNDING_FLOOR:
            raise ValueError(
                f"GuardianConfig.min_grounding={self.min_grounding!r} is below "
                f"the strict-mode floor of {MIN_GROUNDING_FLOOR}. Either raise "
                f"the threshold or set strict_mode=False explicitly."
            )
        if not 0.0 <= self.min_grounding <= 1.0:
            raise ValueError("min_grounding must be in [0, 1]")
        if not 0.0 <= self.human_review_floor <= 1.0:
            raise ValueError("human_review_floor must be in [0, 1]")
        if self.human_review_floor > self.min_grounding:
            raise ValueError(
                "human_review_floor cannot exceed min_grounding"
            )


class GuardianMetaReasoner:
    """Real-time grounding-index meta-reasoner.

    The Guardian inspects hypotheses, chains, and solutions and emits a
    :class:`GuardianVerdict` describing whether the artefact clears the
    configured grounding bar. The engine threads Guardian checks into
    its validation and synthesis phases so contested or below-floor
    artefacts surface immediately, not just at output time.
    """

    def __init__(self, config: Optional[GuardianConfig] = None):
        self.config = config or GuardianConfig()
        # Internal counter — purely informational, used by adapters
        # that want to render a "checks performed" badge.
        self._checks_performed: int = 0

    # ----- Hypothesis ----------------------------------------------------

    def check_hypothesis(self, hypothesis: Hypothesis) -> GuardianVerdict:
        """Score one hypothesis against the configured grounding bar."""
        self._checks_performed += 1
        grounding = float(hypothesis.grounding_index or 0.0)
        evidence_count = len(hypothesis.evidence)

        verdict = self._verdict_from_grounding(
            grounding=grounding,
            subject_id=hypothesis.id,
            subject_kind="hypothesis",
            evidence_count=evidence_count,
        )

        if (
            self.config.require_evidence_for_ratification
            and evidence_count == 0
        ):
            verdict.requires_human_review = True
            verdict.status = GuardianStatus.REQUIRES_HUMAN_REVIEW
            verdict.notes.append(
                "Hypothesis carries no evidence — automated ratification declined."
            )
            verdict.recommendations.append(
                "Attach at least one Evidence item or invoke the evidence retriever."
            )

        if hypothesis.state == EpistemicState.PRUNED:
            verdict.notes.append("Hypothesis was already pruned.")

        if self.config.record_in_metadata:
            hypothesis.metadata.setdefault("guardian", {})
            hypothesis.metadata["guardian"]["last_verdict"] = verdict.to_dict()

        return verdict

    # ----- Chain ----------------------------------------------------------

    def check_chain(self, chain: ReasoningChain) -> GuardianVerdict:
        """Score a reasoning chain against the grounding bar."""
        self._checks_performed += 1
        grounding = float(chain.total_grounding or 0.0)

        # Aggregate evidence across active hypotheses.
        active = chain.get_active_hypotheses()
        evidence_count = sum(len(h.evidence) for h in active)

        verdict = self._verdict_from_grounding(
            grounding=grounding,
            subject_id=chain.id,
            subject_kind="chain",
            evidence_count=evidence_count,
        )

        if not active:
            verdict.requires_human_review = True
            verdict.status = GuardianStatus.REQUIRES_HUMAN_REVIEW
            verdict.notes.append("Chain has no active hypotheses.")
            verdict.recommendations.append(
                "Regenerate seed hypotheses or relax pruning criteria."
            )

        # Exception paths are first-class epistemic signals: any hypothesis
        # that errored during refinement escalates the whole chain to human
        # review, regardless of the grounding score of its surviving peers.
        errored = [
            h for h in chain.hypotheses if h.state == EpistemicState.ERROR
        ]
        if errored:
            verdict.requires_human_review = True
            verdict.status = GuardianStatus.REQUIRES_HUMAN_REVIEW
            verdict.notes.append(
                f"{len(errored)} hypothesis(es) errored during refinement "
                "— chain escalated for human review."
            )
            verdict.recommendations.append(
                "Inspect hypothesis metadata['error'] for the captured "
                "exception and re-run the affected reasoning step."
            )

        return verdict

    # ----- Solution -------------------------------------------------------

    def check_solution(self, solution: Solution) -> GuardianVerdict:
        """Score a synthesized solution against the grounding bar."""
        self._checks_performed += 1
        grounding = float(solution.grounding_index or 0.0)
        evidence_count = len(solution.evidence_chain)

        verdict = self._verdict_from_grounding(
            grounding=grounding,
            subject_id=solution.id,
            subject_kind="solution",
            evidence_count=evidence_count,
        )

        if not solution.alternative_solutions:
            verdict.notes.append(
                "No alternative solutions preserved — anchoring risk."
            )

        if self.config.record_in_metadata:
            solution.metadata.setdefault("guardian", {})
            solution.metadata["guardian"]["last_verdict"] = verdict.to_dict()

        # Also surface the verdict in the solution's uncertainties when
        # it falls short — that's what reviewers actually read.
        if verdict.status != GuardianStatus.RATIFIED:
            badge = (
                f"Guardian {verdict.status.name.lower()} "
                f"(grounding {grounding:.2f} vs. threshold "
                f"{self.config.min_grounding:.2f})"
            )
            if badge not in solution.key_uncertainties:
                solution.key_uncertainties.append(badge)

        return verdict

    # ----- Batch helpers -------------------------------------------------

    def check_hypotheses(
        self, hypotheses: Iterable[Hypothesis]
    ) -> List[GuardianVerdict]:
        return [self.check_hypothesis(h) for h in hypotheses]

    def check_chains(
        self, chains: Iterable[ReasoningChain]
    ) -> List[GuardianVerdict]:
        return [self.check_chain(c) for c in chains]

    @property
    def checks_performed(self) -> int:
        return self._checks_performed

    # ----- Internals -----------------------------------------------------

    def _verdict_from_grounding(
        self,
        *,
        grounding: float,
        subject_id: str,
        subject_kind: str,
        evidence_count: int,
    ) -> GuardianVerdict:
        threshold = self.config.min_grounding
        deficit = max(0.0, threshold - grounding)

        if grounding >= threshold:
            status = GuardianStatus.RATIFIED
        elif grounding >= self.config.human_review_floor:
            status = GuardianStatus.CONTESTED
        else:
            status = GuardianStatus.REQUIRES_HUMAN_REVIEW

        verdict = GuardianVerdict(
            status=status,
            grounding_index=grounding,
            threshold=threshold,
            subject_id=subject_id,
            subject_kind=subject_kind,
            deficit=deficit,
            evidence_count=evidence_count,
            requires_human_review=(
                status == GuardianStatus.REQUIRES_HUMAN_REVIEW
            ),
        )

        if status != GuardianStatus.RATIFIED:
            verdict.recommendations.append(
                "Gather additional high-quality evidence to lift grounding above "
                f"{threshold:.2f}."
            )
        if evidence_count < 2:
            verdict.recommendations.append(
                "Diversify evidence sources — fewer than 2 items attached."
            )

        return verdict
