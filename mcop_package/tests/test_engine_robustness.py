"""Robustness tests for the v3.3 engine hardening.

These cover the exception-safety / ERROR epistemic-state work, context
isolation across reused contexts, evidence de-duplication during synthesis,
and the Guardian escalation that turns exception paths into auditable signals.
"""

from __future__ import annotations

from mcop import (
    Evidence,
    Hypothesis,
    MCOPConfig,
    MCOPContext,
    MCOPEngine,
    Problem,
    ReasoningChain,
    ReasoningMode,
)
from mcop.base import CausalMode
from mcop.guardian import GuardianMetaReasoner, GuardianStatus
from mcop.mcop_types import EpistemicState, INACTIVE_STATES


class _ExplodingMode(CausalMode):
    """A reasoning mode whose refinement always raises."""

    mode_name = "Exploding"

    def refine_hypothesis(self, hypothesis, evidence, context):
        raise RuntimeError("boom during refinement")


def test_error_state_exists_and_is_inactive():
    assert hasattr(EpistemicState, "ERROR")
    assert EpistemicState.ERROR in INACTIVE_STATES
    assert EpistemicState.PRUNED in INACTIVE_STATES


def test_solve_survives_mode_exception_and_marks_error():
    engine = MCOPEngine(MCOPConfig(max_iterations=3))
    # Force every built-in causal slot to explode during refinement.
    engine.add_mode(ReasoningMode.CAUSAL, _ExplodingMode())

    solution = engine.solve(Problem(description="trigger a refinement error"))

    # The engine degrades gracefully rather than crashing.
    assert solution is not None
    assert solution.reasoning_chains

    # At least one hypothesis is promoted to a first-class ERROR object with
    # structured diagnostic metadata.
    errored = [
        h
        for chain in solution.reasoning_chains
        for h in chain.hypotheses
        if h.state == EpistemicState.ERROR
    ]
    assert errored, "expected at least one ERROR hypothesis"
    err_meta = errored[0].metadata["error"]
    assert err_meta["type"] == "RuntimeError"
    assert "boom" in err_meta["message"]
    assert "iteration" in err_meta


def test_errored_chain_escalates_to_human_review():
    engine = MCOPEngine(MCOPConfig(max_iterations=3))
    engine.add_mode(ReasoningMode.CAUSAL, _ExplodingMode())

    solution = engine.solve(Problem(description="escalate me"))

    # The solution-level guardian summary records the errored chains and the
    # uncertainties surface the escalation for human reviewers.
    summary = solution.metadata["guardian"]["chain_summary"]
    assert summary["errored_chains"] >= 1
    assert any("escalation" in u.lower() for u in solution.key_uncertainties)


def test_guardian_check_chain_escalates_on_error_hypothesis():
    guardian = GuardianMetaReasoner()
    chain = ReasoningChain(total_grounding=0.95)
    good = Hypothesis(content="fine", grounding_index=0.95)
    good.evidence.append(Evidence(content="e", source="s", weight=0.9))
    chain.add_hypothesis(good)

    bad = Hypothesis(content="broke", grounding_index=0.0)
    bad.state = EpistemicState.ERROR
    bad.metadata["error"] = {"type": "ValueError", "message": "x"}
    chain.add_hypothesis(bad)

    verdict = guardian.check_chain(chain)
    assert verdict.status == GuardianStatus.REQUIRES_HUMAN_REVIEW
    assert verdict.requires_human_review
    assert any("errored" in n for n in verdict.notes)


def test_context_isolation_resets_reused_context():
    engine = MCOPEngine(MCOPConfig(max_iterations=2))
    context = MCOPContext(problem=Problem(description="reuse me"))

    engine.solve(context.problem, initial_context=context)
    first_hyp_count = len(context.hypotheses)
    assert first_hyp_count > 0
    assert context.consumed

    # Second solve on the same context must not accumulate the prior run's
    # hypotheses/chains.
    engine.solve(context.problem, initial_context=context)
    assert len(context.hypotheses) == first_hyp_count
    assert len(context.chains) > 0


def test_reset_working_state_preserves_problem_and_thresholds():
    problem = Problem(description="keep me")
    ctx = MCOPContext(
        problem=problem,
        grounding_threshold=0.8,
        confidence_threshold=0.55,
    )
    ctx.add_hypothesis(Hypothesis(content="ephemeral"))
    ctx.evidence_pool.append(Evidence(content="e"))
    ctx.current_iteration = 4

    ctx.reset_working_state()

    assert ctx.hypotheses == {}
    assert ctx.chains == {}
    assert ctx.evidence_pool == []
    assert ctx.current_iteration == 0
    # Problem + thresholds survive the reset.
    assert ctx.problem is problem
    assert ctx.grounding_threshold == 0.8
    assert ctx.confidence_threshold == 0.55


def test_evidence_deduplicated_in_solution():
    engine = MCOPEngine(MCOPConfig(max_iterations=2))
    solution = engine.solve(Problem(description="dedup evidence"))

    ids = [e.id for e in solution.evidence_chain]
    assert len(ids) == len(set(ids)), "evidence_chain contains duplicate ids"


def test_alternative_mode_selection_handles_unknown_mode():
    engine = MCOPEngine()
    # Every canonical mode rotates to the next one without raising.
    for mode in ReasoningMode:
        nxt = engine._select_alternative_mode(mode)
        assert isinstance(nxt, ReasoningMode)
        assert nxt != mode
