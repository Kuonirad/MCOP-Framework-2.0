# M-COP v3.1 API Reference

## Core Module (`mcop`)

### Quick Access Functions

#### `solve(description, domain='general', **kwargs) -> Solution`
Convenience function for quick problem solving.

**Parameters:**
- `description` (str): Problem description
- `domain` (str): Domain type - 'general', 'medical', or 'scientific'
- `**kwargs`: Additional Problem parameters

**Returns:** `Solution` object

**Example:**
```python
solution = solve("What is quantum entanglement?")
```

---

## Core Types (`mcop.mcop_types`)

### Problem
Problem representation for M-COP processing.

**Attributes:**
- `id` (str): Unique identifier
- `description` (str): Problem description
- `domain` (str): Domain category
- `context` (Dict): Additional context information
- `constraints` (List[str]): Problem constraints
- `success_criteria` (List[str]): Success criteria
- `metadata` (Dict): Additional metadata

**Methods:**
```python
Problem(description="...", domain="general", constraints=[], ...)
```

---

### Solution
Solution produced by M-COP.

**Attributes:**
- `id` (str): Unique identifier
- `problem_id` (str): Associated problem ID
- `content` (str): Solution content
- `confidence` (float): Confidence score (0-1)
- `grounding_index` (float): Evidence quality (0-1)
- `reasoning_chains` (List[ReasoningChain]): Reasoning paths
- `evidence_chain` (List[Evidence]): Supporting evidence
- `alternative_solutions` (List[Solution]): Alternative approaches
- `key_uncertainties` (List[str]): Identified uncertainties
- `metadata` (Dict): Additional metadata

**Methods:**
```python
solution.to_dict() -> Dict  # Convert to dictionary
```

---

### Hypothesis
Individual hypothesis in reasoning process.

**Attributes:**
- `id` (str): Unique identifier
- `content` (str): Hypothesis content
- `mode` (ReasoningMode): Reasoning mode used
- `state` (EpistemicState): Current state
- `confidence` (float): Confidence level (0-1)
- `grounding_index` (float): Evidence quality (0-1)
- `evidence` (List[Evidence]): Supporting evidence
- `parent_id` (str): Parent hypothesis ID
- `children_ids` (List[str]): Child hypothesis IDs
- `iteration` (int): Iteration number
- `metadata` (Dict): Additional metadata

**Methods:**
```python
hypothesis.add_evidence(evidence)  # Add evidence and update grounding
```

---

### Evidence
Evidence supporting or refuting hypotheses.

**Attributes:**
- `id` (str): Unique identifier
- `content` (str): Evidence content
- `source` (str): Evidence source
- `evidence_type` (str): Type of evidence
- `weight` (float): Evidence weight (0-1)
- `timestamp` (datetime): Creation timestamp
- `metadata` (Dict): Additional metadata

---

### ReasoningChain
Chain of related hypotheses.

**Attributes:**
- `id` (str): Unique identifier
- `hypotheses` (List[Hypothesis]): Chain hypotheses
- `root_hypothesis_id` (str): Root hypothesis ID
- `depth` (int): Chain depth
- `max_depth` (int): Maximum allowed depth
- `is_complete` (bool): Completion status
- `final_synthesis` (str): Final synthesis
- `total_grounding` (float): Aggregate grounding

**Methods:**
```python
chain.add_hypothesis(hypothesis)
chain.get_active_hypotheses() -> List[Hypothesis]
```

---

### MCOPContext
Complete context for M-COP session.

**Attributes:**
- `problem` (Problem): Problem being solved
- `hypotheses` (Dict[str, Hypothesis]): All hypotheses
- `chains` (Dict[str, ReasoningChain]): All chains
- `evidence_pool` (List[Evidence]): Evidence pool
- `current_iteration` (int): Current iteration
- `max_iterations` (int): Maximum iterations
- `diversity_threshold` (float): Diversity threshold
- `grounding_threshold` (float): Grounding threshold
- `confidence_threshold` (float): Confidence threshold

**Methods:**
```python
context.add_hypothesis(hypothesis) -> str
context.add_chain(chain) -> str
context.get_hypothesis(id) -> Optional[Hypothesis]
context.get_active_hypotheses() -> List[Hypothesis]
```

---

### Enums

#### ReasoningMode
```python
ReasoningMode.CAUSAL          # Cause-effect reasoning
ReasoningMode.STRUCTURAL      # Pattern recognition
ReasoningMode.SELECTIVE       # Filtering/pruning
ReasoningMode.COMPOSITIONAL   # Multi-step synthesis
```

#### EpistemicState
```python
EpistemicState.SEED          # Initial hypothesis
EpistemicState.GROWING       # Being developed
EpistemicState.VALIDATED     # Passed validation
EpistemicState.PRUNED        # Eliminated
EpistemicState.SYNTHESIZED   # Merged into solution
```

---

## Engine Module (`mcop.engine`)

### MCOPEngine
Main reasoning engine.

**Constructor:**
```python
MCOPEngine(config: Optional[MCOPConfig] = None)
```

**Methods:**
```python
engine.solve(
    problem: Problem,
    initial_context: Optional[MCOPContext] = None
) -> Solution
```

**Attributes:**
- `config` (MCOPConfig): Engine configuration
- `modes` (Dict[ReasoningMode, BaseReasoningMode]): Reasoning modes
- `llm_client` (Any): Optional LLM client

---

### MCOPConfig
Engine configuration.

**Parameters:**
- `max_iterations` (int): Maximum reasoning iterations (default: 10)
- `max_hypotheses_per_mode` (int): Max hypotheses per mode (default: 5)
- `diversity_threshold` (float): Diversity preservation threshold (default: 0.3)
- `grounding_threshold` (float): Minimum grounding required (default: 0.4)
- `confidence_threshold` (float): Minimum confidence required (default: 0.6)
- `min_alternatives` (int): Minimum alternative solutions (default: 2)
- `enable_epistemic_challenge` (bool): Enable assumption questioning (default: True)
- `verbose` (bool): Verbose logging (default: False)

**Example:**
```python
config = MCOPConfig(
    max_iterations=15,
    confidence_threshold=0.8,
    min_alternatives=3
)
```

---

## Reasoning Modes (`mcop.base`)

### BaseReasoningMode
Abstract base for all reasoning modes.

**Methods:**
```python
mode.generate_hypotheses(problem, context) -> List[Hypothesis]
mode.refine_hypothesis(hypothesis, evidence, context) -> Hypothesis
mode.evaluate_hypothesis(hypothesis, context) -> float
```

### CausalMode
Cause-effect, mechanistic reasoning.

### StructuralMode
Pattern recognition and architectural analysis.

### SelectiveMode
Filtering and constraint satisfaction.

### CompositionalMode
Multi-step synthesis and protocol building.

### HiddenConstraintMode (Ξ^∞ extension)
Opt-in "non-obvious-angle" reasoning mode.  Seeds hypotheses that
deliberately step outside the obvious search space by negating implicit
assumptions, flagging phase-transition thresholds, inverting the
actor/environment frame, and importing structural lenses from unrelated
donor domains.

Registered under `ReasoningMode.SELECTIVE` as an **auxiliary** mode
(see `MCOPEngine.auxiliary_modes`), so it runs alongside the built-in
`SelectiveMode` instead of replacing it.

```python
from mcop import MCOPEngine, MCOPConfig, Problem

engine = MCOPEngine(MCOPConfig(
    enable_xi_infinity=True,   # opt-in flag
    max_iterations=15,
    min_alternatives=5,
    diversity_threshold=0.5,
))
problem = Problem(
    description="Design a fair and rapid vaccine distribution system.",
    context={"hidden_constraint_hints": [
        "the unit of fairness is the individual, not the community",
    ]},
)
solution = engine.solve(problem)
```

Each Ξ^∞ hypothesis carries `metadata['xi_infinity_move']` with one of:
`meta_questioning`, `phase_transition`, `perspective_reversal`,
`distant_analogy`.  Refinement of auxiliary-mode seeds is routed back
to the mode via `metadata['source_mode_name']`.

---

## Mycelial Chaining (`mcop.mycelial`)

### MycelialChainBuilder
Builds mycelial reasoning networks.

**Constructor:**
```python
MycelialChainBuilder(
    max_depth: int = 5,
    branching_factor: int = 2,
    min_grounding: float = 0.3
)
```

**Methods:**
```python
builder.build_network(seeds, context) -> MycelialNetwork
builder.extract_chains(network) -> List[ReasoningChain]
builder.get_best_path(network) -> List[Hypothesis]
```

### MycelialNetwork
Network of interconnected hypotheses.

**Attributes:**
- `roots` (List[ChainNode]): Root nodes
- `nodes` (Dict[str, ChainNode]): All nodes
- `connections` (List[Tuple]): Cross-links

**Methods:**
```python
network.add_root(hypothesis)
network.add_child(parent_id, child_hypothesis)
network.add_connection(node_id_1, node_id_2)
```

### analyze_network(network) -> NetworkStats
Analyze network structure and statistics.

---

## Grounding System (`mcop.index`)

### GroundingCalculator
Calculate evidence grounding scores.

**Constructor:**
```python
GroundingCalculator(hierarchy: Optional[EvidenceHierarchy] = None)
```

**Methods:**
```python
calculator.calculate_hypothesis_grounding(hypothesis) -> float
calculator.calculate_chain_grounding(chain) -> float
```

### GroundingAnalyzer
Analyze grounding quality.

**Methods:**
```python
analyzer.analyze_hypothesis(hypothesis) -> GroundingReport
analyzer.analyze_solution(solution) -> GroundingReport
```

### Evidence Hierarchies
Predefined evidence hierarchies:

```python
GENERAL_HIERARCHY      # General reasoning
MEDICAL_HIERARCHY      # Medical evidence
SCIENTIFIC_HIERARCHY   # Scientific research
```

**Structure:**
```python
EvidenceHierarchy(
    domain="medical",
    hierarchy={
        "randomized_controlled_trial": 1.0,
        "systematic_review": 0.95,
        "cohort_study": 0.7,
        "case_report": 0.5,
        ...
    }
)
```

---

## Domain Adapters

### BaseDomainAdapter
Abstract base for domain adapters.

**Methods:**
```python
adapter.solve(problem) -> Solution
adapter.preprocess_problem(problem) -> Problem
adapter.postprocess_solution(solution, problem) -> Solution
adapter.format_solution(solution) -> str
```

### GeneralDomainAdapter
General-purpose problem solving.

```python
from mcop.general import GeneralDomainAdapter

adapter = GeneralDomainAdapter()
solution = adapter.solve(problem)
```

### MedicalDomainAdapter
Medical diagnosis and treatment planning.

```python
from mcop.medical import MedicalDomainAdapter, PatientPresentation

adapter = MedicalDomainAdapter()
presentation = PatientPresentation(
    chief_complaint="...",
    symptoms=[...],
    vital_signs={...}
)
problem = adapter.create_patient_problem(presentation)
solution = adapter.solve(problem)
```

### GovernanceDomainAdapter
Public-policy / institutional-design problems, with Ξ^∞ enabled by
default.  Installs `GOVERNANCE_HIERARCHY` (peer-reviewed policy
analysis > news reporting > opinion editorial > anecdote), bumps
`max_iterations`/`min_alternatives` so divergent policy options
survive, and injects governance-flavoured hidden-constraint hints
during `preprocess_problem`.

```python
from mcop import Problem
from mcop.governance import GovernanceDomainAdapter

adapter = GovernanceDomainAdapter()
problem = Problem(
    description="Design a fair and rapid vaccine distribution system.",
    constraints=["budget capped at $20M"],
    success_criteria=["maximise equity across regions"],
)
solution = adapter.solve(problem)
solution.metadata["xi_infinity_alternatives"]  # non-obvious branches
```

### ScientificDomainAdapter
Scientific research and hypothesis generation.

```python
from mcop.scientific import ScientificDomainAdapter, ResearchQuestion

adapter = ScientificDomainAdapter()
question = ResearchQuestion(
    question="...",
    research_field="...",
    subfield="..."
)
problem = adapter.create_research_problem(question)
solution = adapter.solve(problem)
```

---

## Helper Utilities (`mcop.helpers`)

### Formatting Functions

```python
format_confidence(confidence: float) -> str
format_grounding(grounding: float) -> str
truncate_text(text: str, max_length: int = 50) -> str
```

### Data Conversion

```python
create_evidence_from_dict(data: Dict) -> Evidence
```

### Import/Export

```python
export_solution_to_json(solution: Solution, filepath: str)
import_problem_from_json(filepath: str) -> Problem
```

### Quality Metrics

```python
calculate_solution_quality(solution: Solution) -> Dict
# Returns:
# {
#     'confidence_score': float,
#     'grounding_score': float,
#     'evidence_count': int,
#     'alternatives_count': int,
#     'uncertainties_count': int,
#     'composite_score': float,
#     'level': str  # 'Excellent', 'Good', 'Fair', 'Needs Improvement'
# }
```

---

## Type Hints

All functions and methods include comprehensive type hints:

```python
from typing import List, Dict, Any, Optional, Callable

def solve(
    description: str,
    domain: str = "general",
    **kwargs
) -> Solution:
    ...
```

---

## Error Handling

M-COP uses standard Python exceptions:

```python
try:
    solution = solve("Complex problem")
except ValueError as e:
    print(f"Invalid input: {e}")
except Exception as e:
    print(f"Error during reasoning: {e}")
```

---

## Logging

Configure logging for debugging:

```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('mcop')
```

Log levels:
- `INFO`: High-level progress
- `DEBUG`: Detailed reasoning steps
- `WARNING`: Potential issues
- `ERROR`: Errors during processing

---

## Extension Points

### Custom Reasoning Modes

```python
from mcop.base import BaseReasoningMode
from mcop import ReasoningMode

class CustomMode(BaseReasoningMode):
    mode_type = ReasoningMode.CAUSAL
    mode_name = "Custom"

    def generate_hypotheses(self, problem, context):
        # Your implementation
        pass
```

### Custom Domain Adapters

```python
from mcop.domain_base import BaseDomainAdapter, DomainConfig

class MyDomainAdapter(BaseDomainAdapter):
    def _default_config(self):
        return DomainConfig(name="my_domain", ...)

    def preprocess_problem(self, problem):
        # Your preprocessing
        return problem
```

### Custom Evidence Hierarchies

```python
from mcop.index import EvidenceHierarchy

MY_HIERARCHY = EvidenceHierarchy(
    domain="my_domain",
    hierarchy={
        "gold_standard": 1.0,
        "validated": 0.8,
        "preliminary": 0.5
    }
)
```

---

## Performance Considerations

- **Iterations**: More iterations = deeper reasoning but slower
- **Hypotheses per mode**: More hypotheses = broader exploration but slower
- **Mycelial depth**: Deeper networks = more refinement but slower
- **Evidence pool size**: More evidence = better grounding but more processing

**Fast Configuration:**
```python
MCOPConfig(max_iterations=5, max_hypotheses_per_mode=3)
```

**Thorough Configuration:**
```python
MCOPConfig(max_iterations=20, max_hypotheses_per_mode=7)
```

---

For more examples, see [USAGE_GUIDE.md](USAGE_GUIDE.md)