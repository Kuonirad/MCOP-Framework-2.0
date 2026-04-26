#!/usr/bin/env python3
"""
M-COP v3.1 Demonstration Script

This script demonstrates all major features of the M-COP reasoning system.
"""

import sys
import os

# Add package to path
sys.path.insert(0, os.path.dirname(__file__))

from mcop import (
    solve, MCOPEngine, MCOPConfig, Problem,
    Evidence, MCOPContext, ReasoningMode
)
from mcop.general import GeneralDomainAdapter
from mcop.helpers import format_confidence, format_grounding, calculate_solution_quality


def print_section(title):
    """Print a section header."""
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70 + "\n")


def demo_1_simple_usage():
    """Demo 1: Simple usage with convenience function."""
    print_section("DEMO 1: Simple Usage")

    solution = solve("What causes ocean tides?")

    print("Question: What causes ocean tides?\n")
    print(f"Answer: {solution.content}\n")
    print(f"Confidence: {format_confidence(solution.confidence)}")
    print(f"Grounding: {format_grounding(solution.grounding_index)}")

    if solution.alternative_solutions:
        print("\nAlternative Perspectives:")
        for i, alt in enumerate(solution.alternative_solutions[:2], 1):
            print(f"  {i}. {alt.content[:80]}...")


def demo_2_engine_with_config():
    """Demo 2: Using engine with custom configuration."""
    print_section("DEMO 2: Custom Configuration")

    config = MCOPConfig(
        max_iterations=15,
        confidence_threshold=0.75,
        min_alternatives=3,
        enable_epistemic_challenge=True
    )

    engine = MCOPEngine(config)
    problem = Problem(
        description="How can we reduce carbon emissions?",
        constraints=["Must be economically viable", "Implementable within 10 years"]
    )

    solution = engine.solve(problem)

    print("Problem: How can we reduce carbon emissions?")
    print("Constraints:")
    for c in problem.constraints:
        print(f"  - {c}")

    print(f"\nSolution: {solution.content}\n")
    print(f"Confidence: {format_confidence(solution.confidence)}")
    print(f"Grounding: {format_grounding(solution.grounding_index)}")

    print(f"\nAlternatives Found: {len(solution.alternative_solutions)}")
    print(f"Uncertainties Identified: {len(solution.key_uncertainties)}")

    if solution.key_uncertainties:
        print("\nKey Uncertainties:")
        for unc in solution.key_uncertainties[:3]:
            print(f"  - {unc}")


def demo_3_evidence_integration():
    """Demo 3: Integrating external evidence."""
    print_section("DEMO 3: Evidence Integration")

    problem = Problem(description="Is intermittent fasting effective?")
    context = MCOPContext(problem=problem)

    # Add evidence
    evidence_items = [
        Evidence(
            content="Randomized trial shows 16:8 fasting improves insulin sensitivity",
            source="Journal of Clinical Endocrinology",
            evidence_type="randomized_controlled_trial",
            weight=1.0
        ),
        Evidence(
            content="Meta-analysis of 40 studies shows modest weight loss",
            source="Obesity Reviews",
            evidence_type="systematic_review",
            weight=0.95
        ),
        Evidence(
            content="Long-term compliance rates are low (40% at 1 year)",
            source="Nutritional Research",
            evidence_type="cohort_study",
            weight=0.7
        )
    ]

    for e in evidence_items:
        context.evidence_pool.append(e)

    print("Problem: Is intermittent fasting effective?")
    print(f"External Evidence Provided: {len(evidence_items)} items\n")

    engine = MCOPEngine()
    solution = engine.solve(problem, initial_context=context)

    print(f"Solution: {solution.content}\n")
    print(f"Confidence: {format_confidence(solution.confidence)}")
    print(f"Grounding: {format_grounding(solution.grounding_index)}")

    print("\nEvidence Chain:")
    for i, e in enumerate(solution.evidence_chain[:5], 1):
        print(f"  {i}. {e.content[:60]}... (weight: {e.weight:.2f})")


def demo_4_domain_adapter():
    """Demo 4: Using domain adapters."""
    print_section("DEMO 4: Domain Adapters")

    adapter = GeneralDomainAdapter()

    problem = Problem(
        description="Design a recommendation system for an e-commerce platform",
        constraints=[
            "Must handle 1M+ users",
            "Real-time recommendations",
            "Privacy-preserving"
        ]
    )

    print("Problem: Design a recommendation system")
    print("Domain: General Engineering\n")

    solution = adapter.solve(problem)

    # Calculate quality metrics
    quality = calculate_solution_quality(solution)

    print(f"Solution: {solution.content}\n")
    print(f"Quality Metrics:")
    print(f"  Confidence: {quality['confidence_score']:.2f}")
    print(f"  Grounding: {quality['grounding_score']:.2f}")
    print(f"  Composite Score: {quality['composite_score']:.2f}")
    print(f"  Quality Level: {quality['level']}")

    print(f"\nEvidence Count: {quality['evidence_count']}")
    print(f"Alternatives: {quality['alternatives_count']}")


def demo_5_reasoning_modes():
    """Demo 5: Understanding reasoning modes."""
    print_section("DEMO 5: Reasoning Modes")

    from mcop.base import CausalMode, StructuralMode, SelectiveMode, CompositionalMode

    problem = Problem(description="How to build a sustainable city?")
    context = MCOPContext(problem=problem)

    modes = {
        "CAUSAL": CausalMode(),
        "STRUCTURAL": StructuralMode(),
        "SELECTIVE": SelectiveMode(),
        "COMPOSITIONAL": CompositionalMode()
    }

    print("Problem: How to build a sustainable city?\n")
    print("Hypotheses Generated by Each Mode:\n")

    for mode_name, mode in modes.items():
        hypotheses = mode.generate_hypotheses(problem, context)
        print(f"{mode_name} Mode:")
        for i, h in enumerate(hypotheses[:2], 1):
            print(f"  {i}. {h.content[:65]}...")
        print()


def demo_6_batch_processing():
    """Demo 6: Batch problem solving."""
    print_section("DEMO 6: Batch Processing")

    problems = [
        "Why do birds migrate?",
        "How does blockchain work?",
        "What causes volcanic eruptions?"
    ]

    engine = MCOPEngine()
    results = []

    print("Solving Multiple Problems:\n")

    for desc in problems:
        problem = Problem(description=desc)
        solution = engine.solve(problem)
        results.append((desc, solution))
        print(f"✓ {desc}")
        print(f"  Confidence: {solution.confidence:.2f}, Grounding: {solution.grounding_index:.2f}")

    # Summary statistics
    avg_confidence = sum(s.confidence for _, s in results) / len(results)
    avg_grounding = sum(s.grounding_index for _, s in results) / len(results)

    print(f"\nBatch Statistics:")
    print(f"  Average Confidence: {avg_confidence:.2f}")
    print(f"  Average Grounding: {avg_grounding:.2f}")
    print(f"  Problems Solved: {len(results)}")


def main():
    """Run all demonstrations."""
    print("\n" + "█"*70)
    print("█" + " "*22 + "M-COP v3.1 DEMO" + " "*23 + "█")
    print("█" + " "*12 + "Meta-Cognitive Optimization Protocol" + " "*12 + "█")
    print("█"*70)

    try:
        demo_1_simple_usage()
        demo_2_engine_with_config()
        demo_3_evidence_integration()
        demo_4_domain_adapter()
        demo_5_reasoning_modes()
        demo_6_batch_processing()

        print_section("DEMO COMPLETE")
        print("All demonstrations completed successfully!")
        print("\nFor more examples, see USAGE_GUIDE.md")
        print("For API documentation, see README.md")

    except Exception as e:
        print(f"\n❌ Error during demo: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())