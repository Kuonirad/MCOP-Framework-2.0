#!/usr/bin/env python3
"""
M-COP v3.1 command line interface.

Usage examples:
    python -m mcop.cli solve "Your problem description"
    python -m mcop.cli solve --domain medical "Patient presents with..."
    python -m mcop.cli interactive
"""

import argparse
import json
import logging
import os
import sys

from . import MCOPConfig, MCOPEngine, Problem, Solution, __version__
from .domains import GeneralDomainAdapter, MedicalDomainAdapter, ScientificDomainAdapter


def setup_logging(verbose: bool = False) -> None:
    """Configure logging based on verbosity."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


def get_adapter(domain: str):
    """Return the adapter for a supported domain."""
    adapters = {
        "general": GeneralDomainAdapter,
        "medical": MedicalDomainAdapter,
        "scientific": ScientificDomainAdapter,
    }

    adapter_class = adapters.get(domain.lower())
    if adapter_class is None:
        print("Unknown domain. Available domains: general, medical, scientific")
        raise SystemExit(1)

    return adapter_class()


def format_solution_output(solution: Solution, format_type: str = "text") -> str:
    """Format solution output for display or serialization."""
    if format_type == "json":
        return json.dumps(solution.to_dict(), indent=2)

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
        "",
    ]

    if solution.evidence_chain:
        lines.extend(["EVIDENCE CHAIN:", "-" * 70])
        for index, evidence in enumerate(solution.evidence_chain[:5], 1):
            lines.append(f"  {index}. {evidence.content}")
            lines.append(f"     Source: {evidence.source}, Weight: {evidence.weight:.2f}")
        lines.append("")

    if solution.alternative_solutions:
        lines.extend(["ALTERNATIVE SOLUTIONS:", "-" * 70])
        for index, alternative in enumerate(solution.alternative_solutions, 1):
            preview = alternative.content.splitlines()[0][:60]
            lines.append(f"  {index}. {preview}...")
            lines.append(f"     Confidence: {alternative.confidence * 100:.1f}%")
        lines.append("")

    if solution.key_uncertainties:
        lines.extend(["KEY UNCERTAINTIES:", "-" * 70])
        for uncertainty in solution.key_uncertainties:
            lines.append(f"  - {uncertainty}")
        lines.append("")

    lines.extend(["=" * 70, ""])
    return "\n".join(lines)


def write_output_file(path: str, content: str, force: bool) -> None:
    """Write formatted output to disk, respecting overwrite rules."""
    absolute_path = os.path.abspath(path)
    mode = "w" if force else "x"

    try:
        with open(absolute_path, mode, encoding="utf-8") as handle:
            handle.write(content)
    except FileExistsError:
        print(f"Error: File '{path}' already exists. Use --force to overwrite.")
        raise SystemExit(1)
    except IsADirectoryError:
        print(f"Error: '{path}' is a directory.")
        raise SystemExit(1)
    except OSError as exc:
        print(f"Error saving to file: {exc}")
        raise SystemExit(1)

    print(f"Solution saved to: {path}")


def cmd_solve(args) -> None:
    """Handle the solve command."""
    setup_logging(args.verbose)
    adapter = get_adapter(args.domain)

    problem = Problem(description=args.problem, domain=args.domain)
    if args.constraints:
        problem.constraints = [item.strip() for item in args.constraints.split(",") if item.strip()]

    print(f"\nSolving with M-COP v{__version__} ({args.domain} domain)...")
    print("-" * 70)

    solution = adapter.solve(problem)
    output = format_solution_output(solution, args.format)
    print(output)

    if args.output:
        write_output_file(args.output, output, args.force)


def cmd_interactive(args) -> None:
    """Handle interactive mode."""
    setup_logging(args.verbose)

    print(
        f"""
{'=' * 70}
M-COP v{__version__} Interactive Mode
Meta-Cognitive Optimization Protocol
{'=' * 70}

Commands:
  solve <problem>  - Solve a problem
  domain <name>    - Switch domain (general, medical, scientific)
  config           - Show current configuration
  help             - Show this help
  quit             - Exit

Current domain: {args.domain}
"""
    )

    current_domain = args.domain
    adapter = get_adapter(current_domain)

    while True:
        try:
            user_input = input(f"\n[M-COP:{current_domain}] > ").strip()
            if not user_input:
                continue

            if user_input.lower() in {"quit", "exit", "q"}:
                print("Goodbye!")
                break

            if user_input.lower() == "help":
                print(
                    """
Commands:
  solve <problem>  - Solve a problem using M-COP
  domain <name>    - Switch domain (general, medical, scientific)
  config           - Show current configuration
  quit             - Exit
"""
                )
                continue

            if user_input.lower().startswith("domain "):
                new_domain = user_input[7:].strip()
                try:
                    adapter = get_adapter(new_domain)
                    current_domain = new_domain
                    print(f"Switched to {current_domain} domain")
                except SystemExit:
                    pass
                continue

            if user_input.lower() == "config":
                config = adapter.engine.config
                print(
                    f"""
Current Configuration:
  Domain: {current_domain}
  Max Iterations: {config.max_iterations}
  Confidence Threshold: {config.confidence_threshold}
  Grounding Threshold: {config.grounding_threshold}
  Diversity Threshold: {config.diversity_threshold}
"""
                )
                continue

            if user_input.lower().startswith("solve "):
                problem_text = user_input[6:].strip()
            else:
                problem_text = user_input

            if not problem_text:
                print("Please provide a problem description")
                continue

            problem = Problem(description=problem_text, domain=current_domain)
            print("\nProcessing...")
            solution = adapter.solve(problem)
            print(format_solution_output(solution, "text"))

        except KeyboardInterrupt:
            print("\n\nInterrupted. Type 'quit' to exit.")
        except Exception as exc:
            print(f"Error: {exc}")
            if args.verbose:
                import traceback

                traceback.print_exc()


def cmd_info(args) -> None:
    """Handle the info command."""
    print(
        f"""
M-COP v{__version__} - Meta-Cognitive Optimization Protocol

A universal reasoning framework implementing:
  - Multi-modal reasoning (causal, structural, selective, compositional)
  - Mycelial chaining (recursive hypothesis refinement)
  - Grounding index (evidence quality tracking)
  - Domain-aware adapters

Available Domains:
  - general
  - medical
  - scientific

Usage Examples:
  mcop solve "What causes climate change?"
  mcop solve --domain medical "Patient with fever and cough"
  mcop interactive
"""
    )


def build_parser() -> argparse.ArgumentParser:
    """Construct the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="M-COP v3.1 - Meta-Cognitive Optimization Protocol",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s solve "What are the causes of inflation?"
  %(prog)s solve --domain medical "Patient presents with chest pain"
  %(prog)s solve --domain scientific "Why do anti-amyloid drugs fail?"
  %(prog)s interactive
""",
    )

    parser.add_argument(
        "--version",
        "-V",
        action="version",
        version=f"M-COP v{__version__}",
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    solve_parser = subparsers.add_parser("solve", help="Solve a problem")
    solve_parser.add_argument("problem", help="Problem description")
    solve_parser.add_argument(
        "--domain",
        "-d",
        default="general",
        help="Domain (general, medical, scientific)",
    )
    solve_parser.add_argument(
        "--format",
        "-f",
        choices=["text", "json"],
        default="text",
        help="Output format",
    )
    solve_parser.add_argument("--output", "-o", help="Output file path")
    solve_parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite output file if it exists",
    )
    solve_parser.add_argument(
        "--constraints",
        "-c",
        help="Comma-separated constraints",
    )
    solve_parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Verbose output",
    )
    solve_parser.set_defaults(func=cmd_solve)

    interactive_parser = subparsers.add_parser("interactive", help="Interactive mode")
    interactive_parser.add_argument(
        "--domain",
        "-d",
        default="general",
        help="Initial domain",
    )
    interactive_parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Verbose output",
    )
    interactive_parser.set_defaults(func=cmd_interactive)

    info_parser = subparsers.add_parser("info", help="Show information")
    info_parser.set_defaults(func=cmd_info)

    return parser


def main() -> None:
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        raise SystemExit(0)

    args.func(args)


if __name__ == "__main__":
    main()
