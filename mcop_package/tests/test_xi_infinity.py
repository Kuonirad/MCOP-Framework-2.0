"""Tests for the Xi^infinity ("non-obvious-angle") extension.

These tests pin down three things:

1. :class:`HiddenConstraintMode` seeds cover all four Xi^infinity moves
   (meta-questioning, phase-transition, perspective-reversal, distant
   analogy) and honour caller-supplied hidden-constraint hints.
2. The engine wiring is strictly opt-in via
   ``MCOPConfig(enable_xi_infinity=True)`` and preserves provenance
   through chain refinement.
3. :class:`GovernanceDomainAdapter` injects governance hints, turns
   Xi^infinity on, and surfaces the non-obvious branches in the
   solution's metadata.
"""

from __future__ import annotations

import pytest

from mcop import (
    HiddenConstraintMode,
    MCOPConfig,
    MCOPContext,
    MCOPEngine,
    Problem,
    ReasoningMode,
    extract_assumptions,
)
from mcop.governance import (
    GOVERNANCE_HIERARCHY,
    GovernanceDomainAdapter,
)


def _make_context(description: str, **problem_kwargs) -> MCOPContext:
    problem = Problem(description=description, **problem_kwargs)
    return MCOPContext(problem=problem)


# --------------------------------------------------------------------- #
# HiddenConstraintMode
# --------------------------------------------------------------------- #


class TestHiddenConstraintMode:
    def test_registers_as_selective_mode(self):
        mode = HiddenConstraintMode()
        assert mode.mode_type == ReasoningMode.SELECTIVE
        assert mode.mode_name == "HiddenConstraint"

    def test_seeds_cover_all_four_moves(self):
        ctx = _make_context(
            "Design a fair vaccine allocation that must be rapid."
        )
        mode = HiddenConstraintMode(config={"analogy_count": 2, "max_hypotheses": 10})

        seeds = mode.generate_hypotheses(ctx.problem, ctx)
        moves = {s.metadata.get("xi_infinity_move") for s in seeds}

        assert {
            "meta_questioning",
            "phase_transition",
            "perspective_reversal",
            "distant_analogy",
        }.issubset(moves)
        for seed in seeds:
            assert seed.mode == ReasoningMode.SELECTIVE

    def test_caller_hints_win_priority(self):
        hint = "the budget itself is the hidden constraint"
        ctx = _make_context(
            "Allocate scarce ventilators across hospitals.",
            context={"hidden_constraint_hints": [hint]},
        )
        assumptions = extract_assumptions(ctx.problem)
        assert assumptions[0] == hint

    def test_extract_assumptions_emits_fallback(self):
        # A terse description with no assumption markers still yields
        # at least one candidate so the mode can seed.
        problem = Problem(description="x")
        assumptions = extract_assumptions(problem)
        assert assumptions, "extract_assumptions must never return empty"

    def test_seeds_start_with_low_confidence(self):
        # Xi^infinity seeds are meant to be surprising, not trusted by
        # default; confidence should stay well below the engine's
        # confidence_threshold until evidence arrives.
        ctx = _make_context(
            "Redesign a municipal waste system that has to serve every district."
        )
        mode = HiddenConstraintMode()
        seeds = mode.generate_hypotheses(ctx.problem, ctx)
        assert all(s.confidence <= 0.5 for s in seeds)

    def test_diversity_cap_prefers_one_per_move(self):
        ctx = _make_context(
            "Must be fair. Must be rapid. Must be cheap. Only one vendor allowed."
        )
        mode = HiddenConstraintMode(config={"max_hypotheses": 4, "analogy_count": 2})
        seeds = mode.generate_hypotheses(ctx.problem, ctx)

        assert len(seeds) == 4
        moves = {s.metadata["xi_infinity_move"] for s in seeds}
        # With four slots and four move types available, each move
        # should claim at least one slot.
        assert len(moves) == 4


# --------------------------------------------------------------------- #
# Engine wiring
# --------------------------------------------------------------------- #


class TestEngineWiring:
    def test_disabled_by_default(self):
        engine = MCOPEngine()
        assert engine.auxiliary_modes == []

    def test_opt_in_via_config(self):
        engine = MCOPEngine(MCOPConfig(enable_xi_infinity=True))
        assert any(isinstance(m, HiddenConstraintMode)
                   for m in engine.auxiliary_modes)

    def test_seeds_are_tagged_with_provenance(self):
        engine = MCOPEngine(MCOPConfig(enable_xi_infinity=True))
        problem = Problem(
            description="Allocate housing that should be equitable.",
        )
        solution = engine.solve(problem)

        seen_aux_provenance = False
        for chain in solution.reasoning_chains:
            for h in chain.hypotheses:
                if h.metadata.get("source_mode_name") == "HiddenConstraint":
                    seen_aux_provenance = True
                    # Child hypotheses spawned from an aux seed must
                    # keep the provenance tag so refinement is routed
                    # back to the auxiliary mode.
                    if h.parent_id:
                        assert h.metadata.get("source_mode_name") == "HiddenConstraint"
        assert seen_aux_provenance

    def test_mode_for_routes_back_to_auxiliary(self):
        engine = MCOPEngine(MCOPConfig(enable_xi_infinity=True))
        aux = engine.auxiliary_modes[0]

        # Fabricate a hypothesis carrying aux provenance.
        seed = aux.create_hypothesis(
            content="hidden",
            confidence=0.3,
        )
        seed.metadata["source_mode_name"] = aux.mode_name

        assert engine._mode_for(seed) is aux

    def test_plain_hypotheses_still_use_builtin(self):
        engine = MCOPEngine(MCOPConfig(enable_xi_infinity=True))
        from mcop.base import CausalMode
        mode = CausalMode()
        h = mode.create_hypothesis(content="obvious", confidence=0.5)
        # No source_mode_name metadata -> built-in dispatch.
        assert type(engine._mode_for(h)) is CausalMode


# --------------------------------------------------------------------- #
# GovernanceDomainAdapter
# --------------------------------------------------------------------- #


class TestGovernanceAdapter:
    def test_enables_xi_infinity_by_default(self):
        adapter = GovernanceDomainAdapter()
        assert adapter.engine.config.enable_xi_infinity is True
        assert any(isinstance(m, HiddenConstraintMode)
                   for m in adapter.engine.auxiliary_modes)

    def test_uses_governance_evidence_hierarchy(self):
        adapter = GovernanceDomainAdapter()
        assert adapter.evidence_hierarchy is GOVERNANCE_HIERARCHY
        # Peer-reviewed policy analysis outweighs news/opinion.
        assert (
            GOVERNANCE_HIERARCHY.get_weight("peer_reviewed_policy_analysis")
            > GOVERNANCE_HIERARCHY.get_weight("news_reporting")
            > GOVERNANCE_HIERARCHY.get_weight("opinion_editorial")
        )

    def test_preprocess_injects_hidden_hints(self):
        adapter = GovernanceDomainAdapter()
        problem = Problem(description="Design a rapid rent-relief program.")
        processed = adapter.preprocess_problem(problem)

        hints = processed.context.get("hidden_constraint_hints")
        assert hints, "governance adapter must inject hidden-constraint hints"
        assert processed.domain == "governance"
        assert processed.constraints, "default governance constraints must be set"

    def test_preprocess_preserves_caller_hints(self):
        adapter = GovernanceDomainAdapter()
        caller_hint = "the commons is not a zero-sum allocation"
        problem = Problem(
            description="Design a fishery licensing regime.",
            context={"hidden_constraint_hints": [caller_hint]},
        )
        processed = adapter.preprocess_problem(problem)
        # Caller hint appears first so extract_assumptions prioritises it.
        assert processed.context["hidden_constraint_hints"][0] == caller_hint

    def test_solution_surfaces_xi_alternatives(self):
        adapter = GovernanceDomainAdapter()
        problem = Problem(
            description=(
                "Design a fair and rapid vaccine distribution system that must "
                "serve every region and should maximise equity."
            ),
            constraints=["budget capped at $20M"],
            success_criteria=["maximise equity across regions"],
        )
        solution = adapter.solve(problem)

        assert solution.metadata["domain"] == "governance"
        assert solution.metadata["xi_infinity_enabled"] is True
        xi_alts = solution.metadata["xi_infinity_alternatives"]
        # At least one Xi^infinity branch should survive to the solution.
        assert xi_alts, "expected at least one Xi^infinity alternative surfaced"
        assert all("move" in entry for entry in xi_alts)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
