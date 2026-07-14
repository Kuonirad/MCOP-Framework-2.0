"""MCOP for Python: the Deterministic Triad plus the legacy reasoning engine.

The flagship API mirrors ``@kullailabs/mcop-core``: NOVA-NEO encoding,
Stigmergy v5 bounded memory, and Holographic Etch.  The established
``MCOPEngine`` reasoning, grounding, mycelial, and domain APIs remain additive
and source-compatible.
"""

__version__ = "4.0.0"

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

# Automated evidence retrieval (v3.3)
from .evidence_retrieval import (
    EvidenceRetriever,
    InMemoryEvidenceRetriever,
    CompositeEvidenceRetriever,
    RetrieverConfig,
    RetrievalResult,
    build_query_from_hypothesis,
)

# Guardian meta-reasoner (v3.3) — extends Guardian v0.1 calibration
# into a real-time grounding-index checker.
from .guardian import (
    GuardianMetaReasoner,
    GuardianConfig,
    GuardianVerdict,
    GuardianStatus,
    MIN_GROUNDING_FLOOR,
)

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

# Flagship Deterministic Triad.  Resolve these required exports lazily so
# ``python -m mcop.triad`` can execute without runpy finding the target module
# pre-imported by its parent package.  Import failures are intentionally not
# swallowed: rfc8785 is a required dependency declared in pyproject.toml.
_TRIAD_EXPORTS = {
    'TRIAD_PROTOCOL_VERSION',
    'AdaptiveConfidenceBreakdown',
    'BufferStats',
    'EtchRecord',
    'EudaimonicEtchSummary',
    'HolographicEtch',
    'HashingTrickBackend',
    'MemoryStats',
    'NovaNeoEncoder',
    'NovaNeoWeb',
    'PheromoneTrace',
    'PositiveGrowthEvent',
    'PositiveImpactMetrics',
    'ResonanceResult',
    'ResonantRecentTrace',
    'StigmergyV5',
    'UniversalEncoder',
    'estimate_entropy',
    'nova_neo_encode',
    'triad_fingerprint',
}


def __getattr__(name):
    if name not in _TRIAD_EXPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from . import triad

    value = getattr(triad, name)
    globals()[name] = value
    return value


def __dir__():
    return sorted(set(globals()) | _TRIAD_EXPORTS)


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

    # Automated evidence retrieval
    'EvidenceRetriever',
    'InMemoryEvidenceRetriever',
    'CompositeEvidenceRetriever',
    'RetrieverConfig',
    'RetrievalResult',
    'build_query_from_hypothesis',

    # Guardian meta-reasoner
    'GuardianMetaReasoner',
    'GuardianConfig',
    'GuardianVerdict',
    'GuardianStatus',
    'MIN_GROUNDING_FLOOR',

    # Domain adapters
    'GeneralDomainAdapter',
    'MedicalDomainAdapter',
    'PatientPresentation',
    'ScientificDomainAdapter',
    'ResearchQuestion',
    'GovernanceDomainAdapter',
    'GOVERNANCE_HIERARCHY',

    # Flagship Deterministic Triad
    'TRIAD_PROTOCOL_VERSION',
    'NovaNeoEncoder',
    'UniversalEncoder',
    'NovaNeoWeb',
    'StigmergyV5',
    'HolographicEtch',
    'HashingTrickBackend',
    'PheromoneTrace',
    'ResonanceResult',
    'ResonantRecentTrace',
    'BufferStats',
    'EtchRecord',
    'AdaptiveConfidenceBreakdown',
    'EudaimonicEtchSummary',
    'MemoryStats',
    'PositiveGrowthEvent',
    'PositiveImpactMetrics',
    'nova_neo_encode',
    'estimate_entropy',
    'triad_fingerprint',

    # Convenience function
    'solve',
]
