#!/usr/bin/env python3
"""
M-COP v3.1 Command Line Interface

Provides a command-line interface for the M-COP reasoning system.

Usage:
    python -m mcop.cli solve "Your problem description"
    python -m mcop.cli solve --domain medical "Patient presents with..."
    python -m mcop.cli interactive
"""

import argparse
import os
import sys
import json
import logging
from typing import Optional

from . import MCOPEngine, MCOPConfig, Problem, Solution, __version__
from .domains import GeneralDomainAdapter, MedicalDomainAdapter, ScientificDomainAdapter


def setup_logging(verbose: bool = False):
    """Configure logging based on verbosity."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )


def get_adapter(domain: str):
    """Get the appropriate domain adapter."""
    adapters = {
        'general': GeneralDomainAdapter,
        'medical': MedicalDomainAdapter,
        'scientific': ScientificDomainAdapter
    }

    adapter_class = adapters.get(domain.lower())
    if not adapter_class:
        # Security: Use a static list for the error message to avoid
        # potentially exposing internal dictionary keys if the implementation changes,
        # and to satisfy static analysis tools (CWE-532).
        valid_domains = ['general', 'medical', 'scientific']
        print(f"Unknown domain: {domain}")
        print(f"Available domains: {', '.join(valid_domains)}")
        sys.exit(1)

    return adapter_class()


def format_solution_output(solution: Solution, format_type: str = 'text') -> str:
    """Format solution for output."""
    if format_type == 'json':
        return json.dumps(solution.to_dict(), indent=2)

    # Text format
    lines = [
        "",
        "=" * 70,
        "M-COP v3.1 SOLUTION",
        "=" * 70,
        "",
        "SOLUTION:",
        "-" * 70,
        solution.content,
        "",
        f"Confidence: {solution.confidence * 100:.1f}%",
        f"Grounding Index: {solution.grounding_index:.2f}",
        ""
    ]

    if solution.evidence_chain:
        lines.extend([
            "EVIDENCE CHAIN:",
            "-" * 70
        ])
        for i, evidence in enumerate(solution.evidence_chain[:5], 1):
            lines.append(f"  {i}. {evidence.content}")
            lines.append(f"     Source: {evidence.source}, Weight: {evidence.weight:.2f}")
        lines.append("")

    if solution.alternative_solutions:
        lines.extend([
            "ALTERNATIVE SOLUTIONS:",
            "-" * 70
        ])
        for i, alt in enumerate(solution.alternative_solutions, 1):
            content_preview = alt.content.split('\n')[0][:60]
            lines.append(f"  {i}. {content_preview}...")
            lines.append(f"     Confidence: {alt.confidence * 100:.1f}%")
        lines.append("")

    if solution.key_uncertainties:
        lines.extend([
            "KEY UNCERTAINTIES:",
            "-" * 70
        ])
        for uncertainty in solution.key_uncertainties:
            lines.append(f"  • {uncertainty}")
        lines.append("")

    lines.extend([
        "=" * 70,
        ""
    ])

    return '\n'.join(lines)


def cmd_solve(args):
    """Handle the solve command."""
    setup_logging(args.verbose)

    # Get adapter
    adapter = get_adapter(args.domain)

    # Create problem
    problem = Problem(
        description=args.problem,
        domain=args.domain
    )

    # Add constraints if provided
    if args.constraints:
        problem.constraints = args.constraints.split(',')

    print(f"\nSolving with M-COP v{__version__} ({args.domain} domain)...")
    print("-" * 70)

    # Solve
    solution = adapter.solve(problem)

    # Output
    output = format_solution_output(solution, args.format)
    print(output)

    # Save to file if requested
    if args.output:
        # Security: Use 'x' mode (exclusive creation) by default to prevent TOCTOU attacks
        # where a file could be created between a check and the write.
        # Use 'w' mode only if force is explicitly requested.
        mode = 'w' if args.force else 'x'
        try:
            with open(args.output, mode) as f:
                f.write(output)
            print(f"Solution saved to: {args.output}")
        except FileExistsError:
            print(f"Error: File '{args.output}' already exists.")
            print("Use --force to overwrite.")
            sys.exit(1)
        except IsADirectoryError:
            print(f"Error: '{args.output}' is a directory.")
            sys.exit(1)
        except OSError as e:
            print(f"Error saving to file: {e}")
            sys.exit(1)


def cmd_interactive(args):
    """Handle the interactive command."""
    setup_logging(args.verbose)

    print(f"""
╔══════════════════════════════════════════════════════════════════════╗
║                     M-COP v{__version__} Interactive Mode                     ║
║                  Meta-Cognitive Operating Protocol                   ║
╚══════════════════════════════════════════════════════════════════════╝

Commands:
  solve <problem>  - Solve a problem
  domain <name>    - Switch domain (general, medical, scientific)
  config           - Show current configuration
  help             - Show this help
  quit             - Exit

Current domain: {args.domain}
""")

    current_domain = args.domain
    adapter = get_adapter(current_domain)

    while True:
        try:
            user_input = input(f"\n[M-COP:{current_domain}] > ").strip()

            if not user_input:
                continue

            if user_input.lower() in ['quit', 'exit', 'q']:
                print("Goodbye!")
                break

            if user_input.lower() == 'help':
                print("""
Commands:
  solve <problem>  - Solve a problem using M-COP
  domain <name>    - Switch domain (general, medical, scientific)
  config           - Show current configuration
  verbose          - Toggle verbose mode
  quit             - Exit
                """)
                continue

            if user_input.lower().startswith('domain '):
                new_domain = user_input[7:].strip()
                try:
                    adapter = get_adapter(new_domain)
                    current_domain = new_domain
                    print(f"Switched to {current_domain} domain")
                except SystemExit:
                    pass
                continue

            if user_input.lower() == 'config':
                print(f"""
Current Configuration:
  Domain: {current_domain}
  Max Iterations: {adapter.engine.config.max_iterations}
  Confidence Threshold: {adapter.engine.config.confidence_threshold}
  Grounding Threshold: {adapter.engine.config.grounding_threshold}
  Diversity Threshold: {adapter.engine.config.diversity_threshold}
                """)
                continue

            if user_input.lower().startswith('solve '):
                problem_text = user_input[6:].strip()
                if not problem_text:
                    print("Please provide a problem description")
                    continue

                problem = Problem(description=problem_text, domain=current_domain)
                print("\nProcessing...")

                solution = adapter.solve(problem)
                output = format_solution_output(solution, 'text')
                print(output)
                continue

            # Default: treat as problem to solve
            problem = Problem(description=user_input, domain=current_domain)
            print("\nProcessing...")

            solution = adapter.solve(problem)
            output = format_solution_output(solution, 'text')
            print(output)

        except KeyboardInterrupt:
            print("\n\nInterrupted. Type 'quit' to exit.")
        except Exception as e:
            print(f"Error: {e}")
            if args.verbose:
                import traceback
                traceback.print_exc()


def cmd_info(args):
    """Handle the info command."""
    print(f"""
M-COP v{__version__} - Meta-Cognitive Operating Protocol

A universal reasoning framework implementing:
  • Multi-modal reasoning (Causal, Structural, Selective, Compositional)
  • Mycelial chaining (recursive hypothesis refinement)
  • Grounding index (evidence quality tracking)
  • Domain-agnostic architecture

Available Domains:
  • general    - General purpose reasoning
  • medical    - Medical diagnosis and treatment planning
  • scientific - Scientific hypothesis and experimental design

Usage Examples:
  mcop solve "What causes climate change?"
  mcop solve --domain medical "Patient with fever and cough"
  mcop interactive

For more information, see the documentation.
    """)


def main():
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description='M-COP v3.1 - Meta-Cognitive Operating Protocol',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s solve "What are the causes of inflation?"
  %(prog)s solve --domain medical "Patient presents with chest pain"
  %(prog)s solve --domain scientific "Why do anti-amyloid drugs fail?"
  %(prog)s interactive
        """
    )

    parser.add_argument(
        '--version', '-V',
        action='version',
        version=f'M-COP v{__version__}'
    )

    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Solve command
    solve_parser = subparsers.add_parser('solve', help='Solve a problem')
    solve_parser.add_argument('problem', help='Problem description')
    solve_parser.add_argument(
        '--domain', '-d',
        default='general',
        help='Domain (general, medical, scientific)'
    )
    solve_parser.add_argument(
        '--format', '-f',
        choices=['text', 'json'],
        default='text',
        help='Output format'
    )
    solve_parser.add_argument(
        '--output', '-o',
        help='Output file path'
    )
    solve_parser.add_argument(
        '--force',
        action='store_true',
        help='Overwrite output file if it exists'
    )
    solve_parser.add_argument(
        '--constraints', '-c',
        help='Comma-separated constraints'
    )
    solve_parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Verbose output'
    )
    solve_parser.set_defaults(func=cmd_solve)

    # Interactive command
    interactive_parser = subparsers.add_parser('interactive', help='Interactive mode')
    interactive_parser.add_argument(
        '--domain', '-d',
        default='general',
        help='Initial domain'
    )
    interactive_parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Verbose output'
    )
    interactive_parser.set_defaults(func=cmd_interactive)

    # Info command
    info_parser = subparsers.add_parser('info', help='Show information')
    info_parser.set_defaults(func=cmd_info)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    args.func(args)


if __name__ == '__main__':
    main()
