/**
 * MCOP Planning Module — types.
 *
 * Augments the deterministic triad (NOVA-NEO Encoder, Stigmergy v5,
 * Holographic Etch) with an MCTS + MAB planner that uses the triad itself
 * as a logical rollout oracle. The planner is orthogonal to the triad: it
 * never mutates encoder/stigmergy/etch state during simulation. Callers
 * may optionally commit the chosen plan back through the triad after
 * inspecting `provenanceTrace`.
 *
 * See `MCOPMCTSPlanner` for the orchestration surface.
 */

/** A serializable cognitive action token (e.g. "refine:style", "expand:plot"). */
export type PlanningAction = string;

export interface PlannerConfig {
  /** Total MCTS iterations executed by `plan()`. Defaults to 200. */
  mctsBudget?: number;
  /**
   * UCB1 / UCT exploration constant. Higher = more exploration.
   * Defaults to `Math.SQRT2` (the standard textbook value).
   */
  ucbC?: number;
  /**
   * Number of additional logical-rollout steps simulated past a freshly
   * expanded leaf. The rollout is deterministic (no Monte-Carlo randomness):
   * each step greedily selects the resonance-maximising action via the
   * encoder + stigmergy. Defaults to 4.
   */
  learnedRolloutDepth?: number;
  /**
   * Max children retained per node. Used to truncate large action sets while
   * preserving the order supplied by the caller. Defaults to 16 (matches the
   * P_GoT `maxFanout` invariant).
   */
  maxFanout?: number;
  /** Max tree depth (root has depth 0). Defaults to 6. */
  maxDepth?: number;
}

/**
 * Immutable per-node snapshot returned in the planner provenance trace.
 * Every node is Merkle-chained to its parent so the entire planning tree
 * is auditably reconstructable from `provenanceTrace`.
 */
export interface PlannerNodeSnapshot {
  /** Unique node id (UUID). */
  id: string;
  /** Parent node id, or `undefined` for the root. */
  parentId?: string;
  /** Depth from the root (root = 0). */
  depth: number;
  /** Action token taken to reach this node (undefined at the root). */
  action?: PlanningAction;
  /** Visit count accumulated by MCTS backpropagation. */
  visits: number;
  /** Cumulative reward accumulated by backpropagation. */
  totalReward: number;
  /** `totalReward / visits`, or 0 when never visited. */
  meanReward: number;
  /** SHA-256 hash of the encoded path tensor for replayable provenance. */
  tensorHash: string;
  /** SHA-256 Merkle hash of `{ id, action, parentHash, tensorHash }`. */
  merkleHash: string;
}

/** Result envelope returned by `MCOPMCTSPlanner.plan()`. */
export interface PlanResult {
  /** Action sequence from root → best leaf (most-visited-child policy). */
  bestSequence: PlanningAction[];
  /** Mean reward of the best sequence's terminal node. */
  bestReward: number;
  /** Number of MCTS iterations actually executed. */
  iterations: number;
  /**
   * Merkle root of the planning tree. Chained from every visited node so a
   * single hash uniquely identifies the explored tree shape.
   */
  rootMerkleHash: string;
  /** Full Merkle-chained snapshot of every visited node. */
  provenanceTrace: PlannerNodeSnapshot[];
}
