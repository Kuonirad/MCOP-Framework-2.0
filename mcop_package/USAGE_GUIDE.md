# M-COP v3.1 Complete Usage Guide

## Table of Contents
1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [Basic Usage](#basic-usage)
4. [Advanced Features](#advanced-features)
5. [Domain-Specific Usage](#domain-specific-usage)
6. [API Reference](#api-reference)
7. [Examples](#examples)

---

## Quick Start

### Installation

```bash
# From source
cd mcop_package
pip install -e .

# Or directly
python setup.py install
```

### Hello World

```python
from mcop import solve

solution = solve("What causes earthquakes?")
print(solution.content)
print(f"Confidence: {solution.confidence * 100:.1f}%")
```

---

## Core Concepts

### The M-COP Protocol

M-COP implements a 6-phase reasoning process:

1. **Seed Generation**: Generate multiple initial hypotheses using 4 reasoning modes
2. **Mycelial Chaining**: Recursively refine hypotheses like mycelium networks
3. **Intermediate Validation**: Continuously validate against evidence
4. **Diversity Preservation**: Maintain multiple perspectives
5. **Synthesis**: Combine best reasoning chains
6. **Epistemic Challenge**: Question assumptions and identify uncertainties

### Four Reasoning Modes

**CAUSAL** - Cause-effect, mechanistic reasoning
```python
# Example: "What causes X?" "Why does Y happen?"
ReasoningMode.CAUSAL
```

**STRUCTURAL** - Pattern recognition, architecture
```python
# Example: "What is the structure of X?" "How are parts related?"
ReasoningMode.STRUCTURAL
```

**SELECTIVE** - Filtering, constraint satisfaction
```python
# Example: "Which options satisfy constraints?" "What can be eliminated?"
ReasoningMode.SELECTIVE
```

**COMPOSITIONAL** - Multi-step synthesis
```python
# Example: "How do we combine X and Y?" "What is the protocol?"
ReasoningMode.COMPOSITIONAL
```

### Grounding Index

Evidence is weighted by quality:
- **1.0**: Verified facts, replicated experiments (RCTs in medical)
- **0.85**: Expert consensus, peer-reviewed studies
- **0.7**: Systematic observations, case studies
- **0.5**: Theoretical models, preliminary data
- **0.3**: Anecdotal evidence, speculation

---

## Basic Usage

### Simple Problem Solving

```python
from mcop import solve

# Ask any question
solution = solve("How do neural networks learn?")

# Access solution components
print(solution.content)           # The answer
print(solution.confidence)        # 0.0 - 1.0
print(solution.grounding_index)   # Evidence quality score
print(solution.alternative_solutions)  # Other valid approaches
print(solution.key_uncertainties)      # What's uncertain
```

### Using the Engine Directly

```python
from mcop import MCOPEngine, Problem

engine = MCOPEngine()
problem = Problem(
    description="Optimize database query performance",
    constraints=["Must maintain ACID properties", "Budget: $10k"]
)
solution = engine.solve(problem)
```

### Custom Configuration

```python
from mcop import MCOPEngine, MCOPConfig

config = MCOPConfig(
    max_iterations=15,           # More iterations = deeper reasoning
    confidence_threshold=0.8,    # Higher bar for solution quality
    min_alternatives=3,          # Keep more alternative solutions
    enable_epistemic_challenge=True  # Challenge assumptions
)

engine = MCOPEngine(config)
solution = engine.solve(problem)
```

---

## Advanced Features

### Working with Evidence

```python
from mcop import MCOPEngine, Problem, Evidence, MCOPContext

# Create problem
problem = Problem(description="Is coffee healthy?")
context = MCOPContext(problem=problem)

# Add external evidence
evidence = Evidence(
    content="Study shows coffee reduces heart disease risk",
    source="Journal of Medicine",
    evidence_type="randomized_controlled_trial",
    weight=1.0
)
context.evidence_pool.append(evidence)

# Solve with evidence
engine = MCOPEngine()
solution = engine.solve(problem, initial_context=context)
```

### Mycelial Chaining

```python
from mcop.mycelial import MycelialChainBuilder, analyze_network

# Build reasoning network
builder = MycelialChainBuilder(max_depth=5, branching_factor=3)
network = builder.build_network(seed_hypotheses, context)

# Analyze network structure
stats = analyze_network(network)
print(f"Total nodes: {stats.total_nodes}")
print(f"Max depth: {stats.max_depth}")
print(f"Average branching: {stats.average_branching:.2f}")

# Extract best reasoning path
best_path = builder.get_best_path(network)
```

### Grounding Analysis

```python
from mcop.index import GroundingCalculator, GroundingAnalyzer, MEDICAL_HIERARCHY

# Use domain-specific evidence hierarchy
calculator = GroundingCalculator(MEDICAL_HIERARCHY)
analyzer = GroundingAnalyzer()

# Analyze hypothesis grounding
report = analyzer.analyze_hypothesis(hypothesis)
print(f"Grounding: {report.grounding_index:.2f}")
for evidence_item in report.evidence_breakdown:
    print(f"  {evidence_item.content}: weight={evidence_item.weight}")
```

---

## Domain-Specific Usage

### General Domain

```python
from mcop.general import GeneralDomainAdapter

adapter = GeneralDomainAdapter()
solution = adapter.solve(Problem(description="How to optimize a website?"))
print(adapter.format_solution(solution))
```

### Medical Domain

```python
from mcop.medical import MedicalDomainAdapter, PatientPresentation

# Create patient presentation
presentation = PatientPresentation(
    chief_complaint="Chest pain",
    symptoms=["chest pain", "shortness of breath", "diaphoresis"],
    vital_signs={"BP": "160/100", "HR": 95, "Temp": 37.2},
    lab_results={"troponin": "elevated"}
)

# Generate differential diagnosis
adapter = MedicalDomainAdapter()
problem = adapter.create_patient_problem(presentation)
solution = adapter.solve(problem)

# Format as differential
print(adapter.format_differential_diagnosis(solution))
```

**Note**: Medical output includes disclaimer for educational purposes only.

### Scientific Domain

```python
from mcop.scientific import ScientificDomainAdapter, ResearchQuestion

# Define research question
question = ResearchQuestion(
    question="Why do some neurons fire synchronously?",
    research_field="Neuroscience",
    subfield="Computational Neuroscience",
    prior_work=["Buzsaki 2006", "Cardin 2009"]
)

# Generate hypotheses and experimental designs
adapter = ScientificDomainAdapter()
problem = adapter.create_research_problem(question)
solution = adapter.solve(problem)

print(adapter.format_research_proposal(solution))
```

---

## API Reference

### Core Classes

#### Problem
```python
Problem(
    description: str,           # Problem description
    domain: str = "general",    # Domain (general/medical/scientific)
    context: Dict = {},         # Additional context
    constraints: List[str] = [],  # Constraints
    success_criteria: List[str] = []  # Success criteria
)
```

#### Solution
```python
solution.content              # str: The answer
solution.confidence           # float: 0.0-1.0
solution.grounding_index      # float: Evidence quality
solution.evidence_chain       # List[Evidence]
solution.alternative_solutions  # List[Solution]
solution.key_uncertainties    # List[str]
solution.to_dict()            # Dict representation
```

#### MCOPEngine
```python
engine = MCOPEngine(config: Optional[MCOPConfig])
solution = engine.solve(
    problem: Problem,
    initial_context: Optional[MCOPContext] = None
)
```

#### MCOPConfig
```python
MCOPConfig(
    max_iterations: int = 10,
    confidence_threshold: float = 0.6,
    grounding_threshold: float = 0.4,
    diversity_threshold: float = 0.3,
    min_alternatives: int = 2,
    enable_epistemic_challenge: bool = True
)
```

---

## Examples

### Example 1: Technical Problem Solving

```python
from mcop import solve

solution = solve(
    "How to design a scalable microservices architecture?",
    domain="general"
)

print(f"Solution: {solution.content}\n")
print(f"Confidence: {solution.confidence * 100:.1f}%")
print(f"Grounding: {solution.grounding_index:.2f}\n")

print("Alternative Approaches:")
for i, alt in enumerate(solution.alternative_solutions, 1):
    print(f"{i}. {alt.content[:100]}...")

print("\nKey Uncertainties:")
for uncertainty in solution.key_uncertainties:
    print(f"  - {uncertainty}")
```

### Example 2: Medical Diagnosis

```python
from mcop.medical import MedicalDomainAdapter, PatientPresentation

adapter = MedicalDomainAdapter()

patient = PatientPresentation(
    chief_complaint="Fever and cough for 5 days",
    symptoms=["fever", "productive cough", "fatigue"],
    vital_signs={"Temp": 38.5, "HR": 95, "BP": "120/80"},
    lab_results={"WBC": "elevated", "CXR": "consolidation right lower lobe"}
)

problem = adapter.create_patient_problem(patient)
solution = adapter.solve(problem)

print(adapter.format_differential_diagnosis(solution))
```

### Example 3: Scientific Hypothesis Generation

```python
from mcop.scientific import ScientificDomainAdapter, ResearchQuestion

adapter = ScientificDomainAdapter()

question = ResearchQuestion(
    question="What mechanisms underlie long-term memory consolidation?",
    research_field="Neuroscience",
    subfield="Memory Systems"
)

problem = adapter.create_research_problem(question)
solution = adapter.solve(problem)

# Get hypotheses
print("Generated Hypotheses:")
for i, chain in enumerate(solution.reasoning_chains, 1):
    print(f"\nHypothesis {i}:")
    for hyp in chain.get_active_hypotheses():
        print(f"  - {hyp.content}")
        print(f"    Evidence: {len(hyp.evidence)} items")
        print(f"    Grounding: {hyp.grounding_index:.2f}")
```

### Example 4: Batch Processing

```python
from mcop import MCOPEngine, Problem

engine = MCOPEngine()

problems = [
    "How does photosynthesis work?",
    "What causes inflation?",
    "How to prevent SQL injection?"
]

solutions = []
for desc in problems:
    problem = Problem(description=desc)
    solution = engine.solve(problem)
    solutions.append(solution)
    print(f"Solved: {desc[:40]}... (conf: {solution.confidence:.2f})")

# Analyze batch results
avg_confidence = sum(s.confidence for s in solutions) / len(solutions)
print(f"\nAverage confidence: {avg_confidence:.2f}")
```

---

## Command Line Interface

```bash
# Solve a problem
mcop solve "What is quantum entanglement?"

# Use specific domain
mcop solve --domain medical "Patient with acute chest pain"

# Configure engine
mcop solve --max-iterations 20 --confidence-threshold 0.8 "Complex problem"

# Interactive mode
mcop interactive

# Run demo
python -m mcop.demo
```

---

## Best Practices

1. **Be Specific**: More specific problems yield better solutions
2. **Provide Context**: Use constraints and context for better results
3. **Use Appropriate Domain**: Choose medical/scientific when applicable
4. **Check Grounding**: Low grounding means more speculation
5. **Review Alternatives**: Alternative solutions often provide valuable perspectives
6. **Question Uncertainties**: Pay attention to key uncertainties identified

---

## Troubleshooting

### Low Confidence Solutions
- Increase `max_iterations`
- Add more evidence to context
- Simplify the problem
- Check if domain is appropriate

### No Alternative Solutions
- Lower `confidence_threshold`
- Increase `min_alternatives`
- Make problem less constrained

### Slow Performance
- Reduce `max_iterations`
- Decrease `max_hypotheses_per_mode`
- Use simpler reasoning modes

---

## Performance Tips

```python
# Fast configuration for simple problems
fast_config = MCOPConfig(
    max_iterations=5,
    max_hypotheses_per_mode=3
)

# Thorough configuration for complex problems
thorough_config = MCOPConfig(
    max_iterations=20,
    max_hypotheses_per_mode=7,
    min_alternatives=5
)

# Balanced default
balanced_config = MCOPConfig()  # Uses defaults
```

---

## Contributing

See CONTRIBUTING.md for guidelines on contributing to M-COP.

## License

Business Source License 1.1 (BUSL 1.1) — see the top-level LICENSE and NOTICE.md for the full terms, the Change Date, and the Additional Use Grant. Releases prior to 2026-04-26 remain available under MIT (see LICENSE-MIT-LEGACY).