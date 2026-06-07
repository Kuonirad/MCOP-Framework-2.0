# Directive — World-model upgrade for the no-LLM ARC-AGI-3 strategy

> A self-contained, multi-session work order for `HolographicShadowStrategy`
> (`mcop_package/mcop/adapters/arcagi3_agent.py`). It is written so a fresh
> agent session with **no prior context** can execute it correctly and stay
> ARC-Prize compliant. Hand it over verbatim.

## Background (why this exists)

The no-LLM holographic strategy was fixed to actually work through puzzles
([#793](https://github.com/Kuonirad/MCOP-Framework-2.0/pull/793)) and locked to
provable ARC-Prize compliance
([#794](https://github.com/Kuonirad/MCOP-Framework-2.0/pull/794)). Rigorous local
measurement then found a hard heuristic ceiling:

| Condition | Games reaching ≥1 level |
|---|---|
| 150 actions, seed 0 | 1/25 (`sp80`) |
| 3 exploration seeds, 200 actions | 1/25 (`sp80`) |
| 500 actions | 2/25 (`sp80`, `cd82`) |
| Death-avoidance (both variants) | no union gain — reverted |

Pure navigation/exploration cannot solve games that require *reasoning about
mechanics* (e.g. `sp80` = scrambled controls + a flood/"spill" fill objective;
`ls20` = LockSmith shape/colour/rotation matching; a non-matching lock acts as a
wall). This directive is the no-LLM path to break that ceiling: give the strategy
an **online world-model** — perceive objects, learn interaction effects, infer
the goal structure, and plan to satisfy it.

## 1. Mission

Raise the **union of games that reach ≥1 level** above the 2/25 baseline (target
≥4/25) by making the strategy model mechanics online — with **no per-game
hardcoding** and **no loss of compliance**. Ship incrementally as each mechanism
proves out in an A/B; treat anything that does not beat baseline as not worth
shipping.

## 2. Non-negotiable guardrails (verify at runtime, do not assume)

- **Online learning only.** All knowledge comes from the live frame stream inside
  `observe()`. No offline data, no pretraining, no cached answers.
- **No per-game hardcoding.** You may read a downloaded game's source *to
  understand mechanics*, but never copy a game-specific fact (a colour, a
  coordinate, a `game_id` branch) into the strategy. If a reviewer greps the diff
  for a game id or a magic colour and finds intent, the change is invalid.
- **Closed action set** (`ACTION1`–`ACTION6`, `RESET`), **official scorecard
  lifecycle**, **pure-online egress** (only `*.arcprize.org`), and
  **deterministic replay** (`exploration_seed` default `0`; a fresh strategy must
  replay identically on the same frames).
- Enforced by `test_holographic_play_runtime_compliance_against_fake_env` (CI),
  `test_holographic_arcagi3_live.py` (gated by `HOLO_LIVE_E2E=1`), and documented
  in `.agents/skills/testing-arcagi3-strategy/SKILL.md`. **Read that skill first.**
  Keep its provenance allow-list in sync if you add provenance types.

## 3. Environment setup (this is what makes local iteration possible — do it first)

- Python 3.14 lives under `%APPDATA%\Roaming\Python\Python314`; `arc_agi` and
  `arcengine` are installed. There is **no `ARC_API_KEY`** on this box and you
  must not need one.
- This box does TLS interception, so Python HTTPS fails cert-verify. Create a
  **local-only, never-committed** shim (`arc_scratch/arc_noverify.py`) that
  disables `requests`/`ssl` verification, and put `arc_scratch` on `PYTHONPATH`.
  A committed `verify=False` is a compliance failure — it lives only in scratch.
- `Arcade()` in default **NORMAL** mode auto-fetches an anonymous key from
  `/api/games/anonkey`, downloads each game to `./environment_files/`, and runs
  it **locally** — no secret, no quota. There are 25 games. Use this for all
  iteration. Run network Bash with the sandbox disabled (the cert intercept).

## 4. Measurement protocol (no shipping without it)

- Reuse/recreate the local harness (`arc_scratch/iter_harness.py`) mirroring the
  real `play()` loop with one `Arcade` and one scorecard.
- **Primary metric:** union of games reaching `levels_completed ≥ 1`. Secondary:
  total levels and per-game best.
- **Vary `exploration_seed` (0..N), NOT the game seed** — `make(seed=…)` does not
  change the instance. Sample ≥3 seeds per game to kill single-trajectory noise.
- Always run a **fleet A/B** (current `main` vs your change) at 200 *and* 500
  actions. Gate every new mechanism behind a constructor flag that **defaults to
  current behaviour**, so the A/B is honest and `main` is never regressed.
- A change ships only if it raises the union (or total levels) and leaves all
  existing tests + compliance tests green. Report negative results honestly and
  revert them — do not keep dead weight.

## 5. The build (phased; prove each phase before the next)

1. **Object/region perception.** Online connected-component segmentation of each
   frame into colour regions (centroid, bbox, area, colour). Pure, deterministic,
   no game knowledge.
2. **Interaction-effect learning.** Extend `observe()` to learn, per action and
   per region-type contacted, the effect on frame attributes (regions
   appearing/moving/recolouring, counters changing). The no-LLM analogue of
   `MappingGrokStrategy`'s action→effect map, learned online.
3. **Goal/structure inference.** On steps where `levels_completed` increases,
   credit the region attributes/relations that co-occurred — generalise
   `_GoalColorDetector` from "goal colour" to "goal *structure*". Until a level
   advance is seen, stay in pure frontier+epsilon exploration (keep the bootstrap
   regime).
4. **Attribute-aware planning.** Upgrade the forward model from
   `(state-hash, action) → state-hash` to plan over inferred attributes ("make the
   controlled object's attributes match the goal region, then occupy it"). Bounded
   search; fall back to exploration when no plan exists. Zero env steps consumed.
5. Keep everything **deterministic** (seeded) and **provenance-logged** so the
   live compliance test still passes and runs stay auditable.

## 6. Iteration discipline

For each idea: state the hypothesis → implement behind a default-off flag → fleet
A/B (≥3 seeds, 200 & 500 actions) → keep iff the union/levels improve and all
tests pass → otherwise revert. One mechanism at a time. Read the relevant game's
source to *understand* before guessing, but encode only general logic.

## 7. Definition of done

- Union of games solving ≥1 level improves materially over 2/25 (aim ≥4/25),
  reproduced across seeds.
- Every public claim backed by a re-runnable local artefact; at least one
  improvement verified live in `OPERATION_MODE=competition`.
- Full suite green (currently **348 passed / 3 skipped**); non-gated and gated
  compliance tests pass; no per-game constants in the diff.

## 8. Delivery

- Work in a `git worktree` off `origin/main` (never disturb the dirty primary
  working tree). Branch `feat/arcagi3-world-model`.
- Push with `git -c http.sslBackend=schannel push`. Open a PR filling the template
  so `scripts/verify-pr-checklist.mjs` passes: ≥1 Type, the four required
  Checklist items (style / self-review / no new warnings / unit tests pass), ≥1
  Testing box, and **exactly one** box each for Entropy / Confidence / Performance.
  End the PR body with the Claude Code line; end commits with the
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Clean up worktrees and the TLS shim when done.

## 9. Anti-goals

Don't burn ARC quota (local NORMAL mode only). Don't hardcode any game. Don't ship
a change that doesn't beat baseline in the A/B. Don't claim a win you didn't
reproduce. If you hit a real ceiling again, say so plainly and recommend the
LLM-strategy path (`grok`/`qwen`) instead.
