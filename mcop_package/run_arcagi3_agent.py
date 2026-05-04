"""Run the MCOP ARC-AGI-3 agent against a single game.

Usage:
    ARC_API_KEY=... GROK_API_KEY=... \\
        python -m mcop_package.run_arcagi3_agent ls20 --strategy grok

Requires Python >= 3.12 and `pip install arc-agi openai`.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
from typing import Any

from mcop.adapters.arcagi3_agent import (
    GrokStrategy,
    MCOPArcAgi3Agent,
    MappingGrokStrategy,
    RandomStrategy,
    SDKUnavailable,
)


def _install_sigterm_to_keyboardinterrupt() -> None:
    """Convert SIGTERM into a cooperative ``KeyboardInterrupt``.

    GitHub Actions sends SIGTERM (followed by SIGKILL after a grace
    period) when cancelling a workflow. Without this bridge, SIGTERM
    terminates the Python process immediately and we lose every step
    the agent has run so far -- no scorecard, no log artefact, no
    levels_completed.

    Routing it through KeyboardInterrupt lets ``MCOPArcAgi3Agent.play``
    catch the cancellation in its try/except, flush the partial
    ``GameResult`` to stdout, and call ``arcade.close_scorecard``
    before exit.
    """

    def _handler(signum: int, _frame: Any) -> None:
        logging.getLogger(__name__).warning(
            "received signal %d; raising KeyboardInterrupt to flush "
            "partial result",
            signum,
        )
        raise KeyboardInterrupt()

    try:
        signal.signal(signal.SIGTERM, _handler)
    except (ValueError, OSError):  # pragma: no cover -- non-main-thread
        # signal.signal() only works on the main thread of the main
        # interpreter; if we're somehow being imported into a worker
        # the runner just falls back to default SIGTERM behaviour.
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "game_id",
        nargs="?",
        default=None,
        help="Game id, e.g. ls20. If omitted, lists available games.",
    )
    parser.add_argument(
        "--strategy",
        choices=["random", "grok", "mapping-grok"],
        default="random",
    )
    parser.add_argument("--max-actions", type=int, default=80)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument(
        "--grok-model",
        default=None,
        help=(
            "xAI model name for grok / mapping-grok strategies. "
            "Defaults to the GROK_MODEL env var, then to the "
            "library default ('grok-4-fast-reasoning')."
        ),
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
    )

    if not os.environ.get("ARC_API_KEY"):
        print("ERROR: ARC_API_KEY not set", file=sys.stderr)
        return 2

    if args.strategy == "grok":
        strategy = GrokStrategy(model=args.grok_model)
    elif args.strategy == "mapping-grok":
        strategy = MappingGrokStrategy(model=args.grok_model)
    else:
        strategy = RandomStrategy(seed=args.seed)

    try:
        agent = MCOPArcAgi3Agent(
            strategy=strategy, max_actions=args.max_actions
        )
    except SDKUnavailable as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3

    if args.game_id is None:
        for gid in agent.list_games():
            print(gid)
        return 0

    _install_sigterm_to_keyboardinterrupt()
    result = agent.play(args.game_id)
    print(json.dumps(result.as_dict(), indent=2))
    # Standard "terminated by signal/Ctrl-C" exit code so workflow
    # postconditions can distinguish a clean run from a cancelled one
    # without parsing JSON.
    return 130 if result.final_state == "INTERRUPTED" else 0


if __name__ == "__main__":
    raise SystemExit(main())
