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
from typing import Any, Optional

from mcop.adapters.arcagi3_agent import (
    GrokStrategy,
    HolographicShadowStrategy,
    MCOPArcAgi3Agent,
    MappingGrokStrategy,
    MappingQwenStrategy,
    QwenStrategy,
    RandomStrategy,
    DEFAULT_GROK_MODEL,
    DEFAULT_QWEN_MODEL,
    LOW_MEMORY_ENCODER_DIMS,
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
        choices=[
            "random",
            "grok",
            "mapping-grok",
            "qwen",
            "mapping-qwen",
            "holographic",
        ],
        default="random",
        help=(
            "Action selection strategy. ``holographic`` is the\n"
            "online-only Holographic Shadow Consensus v2 strategy --\n"
            "no LLM calls, fully ARC-AGI-3 compliant. ``qwen`` /\n"
            "``mapping-qwen`` mirror the Grok variants 1:1 but route\n"
            "through DashScope's OpenAI-compatible endpoint using\n"
            "QWEN_API_KEY (fallback DASHSCOPE_API_KEY)."
        ),
    )
    parser.add_argument("--max-actions", type=int, default=200)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument(
        "--grok-model",
        default=None,
        help=(
            "xAI model name for grok / mapping-grok strategies. "
            "Defaults to the GROK_MODEL env var, then to the "
            f"library default ({DEFAULT_GROK_MODEL!r})."
        ),
    )
    parser.add_argument(
        "--qwen-model",
        default=None,
        help=(
            "Alibaba DashScope model name for qwen / mapping-qwen "
            "strategies. Defaults to the QWEN_MODEL env var, then "
            f"to the library default ({DEFAULT_QWEN_MODEL!r})."
        ),
    )
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument(
        "--goal-color",
        type=int,
        default=None,
        help=(
            "Pixel colour index of the goal tile for the holographic "
            "strategy. Defaults to the HOLOGRAPHIC_GOAL_COLOR env var; if "
            "that is unset/blank the goal colour is discovered online from "
            "the first level advance (recommended -- a wrong fixed colour "
            "stalls the agent at 0 levels)."
        ),
    )
    parser.add_argument(
        "--player-color",
        type=int,
        default=None,
        help="Pixel colour index of the player sprite (holographic strategy). Auto-detected if omitted.",
    )
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
    elif args.strategy == "qwen":
        strategy = QwenStrategy(model=args.qwen_model)
    elif args.strategy == "mapping-qwen":
        strategy = MappingQwenStrategy(model=args.qwen_model)
    elif args.strategy == "holographic":
        # Goal colour resolution, in priority order:
        #   1. explicit --goal-color (note: ``is not None`` so colour 0 is
        #      honoured, unlike the old ``or`` which silently dropped it),
        #   2. a non-blank HOLOGRAPHIC_GOAL_COLOR env var,
        #   3. None == "discover it online".
        # Defaulting to None (rather than the old hard-coded 8) is the
        # core fix: a wrong fixed goal colour made the agent navigate into
        # a non-matching target that acts as a wall and oscillate there
        # forever (0 levels on every game), and the online goal-colour
        # detector could never correct it because it only learns from a
        # level advance that never came. With None the strategy explores
        # until an advance reveals the real goal colour, then locks on.
        gc_env = os.environ.get("HOLOGRAPHIC_GOAL_COLOR", "").strip()
        if args.goal_color is not None:
            goal_color: Optional[int] = args.goal_color
        elif gc_env:
            goal_color = int(gc_env)
        else:
            goal_color = None
        strategy = HolographicShadowStrategy(
            goal_color=goal_color,
            player_color=args.player_color,
            # Seed the bootstrap exploration. Default to 0 (deterministic /
            # replayable) for ARC Prize + provenance compliance; --seed
            # lets an operator pick a different but still-reproducible
            # trajectory.
            exploration_seed=args.seed if args.seed is not None else 0,
        )
    else:
        strategy = RandomStrategy(seed=args.seed)

    try:
        agent = MCOPArcAgi3Agent(
            strategy=strategy,
            max_actions=args.max_actions,
            encoder_dims=LOW_MEMORY_ENCODER_DIMS,
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
