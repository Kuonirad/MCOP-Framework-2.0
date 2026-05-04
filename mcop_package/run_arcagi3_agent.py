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
import sys

from mcop.adapters.arcagi3_agent import (
    GrokStrategy,
    MCOPArcAgi3Agent,
    MappingGrokStrategy,
    RandomStrategy,
    SDKUnavailable,
)


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
        strategy = GrokStrategy()
    elif args.strategy == "mapping-grok":
        strategy = MappingGrokStrategy()
    else:
        strategy = RandomStrategy(seed=args.seed)

    try:
        agent = MCOPArcAgi3Agent(strategy=strategy, max_actions=args.max_actions)
    except SDKUnavailable as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3

    if args.game_id is None:
        for gid in agent.list_games():
            print(gid)
        return 0

    result = agent.play(args.game_id)
    print(json.dumps(result.as_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
