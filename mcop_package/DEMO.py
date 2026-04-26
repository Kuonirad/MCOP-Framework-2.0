#!/usr/bin/env python3
"""
M-COP v3.1 Demonstration Script

This script demonstrates the key features of the M-COP reasoning system
across different domains.
"""

import sys
sys.path.insert(0, '..')

from mcop import MCOPEngine, MCOPConfig, Problem, Solution, solve
from mcop.domains import (
    GeneralDomainAdapter,
    MedicalDomainAdapter,
    ScientificDomainAdapter,
    PatientPresentation,
    ResearchQuestion
)
from mcop.index import GroundingAnalyzer, DomainGroundingFactory
from mcop.mycelial import MycelialChainBuilder, analyze_network


def demo_basic_usage():
    """Demonstrate basic M-COP usage."""
    print("\n" + "=" * 70)
    print("DEMO 1: Basic M-COP Usage")
    print("=" * 70)

    # Simple one-liner
    solution = solve("What are the main causes of economic inflation?")

    print(f"\nProblem: What are the main causes of economic inflation?")
    print(f"\nSolution: {solution.content[:200]}...")
    print(f"Confidence: {solution.confidence * 100:.1f}%")
    print(f"Grounding: {solution.grounding_index:.2f}")


def demo_medical_domain():
    """Demonstrate medical domain adapter."""
    print("\n" + "=" * 70)
    print("DEMO 2: Medical Domain - Differential Diagnosis")
    print("=" * 70)

    # Create medical adapter
    adapter = MedicalDomainAdapter()

    # Create patient presentation
    presentation = PatientPresentation(
        chief_complaint="Chest pain and shortness of breath",
        symptoms=["chest pain", "dyspnea", "fatigue", "palpitations"],
        vital_signs={
            "BP": "145/92",
            "HR": "98",
            "RR": "22",
            "SpO2": "94%",
            "Temp": "37.2C"
        },
        lab_results={
            "Troponin": "0.08 ng/mL (elevated)",
            "BNP": "450 pg/mL (elevated)",
            "D-dimer": "0.8 mg/L"
        },
        medical_history=["hypertension", "type 2 diabetes", "hyperlipidemia"],
        medications=["metformin", "lisinopril", "atorvastatin"]
    )

    # Create problem from presentation
    problem = adapter.create_patient_problem(presentation)

    # Solve
    solution = adapter.solve(problem)

    # Format as differential diagnosis
    report = adapter.format_differential_diagnosis(solution)
    print(report)


def demo_scientific_domain():
    """Demonstrate scientific domain adapter."""
    print("\n" + "=" * 70)
    print("DEMO 3: Scientific Domain - Research Hypothesis")
    print("=" * 70)

    # Create scientific adapter
    adapter = ScientificDomainAdapter()

    # Create research question
    question = ResearchQuestion(
        question="Why do anti-amyloid drugs fail in Alzheimer's clinical trials despite clearing plaques?",
        research_field="Neuroscience",
        subfield="Alzheimer's Disease",
        prior_work=[
            "Amyloid cascade hypothesis",
            "Failed Phase 3 trials of aducanumab",
            "Tau pathology studies"
        ],
        known_constraints=[
            "Blood-brain barrier penetration",
            "Late-stage intervention limitations",
            "Heterogeneous patient populations"
        ],
        available_methods=[
            "Animal models",
            "In vitro assays",
            "Clinical trial data analysis",
            "Biomarker studies"
        ]
    )

    # Create problem from research question
    problem = adapter.create_research_problem(question)

    # Solve
    solution = adapter.solve(problem)

    # Format as research proposal
    proposal = adapter.format_research_proposal(solution)
    print(proposal)


def demo_mycelial_chaining():
    """Demonstrate mycelial chaining system."""
    print("\n" + "=" * 70)
    print("DEMO 4: Mycelial Chaining - Hypothesis Network")
    print("=" * 70)

    from mcop.mcop_types import Hypothesis, ReasoningMode, MCOPContext

    # Create chain builder
    builder = MycelialChainBuilder(
        max_depth=5,
        max_branches=2,
        prune_threshold=0.25
    )

    # Create seed hypotheses
    seeds = [
        Hypothesis(
            content="Climate change is primarily driven by CO2 emissions",
            mode=ReasoningMode.CAUSAL,
            confidence=0.7
        ),
        Hypothesis(
            content="Deforestation amplifies warming effects",
            mode=ReasoningMode.STRUCTURAL,
            confidence=0.6
        ),
        Hypothesis(
            content="Feedback loops accelerate temperature rise",
            mode=ReasoningMode.COMPOSITIONAL,
            confidence=0.5
        )
    ]

    # Create context
    problem = Problem(description="What drives climate change?")
    context = MCOPContext(problem=problem)

    # Build network
    network = builder.build_network(seeds, context)

    # Analyze network
    stats = analyze_network(network)

    print(f"\nMycelial Network Statistics:")
    print(f"  Total nodes: {stats.total_nodes}")
    print(f"  Root hypotheses: {stats.total_roots}")
    print(f"  Maximum depth: {stats.max_depth}")
    print(f"  Average branch factor: {stats.avg_branch_factor:.2f}")
    print(f"  Pruned hypotheses: {stats.pruned_count}")
    print(f"  Validated hypotheses: {stats.validated_count}")
    print(f"  Cross-chain connections: {stats.connection_count}")
    print(f"  Mode distribution: {stats.mode_distribution}")

    # Get best path
    best_path = builder.get_best_path(network)
    print(f"\nBest reasoning path ({len(best_path)} steps):")
    for i, node in enumerate(best_path):
        print(f"  {i+1}. [{node.hypothesis.mode.name}] {node.hypothesis.content[:50]}...")
        print(f"      Confidence: {node.hypothesis.confidence:.2f}")


def demo_grounding_analysis():
    """Demonstrate grounding analysis."""
    print("\n" + "=" * 70)
    print("DEMO 5: Grounding Analysis")
    print("=" * 70)

    from mcop.mcop_types import Hypothesis, Evidence, ReasoningMode

    # Create hypothesis with evidence
    hypothesis = Hypothesis(
        content="Vaccination reduces COVID-19 mortality",
        mode=ReasoningMode.CAUSAL,
        confidence=0.85
    )

    # Add evidence of varying quality
    hypothesis.add_evidence(Evidence(
        content="Phase 3 RCT showing 95% efficacy",
        source="NEJM",
        evidence_type="randomized_controlled_trial",
        weight=1.0
    ))

    hypothesis.add_evidence(Evidence(
        content="Large cohort study with 500,000 participants",
        source="Lancet",
        evidence_type="cohort_study",
        weight=0.85
    ))

    hypothesis.add_evidence(Evidence(
        content="CDC surveillance data",
        source="CDC",
        evidence_type="observational_data",
        weight=0.75
    ))

    # Analyze grounding
    calculator = DomainGroundingFactory.get_calculator('medical')
    analyzer = GroundingAnalyzer(calculator)

    report = analyzer.analyze_hypothesis(hypothesis)

    print(f"\nGrounding Analysis Report:")
    print(f"  Subject: {report.subject_id}")
    print(f"  Grounding Index: {report.grounding_index:.2f}")

    print(f"\n  Evidence Breakdown:")
    for item in report.evidence_breakdown:
        print(f"    - {item['content']}")
        print(f"      Type: {item['type']}, Effective Weight: {item['effective_weight']:.2f}")

    print(f"\n  Strengths:")
    for strength in report.strengths:
        print(f"    ✓ {strength}")

    print(f"\n  Weaknesses:")
    for weakness in report.weaknesses:
        print(f"    ✗ {weakness}")

    print(f"\n  Recommendations:")
    for rec in report.recommendations:
        print(f"    → {rec}")


def demo_custom_config():
    """Demonstrate custom configuration."""
    print("\n" + "=" * 70)
    print("DEMO 6: Custom Configuration")
    print("=" * 70)

    # Create custom config
    config = MCOPConfig(
        max_iterations=15,
        max_hypotheses_per_mode=3,
        diversity_threshold=0.4,
        grounding_threshold=0.5,
        confidence_threshold=0.7,
        min_alternatives=3,
        enable_epistemic_challenge=True,
        verbose=True
    )

    # Create engine with custom config
    engine = MCOPEngine(config)

    print(f"\nCustom Configuration:")
    print(f"  Max iterations: {config.max_iterations}")
    print(f"  Hypotheses per mode: {config.max_hypotheses_per_mode}")
    print(f"  Diversity threshold: {config.diversity_threshold}")
    print(f"  Grounding threshold: {config.grounding_threshold}")
    print(f"  Confidence threshold: {config.confidence_threshold}")
    print(f"  Min alternatives: {config.min_alternatives}")
    print(f"  Epistemic challenge: {config.enable_epistemic_challenge}")

    # Solve with custom config
    problem = Problem(description="What is consciousness?")
    solution = engine.solve(problem)

    print(f"\nSolution with custom config:")
    print(f"  Content: {solution.content[:100]}...")
    print(f"  Confidence: {solution.confidence * 100:.1f}%")
    print(f"  Alternatives: {len(solution.alternative_solutions)}")
    print(f"  Uncertainties: {len(solution.key_uncertainties)}")


def main():
    """Run all demonstrations."""
    print("""
╔══════════════════════════════════════════════════════════════════════╗
║                     M-COP v3.1 DEMONSTRATION                         ║
║                 Meta-Cognitive Optimization Protocol                 ║
╚══════════════════════════════════════════════════════════════════════╝
    """)

    demos = [
        ("Basic Usage", demo_basic_usage),
        ("Medical Domain", demo_medical_domain),
        ("Scientific Domain", demo_scientific_domain),
        ("Mycelial Chaining", demo_mycelial_chaining),
        ("Grounding Analysis", demo_grounding_analysis),
        ("Custom Configuration", demo_custom_config),
    ]

    for name, demo_func in demos:
        try:
            demo_func()
        except Exception as e:
            print(f"\nError in {name} demo: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 70)
    print("DEMONSTRATION COMPLETE")
    print("=" * 70)


if __name__ == '__main__':
    main()