"""
M-COP v3.1 - Meta-Cognitive Operating Protocol

A universal reasoning framework that implements multi-modal reasoning,
mycelial chaining, and evidence grounding for domain-agnostic problem solving.
"""

__version__ = "3.1.0"

# Core types
from .mcop_types import (
    Problem,
    Solution,
    Hypothesis,
    Evidence,
    ReasoningChain,
    MCOPContext,
    ReasoningMode,
    EpistemicState
)

# Engine and config
from .engine import MCOPEngine, MCOPConfig

# Reasoning modes (base classes and implementations)
from .base import (
    BaseReasoningMode,
    CausalMode,
    StructuralMode,
    SelectiveMode,
    CompositionalMode
)

# Xi^infinity ("non-obvious-angle") extension.  Opt-in via
# MCOPConfig(enable_xi_infinity=True) or register manually on the engine.
try:
    from .xi_infinity import HiddenConstraintMode, extract_assumptions
except ImportError:
    HiddenConstraintMode = None
    extract_assumptions = None

# Mycelial chaining
try:
    from .mycelial import (
        MycelialChainBuilder,
        MycelialNetwork,
        ChainNode,
        analyze_network
    )
except ImportError:
    # Fallback if mycelial module has issues
    MycelialChainBuilder = None
    MycelialNetwork = None
    ChainNode = None
    analyze_network = None

# Grounding system
try:
    from .index import (
        GroundingCalculator,
        GroundingAnalyzer,
        EvidenceHierarchy,
        GENERAL_HIERARCHY,
        MEDICAL_HIERARCHY,
        SCIENTIFIC_HIERARCHY
    )
except ImportError:
    # Fallback
    GroundingCalculator = None
    GroundingAnalyzer = None
    EvidenceHierarchy = None
    GENERAL_HIERARCHY = None
    MEDICAL_HIERARCHY = None
    SCIENTIFIC_HIERARCHY = None

# Domain adapters - with fallback handling
domains_available = True
try:
    from .general import GeneralDomainAdapter
    from .medical import MedicalDomainAdapter, PatientPresentation
    from .scientific import ScientificDomainAdapter, ResearchQuestion
except ImportError as e:
    print(f"Warning: Could not import all domain adapters: {e}")
    domains_available = False
    GeneralDomainAdapter = None
    MedicalDomainAdapter = None
    PatientPresentation = None
    ScientificDomainAdapter = None
    ResearchQuestion = None

# Governance adapter ships the Xi^infinity integration as a worked example.
try:
    from .governance import GovernanceDomainAdapter, GOVERNANCE_HIERARCHY
except ImportError:
    GovernanceDomainAdapter = None
    GOVERNANCE_HIERARCHY = None


def solve(description: str, domain: str = "general", **kwargs) -> Solution:
    """
    Convenience function to solve a problem using M-COP.

    Args:
        description: Problem description
        domain: Domain ('general', 'medical', 'scientific')
        **kwargs: Additional problem parameters

    Returns:
        Solution object with reasoning chain and grounding

    Example:
        >>> solution = solve("What causes climate change?")
        >>> print(solution.content)
        >>> print(f"Confidence: {solution.confidence * 100:.1f}%")
    """
    problem = Problem(description=description, domain=domain, **kwargs)

    # Select appropriate adapter based on domain
    if domain == "medical" and domains_available and MedicalDomainAdapter:
        adapter = MedicalDomainAdapter()
        return adapter.solve(problem)
    elif domain == "scientific" and domains_available and ScientificDomainAdapter:
        adapter = ScientificDomainAdapter()
        return adapter.solve(problem)
    else:
        # Use general engine directly
        engine = MCOPEngine()
        return engine.solve(problem)


__all__ = [
    # Version
    '__version__',

    # Core types
    'Problem',
    'Solution',
    'Hypothesis',
    'Evidence',
    'ReasoningChain',
    'MCOPContext',
    'ReasoningMode',
    'EpistemicState',

    # Engine
    'MCOPEngine',
    'MCOPConfig',

    # Reasoning modes
    'BaseReasoningMode',
    'CausalMode',
    'StructuralMode',
    'SelectiveMode',
    'CompositionalMode',

    # Xi^infinity extension
    'HiddenConstraintMode',
    'extract_assumptions',

    # Mycelial chaining
    'MycelialChainBuilder',
    'MycelialNetwork',
    'ChainNode',
    'analyze_network',

    # Grounding
    'GroundingCalculator',
    'GroundingAnalyzer',
    'EvidenceHierarchy',
    'GENERAL_HIERARCHY',
    'MEDICAL_HIERARCHY',
    'SCIENTIFIC_HIERARCHY',

    # Domain adapters
    'GeneralDomainAdapter',
    'MedicalDomainAdapter',
    'PatientPresentation',
    'ScientificDomainAdapter',
    'ResearchQuestion',
    'GovernanceDomainAdapter',
    'GOVERNANCE_HIERARCHY',

    # Convenience function
    'solve',
]