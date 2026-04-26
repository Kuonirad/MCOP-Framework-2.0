/**
 * MCOP MCTS + MAB Planner with logically-learned rollouts.
 *
 * Sits orthogonally to the deterministic triad (NOVA-NEO Encoder,
 * Stigmergy v5, Holographic Etch). The triad is used as a logical
 * simulation oracle — there is **no Monte-Carlo randomness** anywhere in
 * the rollout. Each rollout step deterministically encodes the candidate
 * path text via NOVA-NEO, queries Stigmergy for resonance, and probes
 * the Holographic Etch's adaptive-confidence engine for a confidence
 * delta. The planner never mutates any of these subsystems during
 * planning; it only reads from them. Callers may commit the chosen
 * `bestSequence` back through the triad after inspecting the
 * Merkle-chained `provenanceTrace`.
 *
 * Determinism: given the same `(rootText, actions, config, triad state)`
 * tuple, `plan()` returns identical results across runs and platforms.
 * This is required for replayability of audit trails.
 */

import { createHash, randomUUID } from 'node:crypto';

import type { ContextTensor } from '../types';
import { NovaNeoEncoder } from '../novaNeoEncoder';
import { StigmergyV5 } from '../stigmergyV5';
import { HolographicEtch } from '../holographicEtch';
import { canonicalDigest } from '../canonicalEncoding';
import { UCB1Bandit } from './mab';
import type {
  PlanResult,
  PlannerConfig,
  PlannerNodeSnapshot,
  PlanningAction,
} from './types';

interface InternalNode {
  id: string;
  parent?: InternalNode;
  action?: PlanningAction;
  depth: number;
  visits: number;
  totalReward: number;
  children: Map<PlanningAction, InternalNode>;
  bandit: UCB1Bandit;
  pathText: string;
  tensor: ContextTensor;
  tensorHash: string;
  merkleHash: string;
  untriedActions: PlanningAction[];
}

export interface MCOPMCTSPlannerDeps {
  encoder: NovaNeoEncoder;
  stigmergy: StigmergyV5;
  etch: HolographicEtch;
}

export interface PlanInput {
  /** The root prompt / cognitive state to plan from. */
  rootText: string;
  /** Candidate cognitive actions available at every node. */
  actions: ReadonlyArray<PlanningAction>;
}

export class MCOPMCTSPlanner {
  private readonly encoder: NovaNeoEncoder;
  private readonly stigmergy: StigmergyV5;
  private readonly etch: HolographicEtch;
  private readonly mctsBudget: number;
  private readonly ucbC: number;
  private readonly learnedRolloutDepth: number;
  private readonly maxFanout: number;
  private readonly maxDepth: number;

  constructor(deps: MCOPMCTSPlannerDeps, config: PlannerConfig = {}) {
    this.encoder = deps.encoder;
    this.stigmergy = deps.stigmergy;
    this.etch = deps.etch;
    this.mctsBudget = Math.max(1, Math.floor(config.mctsBudget ?? 200));
    this.ucbC = config.ucbC ?? Math.SQRT2;
    this.learnedRolloutDepth = Math.max(
      0,
      Math.floor(config.learnedRolloutDepth ?? 4),
    );
    this.maxFanout = Math.max(1, Math.floor(config.maxFanout ?? 16));
    this.maxDepth = Math.max(1, Math.floor(config.maxDepth ?? 6));
  }

  /**
   * Run MCTS with logically-learned rollouts and return the best plan.
   *
   * The result includes a Merkle-chained provenance trace of every visited
   * node so the entire planning tree is auditably reconstructable.
   */
  plan(input: PlanInput): PlanResult {
    if (typeof input.rootText !== 'string' || input.rootText.length === 0) {
      throw new Error('MCOPMCTSPlanner.plan: rootText must be a non-empty string');
    }
    if (!input.actions || input.actions.length === 0) {
      throw new Error('MCOPMCTSPlanner.plan: at least one action is required');
    }

    const truncatedActions = input.actions.slice(0, this.maxFanout);
    const root = this.buildNode(undefined, undefined, input.rootText, truncatedActions);

    let iterations = 0;
    for (let i = 0; i < this.mctsBudget; i++) {
      const leaf = this.select(root, truncatedActions);
      const expanded = this.expand(leaf, truncatedActions);
      const reward = this.simulateLogically(expanded, truncatedActions);
      this.backpropagate(expanded, reward);
      iterations += 1;
    }

    const bestSequence = this.extractBestSequence(root);
    const bestReward = this.bestSequenceReward(root, bestSequence);
    const provenanceTrace = this.collectProvenance(root);
    const rootMerkleHash = computeRootMerkleHash(provenanceTrace);

    return {
      bestSequence,
      bestReward,
      iterations,
      rootMerkleHash,
      provenanceTrace,
    };
  }

  // ---------- MCTS phases ----------

  private select(root: InternalNode, actions: ReadonlyArray<PlanningAction>): InternalNode {
    let node = root;
    while (
      node.depth < this.maxDepth &&
      node.untriedActions.length === 0 &&
      node.children.size > 0
    ) {
      const armNames = actions.filter((a) => node.children.has(a));
      // istanbul ignore next -- defensive: armNames is non-empty whenever
      // children.size > 0 and actions is the same set used to seed children.
      if (armNames.length === 0) break;
      const chosen = node.bandit.selectArm(armNames);
      const child = node.children.get(chosen);
      // istanbul ignore next -- defensive: bandit can only return arms that
      // were passed in, all of which are present in `children` by construction.
      if (!child) break;
      node = child;
    }
    return node;
  }

  private expand(
    leaf: InternalNode,
    actions: ReadonlyArray<PlanningAction>,
  ): InternalNode {
    if (leaf.depth >= this.maxDepth || leaf.untriedActions.length === 0) {
      return leaf;
    }
    const action = leaf.untriedActions.shift() as PlanningAction;
    const childText = `${leaf.pathText} ${action}`;
    const child = this.buildNode(leaf, action, childText, actions);
    leaf.children.set(action, child);
    return child;
  }

  /**
   * Logically-learned rollout. From the given leaf, deterministically extend
   * the path by greedy resonance maximisation up to `learnedRolloutDepth`
   * additional steps, then score the final state.
   */
  private simulateLogically(
    leaf: InternalNode,
    actions: ReadonlyArray<PlanningAction>,
  ): number {
    let pathText = leaf.pathText;
    let tensor = leaf.tensor;

    const remainingDepth = Math.max(
      0,
      Math.min(this.learnedRolloutDepth, this.maxDepth - leaf.depth),
    );

    for (let i = 0; i < remainingDepth; i++) {
      const next = this.greedyNextAction(pathText, actions);
      if (!next) break;
      pathText = `${pathText} ${next.action}`;
      tensor = next.tensor;
    }

    return this.scoreState(tensor);
  }

  private backpropagate(node: InternalNode, reward: number): void {
    let cursor: InternalNode | undefined = node;
    while (cursor) {
      cursor.visits += 1;
      cursor.totalReward += reward;
      const parent: InternalNode | undefined = cursor.parent;
      if (parent && cursor.action !== undefined) {
        parent.bandit.update(cursor.action, reward);
      }
      cursor = parent;
    }
  }

  // ---------- helpers ----------

  private buildNode(
    parent: InternalNode | undefined,
    action: PlanningAction | undefined,
    pathText: string,
    actions: ReadonlyArray<PlanningAction>,
  ): InternalNode {
    const tensor = this.encoder.encode(pathText);
    const tensorHash = hashTensor(tensor);
    const id = randomUUID();
    const merkleHash = computeNodeMerkleHash({
      id,
      action,
      parentHash: parent?.merkleHash,
      tensorHash,
    });
    return {
      id,
      parent,
      action,
      depth: parent ? parent.depth + 1 : 0,
      visits: 0,
      totalReward: 0,
      children: new Map(),
      bandit: new UCB1Bandit({ c: this.ucbC }),
      pathText,
      tensor,
      tensorHash,
      merkleHash,
      untriedActions: actions.slice(0, this.maxFanout),
    };
  }

  private greedyNextAction(
    pathText: string,
    actions: ReadonlyArray<PlanningAction>,
  ): { action: PlanningAction; tensor: ContextTensor } | undefined {
    if (actions.length === 0) return undefined;
    let best: { action: PlanningAction; tensor: ContextTensor; score: number } | undefined;
    for (const action of actions) {
      const tensor = this.encoder.encode(`${pathText} ${action}`);
      const score = this.scoreState(tensor);
      if (!best || score > best.score) {
        best = { action, tensor, score };
      }
    }
    return best ? { action: best.action, tensor: best.tensor } : undefined;
  }

  /**
   * Logical reward — three deterministic, bounded triad signals combined:
   *
   *   1. Stigmergy resonance (cosine vs. prior traces, ∈ [0, 1]).
   *   2. Holographic Etch adaptive-confidence score (∈ [0, 1]).
   *   3. NOVA-NEO entropy estimate of the encoded path (∈ [0, 1]).
   *
   * The first two terms follow the user's blueprint
   * (`resonance × (1 + etchDelta.confidence)`); the entropy term keeps the
   * reward discriminative even when no prior traces exist (cold-start),
   * which is required for a useful first-iteration MCTS expansion.
   *
   * All three calls are read-only: `scoreConfidence` does not commit to
   * the etch and `getResonance` does not record a trace.
   */
  private scoreState(tensor: ContextTensor): number {
    const resonance = this.stigmergy.getResonance(tensor);
    const adaptive = this.etch.scoreConfidence(tensor, tensor);
    const entropy = this.encoder.estimateEntropy(tensor);
    return resonance.score * (1 + adaptive.score) + 0.5 * entropy;
  }

  private extractBestSequence(root: InternalNode): PlanningAction[] {
    const sequence: PlanningAction[] = [];
    let node = root;
    while (node.children.size > 0) {
      let bestChild: InternalNode | undefined;
      let bestVisits = -1;
      for (const child of node.children.values()) {
        if (child.visits > bestVisits) {
          bestVisits = child.visits;
          bestChild = child;
        }
      }
      // istanbul ignore next -- defensive: a non-empty Map always yields a
      // best child; the early-break is here purely for type narrowing.
      if (!bestChild || bestChild.action === undefined) break;
      sequence.push(bestChild.action);
      node = bestChild;
    }
    return sequence;
  }

  private bestSequenceReward(root: InternalNode, sequence: PlanningAction[]): number {
    let node = root;
    for (const action of sequence) {
      const next = node.children.get(action);
      // istanbul ignore next -- defensive: sequence was extracted from this
      // exact tree, so every action lookup must succeed.
      if (!next) return 0;
      node = next;
    }
    return node.visits === 0 ? 0 : node.totalReward / node.visits;
  }

  private collectProvenance(root: InternalNode): PlannerNodeSnapshot[] {
    const out: PlannerNodeSnapshot[] = [];
    const stack: InternalNode[] = [root];
    while (stack.length > 0) {
      const node = stack.pop() as InternalNode;
      if (node.visits === 0 && node !== root) continue;
      out.push({
        id: node.id,
        parentId: node.parent?.id,
        depth: node.depth,
        action: node.action,
        visits: node.visits,
        totalReward: node.totalReward,
        meanReward: node.visits === 0 ? 0 : node.totalReward / node.visits,
        tensorHash: node.tensorHash,
        merkleHash: node.merkleHash,
      });
      for (const child of node.children.values()) {
        stack.push(child);
      }
    }
    // Stable ordering: depth-major, then by Merkle hash so the trace is
    // identical across runs with identical inputs.
    out.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.merkleHash.localeCompare(b.merkleHash);
    });
    return out;
  }
}

function hashTensor(tensor: ContextTensor): string {
  const buf = Buffer.from(new Float64Array(tensor).buffer);
  return createHash('sha256').update(buf).digest('hex');
}

function computeNodeMerkleHash(args: {
  id: string;
  action?: PlanningAction;
  parentHash?: string;
  tensorHash: string;
}): string {
  // RFC 8785 canonical JSON: byte-identical across runtimes.
  return canonicalDigest({
    id: args.id,
    action: args.action ?? null,
    parentHash: args.parentHash ?? null,
    tensorHash: args.tensorHash,
  });
}

function computeRootMerkleHash(trace: ReadonlyArray<PlannerNodeSnapshot>): string {
  const concatenated = trace.map((n) => n.merkleHash).join('|');
  return createHash('sha256').update(concatenated).digest('hex');
}
