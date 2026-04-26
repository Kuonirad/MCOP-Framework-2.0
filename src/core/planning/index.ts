/**
 * MCOP Planning Module — public surface.
 *
 * Adds an MCTS + MAB planning layer with logically-learned rollouts on
 * top of the deterministic triad. The planner is opt-in and orthogonal:
 * importing this module has zero effect on the triad's behaviour.
 *
 * See `docs/planning/MCTS_MAB_INTEGRATION.md` for the full design rationale.
 */

export * from './types';
export * from './mab';
export * from './mctsMabPlanner';
