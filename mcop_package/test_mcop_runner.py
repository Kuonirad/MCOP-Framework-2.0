#!/usr/bin/env python3
"""
M-COP v3.1 Test Suite Runner

Comprehensive tests for the M-COP reasoning system.
"""

import sys
import os

# Add package to path
sys.path.insert(0, os.path.dirname(__file__))

import unittest
from mcop import (
    MCOPEngine, MCOPConfig, Problem, Solution,
    Hypothesis, Evidence, ReasoningChain, MCOPContext,
    ReasoningMode, EpistemicState, solve
)
from mcop.base import CausalMode, StructuralMode, SelectiveMode, CompositionalMode
from mcop.mycelial import MycelialChainBuilder, MycelialNetwork, analyze_network
from mcop.index import (
    GroundingCalculator, GroundingAnalyzer,
    MEDICAL_HIERARCHY, SCIENTIFIC_HIERARCHY
)
from mcop.general import GeneralDomainAdapter
from mcop.medical import MedicalDomainAdapter, PatientPresentation
from mcop.scientific import ScientificDomainAdapter
from mcop.helpers import truncate_text


class TestCoreTypes(unittest.TestCase):
    """Test core data types."""

    def test_evidence_creation(self):
        """Test Evidence creation and properties."""
        evidence = Evidence(
            content="Test evidence",
            source="test_source",
            evidence_type="test_type",
            weight=0.8
        )

        self.assertEqual(evidence.content, "Test evidence")
        self.assertEqual(evidence.source, "test_source")
        self.assertEqual(evidence.weight, 0.8)
        self.assertIsNotNone(evidence.id)

    def test_hypothesis_creation(self):
        """Test Hypothesis creation and evidence addition."""
        hypothesis = Hypothesis(
            content="Test hypothesis",
            mode=ReasoningMode.CAUSAL,
            confidence=0.6
        )

        self.assertEqual(hypothesis.content, "Test hypothesis")
        self.assertEqual(hypothesis.mode, ReasoningMode.CAUSAL)
        self.assertEqual(hypothesis.confidence, 0.6)
        self.assertEqual(hypothesis.state, EpistemicState.SEED)

        # Add evidence
        evidence = Evidence(content="Supporting evidence", weight=0.7)
        hypothesis.add_evidence(evidence)

        self.assertEqual(len(hypothesis.evidence), 1)
        self.assertGreater(hypothesis.grounding_index, 0)

    def test_reasoning_chain(self):
        """Test ReasoningChain operations."""
        chain = ReasoningChain()

        h1 = Hypothesis(content="First", confidence=0.5)
        h2 = Hypothesis(content="Second", confidence=0.6)

        chain.add_hypothesis(h1)
        chain.add_hypothesis(h2)

        self.assertEqual(len(chain.hypotheses), 2)
        self.assertEqual(len(chain.get_active_hypotheses()), 2)

        # Prune one
        h1.state = EpistemicState.PRUNED
        self.assertEqual(len(chain.get_active_hypotheses()), 1)

    def test_problem_creation(self):
        """Test Problem creation."""
        problem = Problem(
            description="Test problem",
            domain="test",
            constraints=["constraint1", "constraint2"]
        )

        self.assertEqual(problem.description, "Test problem")
        self.assertEqual(problem.domain, "test")
        self.assertEqual(len(problem.constraints), 2)

    def test_mcop_context(self):
        """Test MCOPContext operations."""
        problem = Problem(description="Test")
        context = MCOPContext(problem=problem)

        h = Hypothesis(content="Test hypothesis")
        h_id = context.add_hypothesis(h)

        self.assertEqual(context.get_hypothesis(h_id), h)
        self.assertEqual(len(context.get_active_hypotheses()), 1)


class TestReasoningModes(unittest.TestCase):
    """Test reasoning modes."""

    def setUp(self):
        self.problem = Problem(description="Test problem because of something")
        self.context = MCOPContext(problem=self.problem)

    def test_causal_mode(self):
        """Test CausalMode hypothesis generation."""
        mode = CausalMode()
        hypotheses = mode.generate_hypotheses(self.problem, self.context)

        self.assertGreater(len(hypotheses), 0)
        self.assertEqual(hypotheses[0].mode, ReasoningMode.CAUSAL)

    def test_structural_mode(self):
        """Test StructuralMode hypothesis generation."""
        mode = StructuralMode()
        hypotheses = mode.generate_hypotheses(self.problem, self.context)

        self.assertGreater(len(hypotheses), 0)
        self.assertEqual(hypotheses[0].mode, ReasoningMode.STRUCTURAL)

    def test_selective_mode(self):
        """Test SelectiveMode hypothesis generation."""
        mode = SelectiveMode()
        hypotheses = mode.generate_hypotheses(self.problem, self.context)

        self.assertGreater(len(hypotheses), 0)
        self.assertEqual(hypotheses[0].mode, ReasoningMode.SELECTIVE)

    def test_compositional_mode(self):
        """Test CompositionalMode hypothesis generation."""
        mode = CompositionalMode()
        hypotheses = mode.generate_hypotheses(self.problem, self.context)

        self.assertGreater(len(hypotheses), 0)
        self.assertEqual(hypotheses[0].mode, ReasoningMode.COMPOSITIONAL)


class TestMCOPEngine(unittest.TestCase):
    """Test the main M-COP engine."""

    def test_engine_creation(self):
        """Test engine creation with default config."""
        engine = MCOPEngine()

        self.assertIsNotNone(engine.config)
        self.assertEqual(len(engine.modes), 4)

    def test_engine_custom_config(self):
        """Test engine with custom config."""
        config = MCOPConfig(
            max_iterations=5,
            confidence_threshold=0.8
        )
        engine = MCOPEngine(config)

        self.assertEqual(engine.config.max_iterations, 5)
        self.assertEqual(engine.config.confidence_threshold, 0.8)

    def test_engine_solve(self):
        """Test basic problem solving."""
        engine = MCOPEngine()
        problem = Problem(description="What causes rain?")

        solution = engine.solve(problem)

        self.assertIsInstance(solution, Solution)
        self.assertIsNotNone(solution.content)
        self.assertGreaterEqual(solution.confidence, 0.0)
        self.assertLessEqual(solution.confidence, 1.0)


class TestConvenienceFunction(unittest.TestCase):
    """Test convenience solve function."""

    def test_solve_general(self):
        """Test solve with general domain."""
        solution = solve("What is 2+2?")

        self.assertIsInstance(solution, Solution)

    def test_solve_with_config(self):
        """Test that solve returns valid solution."""
        solution = solve("Simple test problem")

        self.assertIsInstance(solution, Solution)
        self.assertIsNotNone(solution.content)


class TestHelpers(unittest.TestCase):
    """Test helper functions."""

    def test_truncate_text(self):
        """Test text truncation."""
        # Shorter than max_length
        text = "short text"
        self.assertEqual(truncate_text(text, 20), text)

        # Exactly max_length
        text = "exactly ten!"
        self.assertEqual(truncate_text(text, 12), text)

        # Longer than max_length
        text = "this is a very long text that needs truncation"
        self.assertEqual(truncate_text(text, 20), "this is a very lo...")

        # Custom suffix
        self.assertEqual(truncate_text(text, 20, "!!!"), "this is a very lo!!!")

        # Edge cases: max_length < suffix length
        self.assertEqual(truncate_text("long text", 2), "..")
        self.assertEqual(truncate_text("long text", 3), "...")


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestCoreTypes))
    suite.addTests(loader.loadTestsFromTestCase(TestReasoningModes))
    suite.addTests(loader.loadTestsFromTestCase(TestMCOPEngine))
    suite.addTests(loader.loadTestsFromTestCase(TestConvenienceFunction))
    suite.addTests(loader.loadTestsFromTestCase(TestHelpers))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return result


if __name__ == '__main__':
    print("="*70)
    print("M-COP v3.1 Test Suite")
    print("="*70)
    result = run_tests()
    print("\n" + "="*70)
    if result.wasSuccessful():
        print("✓ ALL TESTS PASSED")
    else:
        print(f"✗ {len(result.failures)} FAILED, {len(result.errors)} ERRORS")
    print("="*70)
    sys.exit(0 if result.wasSuccessful() else 1)