/**
 * Multi-Armed Bandit primitive — deterministic UCB1 implementation.
 *
 * Used both standalone (for one-shot action selection at the Stigmergy
 * boundary) and as the tree policy inside `MCOPMCTSPlanner` (UCT, which
 * is just UCB1 applied to the children of every MCTS node).
 *
 * The implementation is intentionally framework-free so it can also be
 * exercised by `packages/core` consumers without pulling in the rest of
 * the triad.
 */

export interface ArmStat {
  pulls: number;
  totalReward: number;
}

export interface UCB1Config {
  /** Exploration constant. Defaults to `Math.SQRT2`. */
  c?: number;
}

export class UCB1Bandit {
  private readonly c: number;
  private readonly stats: Map<string, ArmStat> = new Map();
  private totalPulls = 0;

  constructor(config: UCB1Config = {}) {
    this.c = config.c ?? Math.SQRT2;
  }

  /**
   * Returns the arm to pull next. Untried arms are returned in caller order
   * so behaviour is deterministic across repeated runs with identical inputs.
   */
  selectArm(arms: ReadonlyArray<string>): string {
    if (arms.length === 0) {
      throw new Error('UCB1Bandit.selectArm: at least one arm is required');
    }

    for (const arm of arms) {
      if (!this.stats.has(arm)) return arm;
    }

    const lnT = Math.log(Math.max(1, this.totalPulls));
    let bestArm = arms[0];
    let bestScore = -Infinity;

    for (const arm of arms) {
      const s = this.stats.get(arm);
      // istanbul ignore next -- defensive: every arm is initialised by the
      // untried-arms loop above before this branch is reachable.
      if (!s) continue;
      const mean = s.totalReward / s.pulls;
      const explore = this.c * Math.sqrt((2 * lnT) / s.pulls);
      const score = mean + explore;
      if (score > bestScore) {
        bestScore = score;
        bestArm = arm;
      }
    }

    return bestArm;
  }

  /** Record the outcome of pulling `arm`. */
  update(arm: string, reward: number): void {
    const cur = this.stats.get(arm) ?? { pulls: 0, totalReward: 0 };
    cur.pulls += 1;
    cur.totalReward += reward;
    this.stats.set(arm, cur);
    this.totalPulls += 1;
  }

  /** Read-only access to the per-arm statistics. */
  getStats(): ReadonlyMap<string, ArmStat> {
    return this.stats;
  }

  /** Mean reward for a given arm (0 when unpulled). */
  getMeanReward(arm: string): number {
    const s = this.stats.get(arm);
    if (!s || s.pulls === 0) return 0;
    return s.totalReward / s.pulls;
  }

  /** Total number of pulls across all arms. */
  getTotalPulls(): number {
    return this.totalPulls;
  }
}
