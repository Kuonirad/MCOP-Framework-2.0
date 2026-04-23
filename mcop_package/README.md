# mcop

`mcop` is the Python distribution for the Meta-Cognitive Operating Protocol, a
reasoning framework for multi-modal hypothesis generation, recursive refinement,
and evidence-grounded synthesis.

The package exposes:

- A general-purpose reasoning engine.
- Domain adapters for general, medical, and scientific workflows.
- A command-line interface for interactive use and scripted runs.
- Structured outputs with confidence, grounding, evidence, and alternatives.

## Install

```bash
pip install mcop
```

Optional extras:

```bash
pip install mcop[llm]
pip install mcop[dev]
```

## Quick Start

### Solve a problem directly

```python
from mcop import solve

solution = solve("What causes climate change?")
print(solution.content)
print(f"Confidence: {solution.confidence * 100:.1f}%")
print(f"Grounding index: {solution.grounding_index:.2f}")
```

### Work with the engine explicitly

```python
from mcop import MCOPEngine, Problem

engine = MCOPEngine()
problem = Problem(description="Your problem here")
solution = engine.solve(problem)
print(solution.content)
```

### Use a domain adapter

```python
from mcop.domains import MedicalDomainAdapter, PatientPresentation

adapter = MedicalDomainAdapter()
presentation = PatientPresentation(
    chief_complaint="Chest pain",
    symptoms=["chest pain", "shortness of breath"],
)
problem = adapter.create_patient_problem(presentation)
solution = adapter.solve(problem)
print(adapter.format_differential_diagnosis(solution))
```

## Command Line Interface

```bash
mcop solve "What are the causes of inflation?"
mcop solve --domain medical "Patient with fever and cough"
mcop interactive
mcop info
```

## What the Package Returns

Each solution includes the primary response plus supporting metadata such as:

- Confidence score.
- Grounding index.
- Evidence chain.
- Alternative solutions.
- Key uncertainties.

## Project Resources

- Repository: [Kuonirad/KullAILABS-MCOP-Framework-2.0](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0)
- Usage guide: [mcop_package/USAGE_GUIDE.md](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/mcop_package/USAGE_GUIDE.md)
- API reference: [mcop_package/API_REFERENCE.md](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/mcop_package/API_REFERENCE.md)
- Project structure: [mcop_package/PROJECT_STRUCTURE.md](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/mcop_package/PROJECT_STRUCTURE.md)
- Changelog: [CHANGELOG.md](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/CHANGELOG.md)

## Notes

- The Python package has no required runtime dependencies.
- Medical and scientific adapters are decision-support examples and do not
  replace professional judgment.
- Trusted publishing setup for PyPI is documented in
  [TRUSTED_PUBLISHING_SETUP.md](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/TRUSTED_PUBLISHING_SETUP.md).

## License

MIT
