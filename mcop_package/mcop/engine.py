"""
M-COP v3.1 Core Engine

The main orchestration engine that implements the M-COP reasoning protocol.
This is the Stateless Execution Harness - it processes context and returns results
without maintaining internal state between calls.
"""

from typing import List, Dict, Any, Optional, Type
from dataclasses import dataclass, field
import logging

from .mcop_types import (
    Problem, Solution, Hypothesis, Evidence, ReasoningChain,
    MCOPContext, ReasoningMode, EpistemicState
)
from .base import (
    BaseReasoningMode, CausalMode, StructuralMode,
    SelectiveMode, CompositionalMode
)

logger = logging.getLogger(__name__)


@dataclass
class MCOPConfig:
    """Configuration for M-COP engine."""
    max_iterations: int = 10
    max_hypotheses_per_mode: int = 5
    diversity_threshold: float = 0.3
    grounding_threshold: float = 0.4
    confidence_threshold: float = 0.6
    min_alternatives: int = 2  # Preserve at least N alternatives
    enable_epistemic_challenge: bool = True
    # Opt-in Xi^infinity mode: when True, the engine also seeds
    # "hidden-constraint" hypotheses (assumption negation, phase
    # transitions, perspective reversal, distant analogies).  See
    # :mod:`mcop.xi_infinity` for the full rationale.
    enable_xi_infinity: bool = False
    verbose: bool = False


class MCOPEngine:
    """
    M-COP v3.1 Reasoning Engine

    Implements the complete M-COP protocol:
    1. Seed Generation (multi-modal hypotheses)
    2. Mycelial Chaining (recursive refinement)
    3. Intermediate Validation (evidence integration)
    4. Diversity Preservation (prevent anchoring)
    5. Synthesis (final solution with grounding)

    This is a STATELESS execution harness. All state is passed in via
    MCOPContext and returned in the Solution.
    """

    def __init__(self, config: Optional[MCOPConfig] = None):
        self.config = config or MCOPConfig()

        # Initialize reasoning modes
        self.modes: Dict[ReasoningMode, BaseReasoningMode] = {
            ReasoningMode.CAUSAL: CausalMode(),
            ReasoningMode.STRUCTURAL: StructuralMode(),
            ReasoningMode.SELECTIVE: SelectiveMode(),
            ReasoningMode.COMPOSITIONAL: CompositionalMode()
        }

        # Auxiliary modes share a ReasoningMode enum slot with a built-in
        # mode (e.g. Xi^infinity reuses SELECTIVE) but generate and refine
        # hypotheses with their own logic.  They are iterated alongside
        # self.modes during seed generation and dispatched back to during
        # chain refinement via Hypothesis.metadata['source_mode_name'].
        self.auxiliary_modes: List[BaseReasoningMode] = []

        if self.config.enable_xi_infinity:
            # Imported lazily so the base engine has no hard dependency
            # on the Xi^infinity module.
            from .xi_infinity import HiddenConstraintMode
            self.auxiliary_modes.append(HiddenConstraintMode())

        # Hooks for LLM integration (optional)
        self.llm_client = None

    def set_llm_client(self, client: Any):
        """Set LLM client for enhanced reasoning."""
        self.llm_client = client

    def solve(self, problem: Problem, initial_context: Optional[MCOPContext] = None) -> Solution:
        """
        Main entry point: solve a problem using M-COP protocol.

        Args:
            problem: The problem to solve
            initial_context: Optional pre-populated context

        Returns:
            Solution with reasoning chain and grounding
        """
        # Initialize context
        context = initial_context or MCOPContext(
            problem=problem,
            max_iterations=self.config.max_iterations,
            diversity_threshold=self.config.diversity_threshold,
            grounding_threshold=self.config.grounding_threshold,
            confidence_threshold=self.config.confidence_threshold
        )

        logger.info(f"M-COP solving: {problem.description[:50]}...")

        # Phase 1: Seed Generation
        seeds = self._generate_seeds(context)
        logger.info(f"Generated {len(seeds)} seed hypotheses")

        # Phase 2: Mycelial Chaining
        chains = self._build_chains(seeds, context)
        logger.info(f"Built {len(chains)} reasoning chains")

        # Phase 3: Intermediate Validation
        validated_chains = self._validate_chains(chains, context)
        logger.info(f"Validated {len(validated_chains)} chains")

        # Phase 4: Diversity Preservation
        diverse_chains = self._preserve_diversity(validated_chains, context)
        logger.info(f"Preserved {len(diverse_chains)} diverse chains")

        # Phase 5: Synthesis
        solution = self._synthesize_solution(diverse_chains, context)
        logger.info(f"Synthesized solution with confidence {solution.confidence:.2f}")

        # Phase 6: Epistemic Challenge (optional)
        if self.config.enable_epistemic_challenge:
            solution = self._epistemic_challenge(solution, context)

        return solution

    def _generate_seeds(self, context: MCOPContext) -> List[Hypothesis]:
        """
        Phase 1: Generate seed hypotheses using all reasoning modes.

        Each mode generates hypotheses from its perspective:
        - Causal: What mechanisms could explain this?
        - Structural: What patterns are present?
        - Selective: What constraints must be satisfied?
        - Compositional: What steps would solve this?

        Auxiliary modes (e.g. Xi^infinity) run alongside the built-ins
        and tag their seeds with ``metadata['source_mode_name']`` so the
        engine can route later refinement back to them.
        """
        all_seeds = []

        for mode_type, mode in self.modes.items():
            try:
                seeds = mode.generate_hypotheses(context.problem, context)
                for seed in seeds:
                    context.add_hypothesis(seed)
                    all_seeds.append(seed)

                if self.config.verbose:
                    logger.debug(f"{mode.mode_name} generated {len(seeds)} seeds")

            except Exception as e:
                logger.warning(f"Mode {mode.mode_name} failed: {e}")

        for mode in self.auxiliary_modes:
            try:
                seeds = mode.generate_hypotheses(context.problem, context)
                for seed in seeds:
                    seed.metadata.setdefault("source_mode_name", mode.mode_name)
                    context.add_hypothesis(seed)
                    all_seeds.append(seed)

                if self.config.verbose:
                    logger.debug(
                        f"{mode.mode_name} (auxiliary) generated {len(seeds)} seeds"
                    )

            except Exception as e:
                logger.warning(f"Auxiliary mode {mode.mode_name} failed: {e}")

        return all_seeds

    def _mode_for(self, hypothesis: Hypothesis) -> BaseReasoningMode:
        """Return the reasoning mode that should handle a hypothesis.

        Auxiliary modes take precedence when the hypothesis carries a
        matching ``metadata['source_mode_name']``; otherwise fall back
        to the built-in mode registered for ``hypothesis.mode``.
        """
        source_name = hypothesis.metadata.get("source_mode_name")
        if source_name:
            for aux in self.auxiliary_modes:
                if aux.mode_name == source_name:
                    return aux
        return self.modes[hypothesis.mode]

    def _build_chains(
        self,
        seeds: List[Hypothesis],
        context: MCOPContext
    ) -> List[ReasoningChain]:
        """
        Phase 2: Build mycelial chains through recursive refinement.

        Each seed hypothesis becomes the root of a reasoning chain.
        Chains grow through iterative refinement until:
        - Max depth reached
        - Confidence threshold met
        - Hypothesis pruned
        """
        chains = []

        for seed in seeds:
            chain = ReasoningChain(
                root_hypothesis_id=seed.id,
                max_depth=context.max_iterations
            )
            chain.add_hypothesis(seed)

            # Iteratively grow the chain
            current = seed
            for iteration in range(context.max_iterations):
                context.current_iteration = iteration

                # Get the appropriate mode for this hypothesis
                mode = self._mode_for(current)

                # Generate evidence (in production, this would query external sources)
                evidence = self._gather_evidence(current, context)

                # Refine hypothesis
                refined = mode.refine_hypothesis(current, evidence, context)

                # Evaluate
                confidence = mode.evaluate_hypothesis(refined, context)
                refined.confidence = confidence

                # Check for pruning
                if mode.should_prune(refined, context):
                    refined.state = EpistemicState.PRUNED
                    break

                # Check for completion
                if confidence >= context.confidence_threshold:
                    refined.state = EpistemicState.VALIDATED
                    chain.is_complete = True
                    break

                # Continue chain with child hypothesis
                child = self._spawn_child_hypothesis(refined, context)
                if child:
                    chain.add_hypothesis(child)
                    context.add_hypothesis(child)
                    current = child
                else:
                    break

            chains.append(chain)
            context.add_chain(chain)

        return chains

    def _gather_evidence(
        self,
        hypothesis: Hypothesis,
        context: MCOPContext
    ) -> List[Evidence]:
        """
        Gather evidence for a hypothesis.

        In production, this would:
        - Query databases
        - Call LLM for reasoning
        - Access external APIs

        For now, generates synthetic evidence based on hypothesis content.
        """
        evidence = []

        # Synthetic evidence generation
        # In production, replace with actual evidence gathering
        if hypothesis.iteration == 0:
            evidence.append(Evidence(
                content=f"Initial analysis of: {hypothesis.content[:50]}",
                source="internal_analysis",
                evidence_type="reasoning",
                weight=0.5
            ))
        else:
            evidence.append(Evidence(
                content=f"Refinement evidence for iteration {hypothesis.iteration}",
                source="chain_analysis",
                evidence_type="refinement",
                weight=0.6
            ))

        return evidence

    def _spawn_child_hypothesis(
        self,
        parent: Hypothesis,
        context: MCOPContext
    ) -> Optional[Hypothesis]:
        """
        Create a child hypothesis from a parent.

        The child may:
        - Continue in the same mode (deepen)
        - Switch modes (broaden)
        """
        mode = self._mode_for(parent)

        # Decide whether to switch modes
        if parent.confidence < 0.4 and parent.iteration > 2:
            # Low confidence after iterations - try different mode
            next_mode = self._select_alternative_mode(parent.mode)
            mode = self.modes[next_mode]

        child_metadata = {'parent_mode': parent.mode.name}
        # Preserve auxiliary-mode provenance through child hypotheses so
        # _mode_for() continues to route refinement to the same mode.
        if mode in self.auxiliary_modes:
            child_metadata['source_mode_name'] = mode.mode_name

        child = mode.create_hypothesis(
            content=f"Refined: {parent.content}",
            confidence=parent.confidence,
            parent=parent,
            metadata=child_metadata,
        )

        parent.children_ids.append(child.id)
        return child

    def _select_alternative_mode(self, current_mode: ReasoningMode) -> ReasoningMode:
        """Select an alternative reasoning mode."""
        mode_order = [
            ReasoningMode.CAUSAL,
            ReasoningMode.STRUCTURAL,
            ReasoningMode.SELECTIVE,
            ReasoningMode.COMPOSITIONAL
        ]

        current_idx = mode_order.index(current_mode)
        next_idx = (current_idx + 1) % len(mode_order)
        return mode_order[next_idx]

    def _validate_chains(
        self,
        chains: List[ReasoningChain],
        context: MCOPContext
    ) -> List[ReasoningChain]:
        """
        Phase 3: Validate chains against grounding threshold.

        Chains with insufficient grounding are marked but not discarded
        (diversity preservation may keep them).
        """
        for chain in chains:
            chain._update_total_grounding()

            if chain.total_grounding >= context.grounding_threshold:
                # Mark best hypothesis as validated
                best = max(
                    chain.get_active_hypotheses(),
                    key=lambda h: h.confidence,
                    default=None
                )
                if best:
                    best.state = EpistemicState.VALIDATED

        return chains

    def _preserve_diversity(
        self,
        chains: List[ReasoningChain],
        context: MCOPContext
    ) -> List[ReasoningChain]:
        """
        Phase 4: Preserve diverse hypotheses to prevent anchoring.

        Even if one chain dominates, keep alternatives that:
        - Represent different reasoning modes
        - Have non-trivial grounding
        - Offer orthogonal perspectives
        """
        if len(chains) <= self.config.min_alternatives:
            return chains

        # Sort by total grounding
        sorted_chains = sorted(
            chains,
            key=lambda c: c.total_grounding,
            reverse=True
        )

        # Always keep top chain
        preserved = [sorted_chains[0]]

        # Keep chains from different modes
        modes_seen = {sorted_chains[0].hypotheses[0].mode if sorted_chains[0].hypotheses else None}

        for chain in sorted_chains[1:]:
            if len(preserved) >= self.config.min_alternatives:
                # Check if this chain offers diversity
                if chain.hypotheses:
                    chain_mode = chain.hypotheses[0].mode
                    if chain_mode not in modes_seen:
                        preserved.append(chain)
                        modes_seen.add(chain_mode)
            else:
                preserved.append(chain)

        return preserved

    def _synthesize_solution(
        self,
        chains: List[ReasoningChain],
        context: MCOPContext
    ) -> Solution:
        """
        Phase 5: Synthesize final solution from reasoning chains.

        Combines insights from multiple chains into a coherent solution
        with proper grounding and confidence scores.
        """
        if not chains:
            return Solution(
                problem_id=context.problem.id,
                content="Unable to generate solution - no valid reasoning chains",
                confidence=0.0,
                grounding_index=0.0,
                key_uncertainties=["No valid hypotheses generated"]
            )

        # Get best chain
        best_chain = max(chains, key=lambda c: c.total_grounding)

        # Get best hypothesis from best chain
        best_hypotheses = best_chain.get_active_hypotheses()
        if not best_hypotheses:
            best_hypothesis = best_chain.hypotheses[0] if best_chain.hypotheses else None
        else:
            best_hypothesis = max(best_hypotheses, key=lambda h: h.confidence)

        # Collect all evidence
        all_evidence = []
        for chain in chains:
            for h in chain.hypotheses:
                all_evidence.extend(h.evidence)

        # Build solution content
        if best_hypothesis:
            solution_content = self._format_solution_content(best_hypothesis, chains)
        else:
            solution_content = "No conclusive solution found"

        # Calculate aggregate confidence and grounding
        avg_confidence = sum(c.total_grounding for c in chains) / len(chains)
        max_grounding = max(c.total_grounding for c in chains)

        # Build alternative solutions
        alternatives = []
        for chain in chains[1:]:  # Skip best chain
            active = chain.get_active_hypotheses()
            if active:
                alt_best = max(active, key=lambda h: h.confidence)
                alternatives.append(Solution(
                    problem_id=context.problem.id,
                    content=alt_best.content,
                    confidence=alt_best.confidence,
                    grounding_index=chain.total_grounding
                ))

        # Identify key uncertainties
        uncertainties = self._identify_uncertainties(chains, context)

        solution = Solution(
            problem_id=context.problem.id,
            content=solution_content,
            confidence=best_hypothesis.confidence if best_hypothesis else 0.0,
            grounding_index=max_grounding,
            reasoning_chains=chains,
            evidence_chain=all_evidence[:10],  # Top 10 evidence items
            alternative_solutions=alternatives[:3],  # Top 3 alternatives
            key_uncertainties=uncertainties
        )

        return solution

    def _format_solution_content(
        self,
        hypothesis: Hypothesis,
        chains: List[ReasoningChain]
    ) -> str:
        """Format the solution content from hypothesis and chains."""
        parts = [
            f"Solution: {hypothesis.content}",
            f"\nReasoning Mode: {hypothesis.mode.name}",
            f"Iterations: {hypothesis.iteration}",
            f"\nSupporting Evidence:"
        ]

        for i, e in enumerate(hypothesis.evidence[:5], 1):
            parts.append(f"  {i}. {e.content} (weight: {e.weight:.2f})")

        return "\n".join(parts)

    def _identify_uncertainties(
        self,
        chains: List[ReasoningChain],
        context: MCOPContext
    ) -> List[str]:
        """Identify key uncertainties in the reasoning."""
        uncertainties = []

        # Check for low grounding
        low_grounding = [c for c in chains if c.total_grounding < 0.5]
        if low_grounding:
            uncertainties.append(
                f"{len(low_grounding)} chains have grounding below 0.5"
            )

        # Check for pruned hypotheses
        pruned_count = sum(
            1 for c in chains
            for h in c.hypotheses
            if h.state == EpistemicState.PRUNED
        )
        if pruned_count > 0:
            uncertainties.append(
                f"{pruned_count} hypotheses were pruned during reasoning"
            )

        # Check for mode coverage
        modes_used = set()
        for c in chains:
            for h in c.hypotheses:
                modes_used.add(h.mode)

        missing_modes = set(ReasoningMode) - modes_used
        if missing_modes:
            uncertainties.append(
                f"Modes not explored: {[m.name for m in missing_modes]}"
            )

        return uncertainties

    def _epistemic_challenge(
        self,
        solution: Solution,
        context: MCOPContext
    ) -> Solution:
        """
        Phase 6: Challenge the solution epistemically.

        Ask: What could be wrong? What assumptions are we making?
        """
        challenges = []

        # Challenge confidence
        if solution.confidence > 0.9:
            challenges.append(
                "High confidence (>90%) - verify not overconfident"
            )

        # Challenge grounding
        if solution.grounding_index < 0.6:
            challenges.append(
                f"Grounding index {solution.grounding_index:.2f} is below 0.6 - "
                "consider gathering more evidence"
            )

        # Challenge alternatives
        if not solution.alternative_solutions:
            challenges.append(
                "No alternative solutions preserved - risk of anchoring bias"
            )

        # Add challenges to uncertainties
        solution.key_uncertainties.extend(challenges)

        return solution

    def add_mode(self, mode_type: ReasoningMode, mode: BaseReasoningMode):
        """Add or replace a reasoning mode."""
        self.modes[mode_type] = mode

    def get_mode(self, mode_type: ReasoningMode) -> BaseReasoningMode:
        """Get a reasoning mode by type."""
        return self.modes.get(mode_type)