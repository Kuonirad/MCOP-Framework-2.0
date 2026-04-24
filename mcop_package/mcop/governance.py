"""
M-COP v3.1 Governance Domain Adapter.

A worked example of how the Xi^infinity ("non-obvious-angle") extension
integrates with M-COP's domain-adapter machinery.  Governance problems
-- vaccine allocation, resource rationing, regulation design -- are a
natural fit for Xi^infinity because the obvious solutions are typically
converged on via a handful of shared implicit assumptions (same cost
model, same unit of fairness, same time horizon).  Making those
assumptions explicit and negating them often exposes the policy move
that dominates the incremental tweaks.

This adapter:

* enables :class:`~mcop.xi_infinity.HiddenConstraintMode` as an
  auxiliary mode on the engine,
* raises ``max_iterations`` and ``min_alternatives`` so divergent
  hypotheses survive the diversity-preservation phase,
* installs a governance-specific :class:`EvidenceHierarchy` that
  privileges peer-reviewed policy analysis over anecdotal reporting,
* seeds the problem with governance-flavoured hidden-constraint hints
  via :meth:`preprocess_problem`.

The adapter is deliberately small: everything non-governance lives in
the base classes.
"""

from __future__ import annotations

from typing import List

from .domain_base import BaseDomainAdapter, DomainConfig
from .engine import MCOPConfig
from .index import EvidenceHierarchy
from .mcop_types import Problem, ReasoningMode, Solution


GOVERNANCE_HIERARCHY = EvidenceHierarchy(
    name="governance",
    weights={
        "peer_reviewed_policy_analysis": 0.95,
        "randomized_policy_trial": 1.0,
        "quasi_experimental_study": 0.85,
        "government_statistics": 0.80,
        "independent_audit": 0.80,
        "stakeholder_survey": 0.65,
        "expert_testimony": 0.55,
        "news_reporting": 0.30,
        "opinion_editorial": 0.20,
        "anecdote": 0.15,
    },
    default_weight=0.4,
)


# Hidden-constraint hints typical of governance problems.  Injected
# into ``problem.context`` by the adapter so
# :func:`mcop.xi_infinity.extract_assumptions` surfaces them as
# high-priority assumption candidates.
_GOVERNANCE_HIDDEN_HINTS: List[str] = [
    "the unit of fairness is individuals (not communities or generations)",
    "the intervention's time horizon matches a single political cycle",
    "compliance is voluntary and uniform across subpopulations",
    "the policy acts on the citizen, not on the institution designing it",
    "the baseline cost accounting excludes the cost of measurement itself",
]


class GovernanceDomainAdapter(BaseDomainAdapter):
    """Domain adapter for governance / public-policy problems.

    Example
    -------
    >>> from mcop import Problem
    >>> from mcop.governance import GovernanceDomainAdapter
    >>> adapter = GovernanceDomainAdapter()
    >>> problem = Problem(
    ...     description="Design a fair and rapid vaccine distribution system.",
    ...     constraints=["budget capped at $20M"],
    ...     success_criteria=["maximise equity across regions"],
    ... )
    >>> solution = adapter.solve(problem)
    >>> solution.metadata["domain"]
    'governance'
    """

    def _default_config(self) -> DomainConfig:
        return DomainConfig(
            name="governance",
            description=(
                "Public policy and institutional design, with Xi^infinity "
                "hidden-constraint reasoning enabled."
            ),
            mode_mappings={
                # The four M-COP modes map to the conceptual layers of
                # institutional design rather than to arbitrary labels.
                ReasoningMode.CAUSAL: "stakeholder_incentives",
                ReasoningMode.STRUCTURAL: "legal_and_organisational_frameworks",
                ReasoningMode.SELECTIVE: "resource_allocation_constraints",
                ReasoningMode.COMPOSITIONAL: "policy_synthesis",
            },
            evidence_hierarchy=GOVERNANCE_HIERARCHY,
            mcop_config=MCOPConfig(
                # Governance problems reward depth of exploration: the
                # obvious solution and the non-obvious one typically
                # diverge only after several iterations of refinement.
                max_iterations=15,
                min_alternatives=5,
                diversity_threshold=0.5,
                enable_epistemic_challenge=True,
                enable_xi_infinity=True,
            ),
            default_constraints=[
                "Do no harm to vulnerable subpopulations",
                "Provide auditable justification for every allocation rule",
                "Prefer reversible interventions over irreversible ones",
            ],
            terminology={
                "hypothesis": "policy option",
                "evidence": "policy evidence",
                "constraint": "institutional constraint",
            },
        )

    def preprocess_problem(self, problem: Problem) -> Problem:
        """Inject governance hidden-constraint hints and defaults."""
        problem.domain = "governance"

        if not problem.constraints:
            problem.constraints = list(self.config.default_constraints)

        # Preserve any caller-supplied hints; extend with governance
        # defaults so Xi^infinity has a rich assumption pool to negate.
        existing_hints = list(
            (problem.context or {}).get("hidden_constraint_hints") or []
        )
        merged_hints: List[str] = []
        for hint in existing_hints + _GOVERNANCE_HIDDEN_HINTS:
            if hint and hint not in merged_hints:
                merged_hints.append(hint)
        problem.context = dict(problem.context or {})
        problem.context["hidden_constraint_hints"] = merged_hints

        return problem

    def postprocess_solution(
        self,
        solution: Solution,
        problem: Problem,
    ) -> Solution:
        """Tag the solution with governance metadata."""
        solution.metadata["domain"] = "governance"
        solution.metadata["xi_infinity_enabled"] = True

        # Surface the subset of alternatives that came from the
        # Xi^infinity mode so reviewers can audit the non-obvious
        # branches independently of the obvious ones.
        xi_alternatives = []
        for chain in solution.reasoning_chains:
            for h in chain.hypotheses:
                if h.metadata.get("source_mode_name") == "HiddenConstraint":
                    xi_alternatives.append({
                        "move": h.metadata.get("xi_infinity_move"),
                        "content": h.content,
                        "confidence": h.confidence,
                    })
                    break
        solution.metadata["xi_infinity_alternatives"] = xi_alternatives

        return solution


__all__ = [
    "GovernanceDomainAdapter",
    "GOVERNANCE_HIERARCHY",
]
