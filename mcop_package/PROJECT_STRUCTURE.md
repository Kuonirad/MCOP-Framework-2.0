# M-COP v3.1 Project Structure

## Overview
This document describes the complete structure and organization of the M-COP (Meta-Cognitive Optimization Protocol) v3.1 reasoning system.

## Directory Structure

```
mcop_package/
├── README.md                  # Main documentation
├── USAGE_GUIDE.md            # Comprehensive usage guide
├── API_REFERENCE.md          # Complete API documentation
├── PROJECT_STRUCTURE.md      # This file
├── setup.py                  # Installation script
├── test_mcop_runner.py       # Test suite runner
├── DEMO.py                   # Demonstration script
│
└── mcop/                     # Main package
    ├── __init__.py           # Package initialization and exports
    ├── __main__.py           # CLI entry point
    │
    ├── mcop_types.py         # Core type definitions
    ├── engine.py             # Main M-COP engine
    ├── base.py               # Reasoning mode base classes
    ├── mycelial.py           # Mycelial chaining system
    ├── index.py              # Grounding/evidence system
    │
    ├── domain_base.py        # Domain adapter base classes
    ├── general.py            # General domain adapter
    ├── medical.py            # Medical domain adapter
    ├── scientific.py         # Scientific domain adapter
    │
    ├── helpers.py            # Utility functions
    ├── cli.py                # Command-line interface
    └── demo.py               # Demo utilities
```

## Module Descriptions

### Core Modules

#### `mcop_types.py`
Fundamental data structures:
- `Problem`: Problem representation
- `Solution`: Solution with reasoning chain
- `Hypothesis`: Individual hypothesis
- `Evidence`: Supporting/refuting evidence
- `ReasoningChain`: Chain of hypotheses
- `MCOPContext`: Complete session context
- `ReasoningMode`: Enum for reasoning modes
- `EpistemicState`: Enum for hypothesis states

#### `engine.py`
Main orchestration engine:
- `MCOPEngine`: Core reasoning engine
- `MCOPConfig`: Engine configuration
- Implements 6-phase M-COP protocol
- Stateless execution harness pattern

#### `base.py`
Reasoning mode implementations:
- `BaseReasoningMode`: Abstract base class
- `CausalMode`: Cause-effect reasoning
- `StructuralMode`: Pattern recognition
- `SelectiveMode`: Filtering/pruning
- `CompositionalMode`: Multi-step synthesis

#### `mycelial.py`
Recursive hypothesis refinement:
- `MycelialChainBuilder`: Builds reasoning networks
- `MycelialNetwork`: Network of hypotheses
- `ChainNode`: Individual network node
- `analyze_network()`: Network analysis

#### `index.py`
Evidence grounding system:
- `GroundingCalculator`: Calculate grounding scores
- `GroundingAnalyzer`: Analyze evidence quality
- `EvidenceHierarchy`: Domain evidence hierarchies
- Predefined hierarchies: GENERAL, MEDICAL, SCIENTIFIC

### Domain Adapters

#### `domain_base.py`
Base classes for domain adaptation:
- `BaseDomainAdapter`: Abstract base class
- `DomainConfig`: Domain configuration

#### `general.py`
General-purpose reasoning adapter

#### `medical.py`
Medical diagnosis and treatment:
- `MedicalDomainAdapter`
- `PatientPresentation`: Structured patient data
- Differential diagnosis generation

#### `scientific.py`
Scientific research and hypothesis generation:
- `ScientificDomainAdapter`
- `ResearchQuestion`: Structured research question
- Experimental design suggestions

### Utilities

#### `helpers.py`
Utility functions:
- Formatting functions
- Data conversion
- Import/export
- Quality metrics

#### `cli.py`
Command-line interface:
- Argument parsing
- Interactive mode
- Problem solving interface

## Data Flow

```
User Input (Problem)
        ↓
    [Engine]
        ↓
Phase 1: Seed Generation (4 modes generate hypotheses)
        ↓
Phase 2: Mycelial Chaining (recursive refinement)
        ↓
Phase 3: Intermediate Validation (evidence grounding)
        ↓
Phase 4: Diversity Preservation (maintain alternatives)
        ↓
Phase 5: Synthesis (combine best chains)
        ↓
Phase 6: Epistemic Challenge (question assumptions)
        ↓
    Solution (with confidence, grounding, alternatives)
```

## Key Design Patterns

### 1. Stateless Execution Harness
All state is passed via `MCOPContext`, enabling:
- Parallel processing
- Easy serialization
- Reproducibility
- Testing

### 2. Mode-Based Reasoning
Four fundamental modes that map to any domain:
- CAUSAL → mechanisms, cause-effect
- STRUCTURAL → patterns, architecture
- SELECTIVE → filtering, constraints
- COMPOSITIONAL → synthesis, protocols

### 3. Mycelial Network Growth
Inspired by fungal networks:
- Branching exploration
- Cross-linking related ideas
- Pruning weak branches
- Nutrient (evidence) flow

### 4. Evidence Grounding
Hierarchical evidence weighting:
- Domain-specific hierarchies
- Quality-based scoring
- Transparent tracking
- Confidence calibration

### 5. Diversity Preservation
Prevents premature convergence:
- Multiple active hypotheses
- Alternative solutions
- Epistemic challenge phase
- Uncertainty identification

## Testing Strategy

### Unit Tests
Located in `test_mcop_runner.py`:
- Core type tests
- Reasoning mode tests
- Engine tests
- Convenience function tests

### Integration Tests
Covered in `DEMO.py`:
- End-to-end workflows
- Domain adapter integration
- Evidence integration
- Batch processing

### Test Coverage
- ✓ Core data structures
- ✓ Reasoning modes
- ✓ Engine operation
- ✓ Evidence grounding
- ✓ Domain adapters
- ✓ Utility functions

## Extension Points

### 1. Custom Reasoning Modes
Extend `BaseReasoningMode` to add new reasoning approaches.

### 2. Custom Domain Adapters
Extend `BaseDomainAdapter` for domain-specific logic.

### 3. Custom Evidence Hierarchies
Define new `EvidenceHierarchy` for domain-specific evidence.

### 4. LLM Integration
Set `engine.llm_client` to integrate language models.

### 5. Custom Validators
Add validation logic in reasoning chains.

## Configuration System

### Global Configuration
`MCOPConfig` controls engine behavior:
- `max_iterations`: Reasoning depth
- `confidence_threshold`: Solution quality
- `grounding_threshold`: Evidence requirement
- `diversity_threshold`: Alternative preservation
- `min_alternatives`: Minimum alternatives

### Domain Configuration
`DomainConfig` customizes per domain:
- `name`: Domain identifier
- `mode_mappings`: Mode interpretations
- `evidence_hierarchy`: Evidence weights
- `default_constraints`: Domain constraints
- `terminology`: Domain-specific terms

## Performance Characteristics

### Time Complexity
- O(iterations × modes × hypotheses) for basic operation
- O(depth × branching) for mycelial chaining
- Linear in evidence count for grounding

### Space Complexity
- O(hypotheses + evidence) for context
- O(nodes × connections) for mycelial network
- Efficient pruning reduces space over time

### Optimization Strategies
1. Early pruning of low-quality hypotheses
2. Grounding threshold enforcement
3. Maximum depth limits
4. Parallel mode execution
5. Evidence caching

## Dependencies

### Required
- Python 3.8+
- Standard library only (dataclasses, enum, abc, logging, uuid)

### Optional
- pytest (for development)
- openai (for LLM integration)

### No External Runtime Dependencies
M-COP runs with zero external dependencies for maximum portability.

## Version History

### v3.1.0 (Current)
- Complete reasoning system
- Four reasoning modes
- Mycelial chaining
- Evidence grounding
- Domain adapters (general, medical, scientific)
- Comprehensive test suite
- Full documentation

## Development Guidelines

### Code Style
- PEP 8 compliant
- Type hints throughout
- Comprehensive docstrings
- Clear variable names

### Testing Requirements
- All new features must have tests
- Maintain >90% test coverage
- Include integration tests

### Documentation
- Update README for user-facing changes
- Update API_REFERENCE for API changes
- Add examples for new features
- Keep inline docs current

## Future Enhancements

### Planned Features
1. Advanced mycelial pruning strategies
2. Dynamic mode selection
3. Confidence calibration
4. Parallel hypothesis evaluation
5. Incremental learning from feedback
6. Enhanced LLM integration
7. Web interface
8. Visualization tools

### Research Directions
1. Formal verification of reasoning chains
2. Meta-learning for domain adaptation
3. Uncertainty quantification improvements
4. Adversarial reasoning challenges
5. Multi-agent collaborative reasoning

## License
Apache License 2.0 (Apache-2.0) — see top-level LICENSE / NOTICE.md. Pre-2026-04-26 releases remain available under MIT (LICENSE-MIT-LEGACY); the framework-agnostic integration shims are MIT (LICENSE-MIT-INTEGRATIONS).

## Contributing
See CONTRIBUTING.md (to be created)

## Contact
For questions, issues, or contributions, please open an issue on the repository.

---

**M-COP v3.1** - Meta-Cognitive Optimization Protocol
**Status**: Production Ready
**Last Updated**: 2025-12-19