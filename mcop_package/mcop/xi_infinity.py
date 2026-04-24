"""
M-COP v3.1 -- Xi^infinity ("non-obvious-angle") reasoning extension.

The Xi^infinity prompt is a meta-strategy for escaping the obvious search
space.  Rather than asking "what is a good solution?", it asks:

  1. Meta-questioning: what hidden assumption makes all plausible solutions
     look the same, and what does the solution space look like if that
     assumption is negated?
  2. Phase transitions: where is the regime boundary at which incremental
     improvement stops helping and a qualitatively different approach
     becomes available?
  3. Perspective reversal: in what sense is the problem solving the solver,
     i.e. how is the environment shaping the available moves?
  4. Distant analogy: what structurally similar pattern exists in an
     unrelated domain (biology, archaeology, physics, economics, ...)
     that would reveal a non-obvious move here?

This module operationalises those four moves as a :class:`BaseReasoningMode`
subclass so the existing six-phase M-COP engine can seed Xi^infinity
hypotheses alongside the standard causal / structural / selective /
compositional modes.  The output is deterministic -- no LLM call is
performed here -- which keeps the engine auditable and reproducible.

The mode is opt-in: it is only registered when callers pass
``enable_xi_infinity=True`` on :class:`~mcop.engine.MCOPConfig`, or when
they attach it manually via :meth:`~mcop.engine.MCOPEngine.add_mode`.
"""

from __future__ import annotations

from typing import List, Dict, Any, Optional, Tuple

from .mcop_types import (
    Evidence,
    EpistemicState,
    Hypothesis,
    MCOPContext,
    Problem,
    ReasoningMode,
)
from .base import BaseReasoningMode


# Keywords that typically encode an implicit assumption in a problem
# statement.  When present, negating the surrounding clause tends to
# surface a hidden constraint worth challenging.
_ASSUMPTION_MARKERS: Tuple[str, ...] = (
    "must",
    "should",
    "needs to",
    "has to",
    "always",
    "never",
    "only",
    "every",
    "all",
    "assume",
    "assuming",
    "given that",
    "require",
    "required",
    "standard",
    "typical",
    "normally",
)

# Distant-analogy donor domains.  Each entry pairs a domain label with a
# short structural lens -- a compact description of a pattern from that
# domain that often reframes the original problem.
_ANALOGY_DONORS: Tuple[Tuple[str, str], ...] = (
    ("biology", "mycelial foraging: parallel low-cost probes that reinforce only along successful paths"),
    ("archaeology", "stratigraphy: treat today's artefacts as evidence of forgotten prior regimes"),
    ("physics", "phase transition: small parameter change flips the system into a qualitatively new regime"),
    ("economics", "mechanism design: redesign the incentive surface instead of the chosen action"),
    ("ecology", "keystone species: a small, unobvious node holds the whole structure together"),
    ("cryptography", "threat model inversion: assume the adversary already holds every obvious secret"),
)


def extract_assumptions(problem: Problem) -> List[str]:
    """Return candidate implicit assumptions derived from a problem.

    The extraction is intentionally lightweight and deterministic so the
    engine stays reproducible: we surface clauses containing typical
    assumption-markers, the explicit success criteria (which are
    assumptions about what "good" means), and any caller-supplied hints
    stored under ``problem.context['hidden_constraint_hints']``.

    Callers that want richer extraction can override this function in a
    domain adapter's :meth:`preprocess_problem` by populating that
    context key before the engine runs.
    """
    assumptions: List[str] = []

    description = (problem.description or "").strip()
    if description:
        lowered = description.lower()
        for marker in _ASSUMPTION_MARKERS:
            idx = lowered.find(marker)
            if idx == -1:
                continue
            # Take the sentence-ish window around the marker so the
            # assumption is readable when later negated.
            start = max(0, idx - 40)
            end = min(len(description), idx + len(marker) + 60)
            snippet = description[start:end].strip()
            if snippet and snippet not in assumptions:
                assumptions.append(snippet)

    # Success criteria are assumptions about what "good" looks like.
    for criterion in problem.success_criteria or []:
        if criterion and criterion not in assumptions:
            assumptions.append(f"success requires: {criterion}")

    # Caller-provided hints win priority and are always surfaced.
    hints = (problem.context or {}).get("hidden_constraint_hints") or []
    for hint in hints:
        if hint and hint not in assumptions:
            assumptions.insert(0, hint)

    # Fallback: if nothing was found, emit a generic prompt so the mode
    # still produces a seed.  This mirrors how CausalMode handles
    # descriptions with no explicit causal keyword.
    if not assumptions:
        assumptions.append(
            "every proposed solution resembles the others along the same axis"
        )

    return assumptions


class HiddenConstraintMode(BaseReasoningMode):
    """Xi^infinity reasoning mode.

    Generates seed hypotheses that deliberately step outside the obvious
    search space by:

    * negating a detected implicit assumption (meta-questioning),
    * asking where the regime would flip (phase transition),
    * inverting the actor/environment frame (perspective reversal),
    * importing a structural lens from an unrelated donor domain
      (distant analogy).

    The mode registers under :data:`ReasoningMode.SELECTIVE` because its
    hypotheses are best refined through the engine's selective/pruning
    machinery: each seed is a candidate *constraint to drop* and should
    be tested against evidence that either justifies or removes the
    assumption.
    """

    mode_type = ReasoningMode.SELECTIVE
    mode_name = "HiddenConstraint"

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        # How many distant-analogy donors to draw from per problem.
        self.analogy_count: int = int(self.config.get("analogy_count", 2))
        # Seeds for this mode start deliberately low: they are meant to
        # be surprising, not immediately trusted.
        self.seed_confidence: float = float(self.config.get("seed_confidence", 0.3))

    def generate_hypotheses(
        self,
        problem: Problem,
        context: MCOPContext,
    ) -> List[Hypothesis]:
        seeds: List[Hypothesis] = []
        assumptions = extract_assumptions(problem)

        # (1) Meta-questioning: negate each surfaced assumption.
        for assumption in assumptions[: self.max_hypotheses]:
            seeds.append(self.create_hypothesis(
                content=(
                    f"What if the hidden assumption '{assumption}' were false? "
                    "Describe the solution that only becomes visible once it is dropped."
                ),
                confidence=self.seed_confidence,
                metadata={
                    "xi_infinity_move": "meta_questioning",
                    "assumption": assumption,
                },
            ))

        # (2) Phase transition: look for a threshold where the regime flips.
        seeds.append(self.create_hypothesis(
            content=(
                "Identify the parameter whose incremental change has diminishing returns; "
                "propose the qualitatively different regime that emerges past that threshold."
            ),
            confidence=self.seed_confidence,
            metadata={"xi_infinity_move": "phase_transition"},
        ))

        # (3) Perspective reversal: treat the problem as solving the solver.
        seeds.append(self.create_hypothesis(
            content=(
                "Invert the frame: how is the environment shaping the solver's available moves, "
                "and what option appears once that feedback loop is made explicit?"
            ),
            confidence=self.seed_confidence,
            metadata={"xi_infinity_move": "perspective_reversal"},
        ))

        # (4) Distant analogy: import a structural lens from another domain.
        for donor, lens in _ANALOGY_DONORS[: max(0, self.analogy_count)]:
            seeds.append(self.create_hypothesis(
                content=(
                    f"Analogy from {donor}: apply the lens of '{lens}' to this problem and "
                    "describe the non-obvious structure it reveals."
                ),
                confidence=self.seed_confidence,
                metadata={
                    "xi_infinity_move": "distant_analogy",
                    "donor_domain": donor,
                    "lens": lens,
                },
            ))

        # Cap at the mode's max_hypotheses budget, preserving diversity
        # of moves rather than just taking the first N assumptions.
        return self._cap_preserving_diversity(seeds)

    def refine_hypothesis(
        self,
        hypothesis: Hypothesis,
        evidence: List[Evidence],
        context: MCOPContext,
    ) -> Hypothesis:
        move = hypothesis.metadata.get("xi_infinity_move")

        for e in evidence:
            hypothesis.add_evidence(e)

            # Evidence that explicitly vindicates the non-obvious angle
            # (tagged by downstream tooling) is worth more than generic
            # supporting evidence.
            if e.metadata.get("supports_hidden_angle"):
                hypothesis.confidence = min(1.0, hypothesis.confidence + 0.2)
            elif e.weight >= 0.7:
                hypothesis.confidence = min(1.0, hypothesis.confidence + 0.1)
            elif e.weight < 0.3:
                # A non-obvious angle with no grounding at all is more
                # likely a distraction than a revelation.
                hypothesis.confidence = max(0.0, hypothesis.confidence - 0.1)

        # Phase-transition and perspective-reversal seeds benefit from
        # being kept alive a bit longer than raw assumption negations;
        # they often need multiple iterations to resolve.
        if move in ("phase_transition", "perspective_reversal"):
            hypothesis.confidence = max(hypothesis.confidence, self.min_confidence + 0.05)

        hypothesis.state = EpistemicState.GROWING
        return hypothesis

    def evaluate_hypothesis(
        self,
        hypothesis: Hypothesis,
        context: MCOPContext,
    ) -> float:
        base = hypothesis.confidence
        grounding = hypothesis.grounding_index * 0.25

        # Novelty bonus: reward hypotheses that sit outside the crowd of
        # existing seeds, measured by crude content overlap.  This keeps
        # Xi^infinity seeds from being crushed by a dominant obvious chain.
        novelty = self._novelty_score(hypothesis, context)
        return min(1.0, base + grounding + novelty * 0.15)

    # -- helpers --------------------------------------------------------

    def _cap_preserving_diversity(
        self,
        seeds: List[Hypothesis],
    ) -> List[Hypothesis]:
        """Keep at most ``max_hypotheses`` seeds, one per Xi^infinity move first."""
        if len(seeds) <= self.max_hypotheses:
            return seeds

        by_move: Dict[str, List[Hypothesis]] = {}
        for s in seeds:
            move = s.metadata.get("xi_infinity_move", "unknown")
            by_move.setdefault(move, []).append(s)

        kept: List[Hypothesis] = []
        # First pass: one per move.
        for move_seeds in by_move.values():
            if move_seeds:
                kept.append(move_seeds[0])
            if len(kept) >= self.max_hypotheses:
                return kept

        # Second pass: fill remaining budget from the largest move bucket.
        for move_seeds in by_move.values():
            for s in move_seeds[1:]:
                if len(kept) >= self.max_hypotheses:
                    return kept
                kept.append(s)
        return kept

    def _novelty_score(
        self,
        hypothesis: Hypothesis,
        context: MCOPContext,
    ) -> float:
        """Rough novelty score against existing hypotheses in the context."""
        others = [
            h for h in context.hypotheses.values()
            if h.id != hypothesis.id and h.content
        ]
        if not others:
            return 1.0

        own_tokens = set(hypothesis.content.lower().split())
        if not own_tokens:
            return 0.0

        overlaps = []
        for other in others:
            other_tokens = set(other.content.lower().split())
            if not other_tokens:
                continue
            intersection = own_tokens & other_tokens
            union = own_tokens | other_tokens
            overlaps.append(len(intersection) / max(1, len(union)))

        if not overlaps:
            return 1.0

        # Novelty = 1 - max overlap.  A seed that duplicates any existing
        # hypothesis scores 0; one with no overlap scores 1.
        return max(0.0, 1.0 - max(overlaps))


__all__ = [
    "HiddenConstraintMode",
    "extract_assumptions",
]
