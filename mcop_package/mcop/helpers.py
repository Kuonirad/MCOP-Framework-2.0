"""
M-COP v3.1 Helper Utilities

Common helper functions used across the M-COP system.
"""

import json
from typing import Dict, Any, Optional
from datetime import datetime

from .mcop_types import Evidence, Problem, Solution


def format_confidence(confidence: float) -> str:
    """Format confidence as percentage string."""
    return f"{confidence * 100:.1f}%"


def format_grounding(grounding: float) -> str:
    """Format grounding index as string with interpretation."""
    if grounding >= 0.9:
        level = "Very High"
    elif grounding >= 0.7:
        level = "High"
    elif grounding >= 0.5:
        level = "Moderate"
    elif grounding >= 0.3:
        level = "Low"
    else:
        level = "Very Low"

    return f"{grounding:.2f} ({level})"


def truncate_text(text: str, max_length: int = 50, suffix: str = "...") -> str:
    """Truncate text to maximum length."""
    if len(text) <= max_length:
        return text
    if max_length <= len(suffix):
        return suffix[:max_length]
    return text[:max_length - len(suffix)] + suffix


def create_evidence_from_dict(data: Dict[str, Any]) -> Evidence:
    """Create an Evidence object from a dictionary."""
    return Evidence(
        content=data.get('content', ''),
        source=data.get('source', ''),
        evidence_type=data.get('type', data.get('evidence_type', '')),
        weight=data.get('weight', 0.5),
        metadata=data.get('metadata', {})
    )


def export_solution_to_json(solution: Solution, filepath: str):
    """Export a solution to a JSON file."""
    data = {
        'id': solution.id,
        'problem_id': solution.problem_id,
        'content': solution.content,
        'confidence': solution.confidence,
        'grounding_index': solution.grounding_index,
        'evidence_chain': [
            {
                'content': e.content,
                'source': e.source,
                'type': e.evidence_type,
                'weight': e.weight
            }
            for e in solution.evidence_chain
        ],
        'alternative_solutions': [
            {
                'content': alt.content,
                'confidence': alt.confidence,
                'grounding_index': alt.grounding_index
            }
            for alt in solution.alternative_solutions
        ],
        'key_uncertainties': solution.key_uncertainties,
        'metadata': solution.metadata,
        'exported_at': datetime.now().isoformat()
    }

    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


def import_problem_from_json(filepath: str) -> Problem:
    """Import a problem from a JSON file."""
    with open(filepath, 'r') as f:
        data = json.load(f)

    return Problem(
        description=data.get('description', ''),
        domain=data.get('domain', 'general'),
        context=data.get('context', {}),
        constraints=data.get('constraints', []),
        success_criteria=data.get('success_criteria', []),
        metadata=data.get('metadata', {})
    )


def calculate_solution_quality(solution: Solution) -> Dict[str, Any]:
    """Calculate overall quality metrics for a solution."""
    quality = {
        'confidence_score': solution.confidence,
        'grounding_score': solution.grounding_index,
        'evidence_count': len(solution.evidence_chain),
        'alternatives_count': len(solution.alternative_solutions),
        'uncertainties_count': len(solution.key_uncertainties)
    }

    # Calculate composite score
    composite = (
        solution.confidence * 0.4 +
        solution.grounding_index * 0.4 +
        min(1.0, len(solution.evidence_chain) / 5) * 0.1 +
        min(1.0, len(solution.alternative_solutions) / 3) * 0.1
    )

    quality['composite_score'] = composite

    # Quality level
    if composite >= 0.8:
        quality['level'] = 'Excellent'
    elif composite >= 0.6:
        quality['level'] = 'Good'
    elif composite >= 0.4:
        quality['level'] = 'Fair'
    else:
        quality['level'] = 'Needs Improvement'

    return quality