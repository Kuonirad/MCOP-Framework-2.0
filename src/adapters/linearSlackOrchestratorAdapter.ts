/**
 * Linear + Slack MCP Orchestrator — wires the two collaboration tools
 * we already speak to via MCP (Linear: list/create/update issues; Slack:
 * post messages, manage canvases) into the deterministic MCOP triad.
 *
 * The orchestrator does NOT bundle either MCP client; it accepts thin
 * `LinearClient` and `SlackClient` interfaces so callers can supply
 * either:
 *
 *   - the bundled `mockLinearClient(...)` / `mockSlackClient(...)`
 *     (deterministic offline harnesses used by examples + Jest specs),
 *     or
 *   - real MCP-backed clients that call the linear / slack-remote MCP
 *     servers under the hood.
 *
 * Routing model — the orchestrator uses MCOP's own signals to decide
 * what to do for each incoming event:
 *
 *   - high resonance against a prior trace + low entropy
 *       → SLACK-ONLY ping (operator already knows the situation; just
 *         emit a status update)
 *   - novel + medium entropy
 *       → BOTH (post a Slack heads-up *and* open / update a Linear issue)
 *   - novel + high entropy + low resonance
 *       → LINEAR-ONLY (file a Linear issue for triage; don't spam Slack
 *         until a human acks)
 *   - vetoed by the operator
 *       → NONE (no calls; provenance bundle still recorded for audit)
 *
 * All four routes return a Merkle-rooted `ProvenanceMetadata` bundle so
 * the on-call timeline is reproducible across replays.
 */

import {
  BaseAdapter,
  BaseAdapterDeps,
  PreparedDispatch,
} from './baseAdapter';
import {
  AdapterCapabilities,
  AdapterRequest,
  AdapterResponse,
} from './types';

/* --------------------------------------------------------------------- */
/* Public types                                                           */
/* --------------------------------------------------------------------- */

export type LinearSlackAction =
  | 'slack-only'
  | 'linear-only'
  | 'both'
  | 'none';

export interface LinearSlackRouterConfig {
  /** Resonance ≥ this → Slack-only ping. Default 0.8. */
  slackOnlyResonanceFloor?: number;
  /** Entropy ≥ this AND low resonance → Linear-only triage. Default 0.4. */
  linearOnlyEntropyFloor?: number;
  /** Resonance < this is treated as "novel" for routing. Default 0.4. */
  noveltyResonanceCeiling?: number;
}

const DEFAULT_ROUTER: Required<LinearSlackRouterConfig> = {
  slackOnlyResonanceFloor: 0.8,
  linearOnlyEntropyFloor: 0.4,
  noveltyResonanceCeiling: 0.4,
};

/**
 * Pure routing decision — exposed separately so callers can A/B-test
 * policies, dry-run thresholds, or replace the router entirely without
 * touching the adapter. Mirrors the shape of
 * `chooseProviderByEntropyResonance` in `grokAdapter.ts`.
 */
export function chooseLinearSlackAction(
  signals: { readonly entropy: number; readonly resonance: number },
  config: LinearSlackRouterConfig = {},
): LinearSlackAction {
  const cfg = { ...DEFAULT_ROUTER, ...config };
  if (signals.resonance >= cfg.slackOnlyResonanceFloor) return 'slack-only';
  if (
    signals.resonance < cfg.noveltyResonanceCeiling &&
    signals.entropy >= cfg.linearOnlyEntropyFloor
  ) {
    return 'linear-only';
  }
  return 'both';
}

/* --------------------------------------------------------------------- */
/* Linear + Slack client surfaces                                         */
/* --------------------------------------------------------------------- */

export interface LinearIssueDescriptor {
  readonly id: string;
  readonly identifier: string; // e.g. "MCOP-42"
  readonly url: string;
  readonly title: string;
  readonly state: string;
}

export interface LinearClient {
  /**
   * Create an issue. The orchestrator passes the refined prompt as the
   * issue body so MCOP's dialectical-synthesis output is what gets
   * filed, not the raw operator input.
   */
  createIssue(args: {
    title: string;
    description: string;
    teamKey?: string;
    labels?: ReadonlyArray<string>;
  }): Promise<LinearIssueDescriptor>;
  /** Append an audit comment to an existing issue. */
  appendComment(args: {
    issueId: string;
    body: string;
  }): Promise<{ readonly id: string }>;
}

export interface SlackPostResult {
  readonly channel: string;
  readonly ts: string;
  readonly permalink: string | null;
}

export interface SlackClient {
  postMessage(args: {
    channel: string;
    text: string;
    threadTs?: string;
  }): Promise<SlackPostResult>;
}

export interface LinearSlackRequest extends AdapterRequest {
  /** Linear team key (e.g. "MCOP"). Required when routing to Linear. */
  linearTeamKey?: string;
  /** Slack channel ID or name. Required when routing to Slack. */
  slackChannel?: string;
  /** Free-form labels appended to created Linear issues. */
  linearLabels?: ReadonlyArray<string>;
  /** Optional title override for created Linear issues. */
  linearTitle?: string;
  /** Threaded Slack reply target. */
  slackThreadTs?: string;
  /** Override the router on a per-call basis. */
  router?: LinearSlackRouterConfig;
}

export interface LinearSlackResult {
  readonly action: LinearSlackAction;
  readonly slack: SlackPostResult | null;
  readonly linear: LinearIssueDescriptor | null;
  readonly comment: { readonly id: string } | null;
  readonly signals: {
    readonly entropy: number;
    readonly resonance: number;
  };
}

export interface LinearSlackOrchestratorConfig extends BaseAdapterDeps {
  linear: LinearClient;
  slack: SlackClient;
  /** Default Linear team key when the request omits one. */
  defaultLinearTeamKey?: string;
  /** Default Slack channel when the request omits one. */
  defaultSlackChannel?: string;
  router?: LinearSlackRouterConfig;
}

/* --------------------------------------------------------------------- */
/* Adapter                                                                */
/* --------------------------------------------------------------------- */

export class LinearSlackOrchestratorAdapter extends BaseAdapter<
  LinearSlackRequest,
  LinearSlackResult
> {
  private readonly linear: LinearClient;
  private readonly slack: SlackClient;
  private readonly defaultLinearTeamKey?: string;
  private readonly defaultSlackChannel?: string;
  private readonly defaultRouter: LinearSlackRouterConfig;

  constructor(config: LinearSlackOrchestratorConfig) {
    super(config);
    this.linear = config.linear;
    this.slack = config.slack;
    this.defaultLinearTeamKey = config.defaultLinearTeamKey;
    this.defaultSlackChannel = config.defaultSlackChannel;
    this.defaultRouter = config.router ?? {};
  }

  protected platformName(): string {
    return 'linear-slack-mcp';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'linear-slack-mcp',
      version: '2025-01',
      models: ['linear-issues', 'slack-messages'],
      supportsAudit: true,
      features: [
        'mcp-orchestration',
        'mcop-triad-refinement',
        'human-veto',
        'entropy-resonance-routing',
        'multi-tool-fanout',
        'merkle-rooted-audit',
      ],
      notes:
        "Routes inbound prompts (incident reports, on-call alerts, " +
        "automation triggers) to Linear and/or Slack via the MCP servers. " +
        "Routing decision is governed by MCOP entropy + resonance, with " +
        "the dialectical synthesizer providing the human-veto escape hatch.",
    };
  }

  /** v2.1-spec convenience facade. */
  async dispatchOptimizedAlert(
    prompt: string,
    extras: Pick<
      LinearSlackRequest,
      | 'styleContext'
      | 'humanFeedback'
      | 'metadata'
      | 'entropyTarget'
      | 'linearTeamKey'
      | 'slackChannel'
      | 'linearLabels'
      | 'linearTitle'
      | 'slackThreadTs'
      | 'router'
    > = {},
  ): Promise<AdapterResponse<LinearSlackResult>> {
    return this.generate({
      prompt,
      domain: 'generic',
      entropyTarget: extras.entropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      linearTeamKey: extras.linearTeamKey ?? this.defaultLinearTeamKey,
      slackChannel: extras.slackChannel ?? this.defaultSlackChannel,
      linearLabels: extras.linearLabels,
      linearTitle: extras.linearTitle,
      slackThreadTs: extras.slackThreadTs,
      router: extras.router,
      metadata: {
        ...(extras.metadata ?? {}),
        assetKind: 'linear-slack-orchestration',
      },
    });
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: LinearSlackRequest,
  ): Promise<LinearSlackResult> {
    const entropy = this.encoder.estimateEntropy(dispatch.tensor);
    const resonance = dispatch.resonance.score;
    const signals = { entropy, resonance };
    const action = chooseLinearSlackAction(signals, {
      ...this.defaultRouter,
      ...(request.router ?? {}),
    });

    let slack: SlackPostResult | null = null;
    let linear: LinearIssueDescriptor | null = null;
    let comment: { readonly id: string } | null = null;

    const linearTeamKey =
      request.linearTeamKey ?? this.defaultLinearTeamKey;
    const slackChannel = request.slackChannel ?? this.defaultSlackChannel;

    if (action === 'slack-only' || action === 'both') {
      if (!slackChannel) {
        throw new Error(
          'linear-slack-mcp: slackChannel is required for ' +
            "actions 'slack-only' or 'both'",
        );
      }
      slack = await this.slack.postMessage({
        channel: slackChannel,
        text: dispatch.refinedPrompt,
        threadTs: request.slackThreadTs,
      });
    }

    if (action === 'linear-only' || action === 'both') {
      if (!linearTeamKey) {
        throw new Error(
          'linear-slack-mcp: linearTeamKey is required for ' +
            "actions 'linear-only' or 'both'",
        );
      }
      linear = await this.linear.createIssue({
        title: request.linearTitle ?? deriveTitle(dispatch.refinedPrompt),
        description: dispatch.refinedPrompt,
        teamKey: linearTeamKey,
        labels: request.linearLabels,
      });
      // Audit anchor: the Merkle root of THIS dispatch is appended as a
      // comment so the issue is replayable from its own metadata.
      comment = await this.linear.appendComment({
        issueId: linear.id,
        body:
          `MCOP audit anchor — merkle=${dispatch.etchHash} ` +
          `entropy=${entropy.toFixed(4)} resonance=${resonance.toFixed(4)}`,
      });
    }

    return { action, slack, linear, comment, signals };
  }
}

/* --------------------------------------------------------------------- */
/* Helpers                                                                */
/* --------------------------------------------------------------------- */

function deriveTitle(refinedPrompt: string): string {
  const firstLine = refinedPrompt.split('\n', 1)[0]?.trim() ?? refinedPrompt;
  if (firstLine.length <= 80) return firstLine;
  return firstLine.slice(0, 77) + '...';
}

/* --------------------------------------------------------------------- */
/* Mock clients for offline examples + tests                              */
/* --------------------------------------------------------------------- */

export interface MockLinearClientConfig {
  readonly teamKeyPrefix?: string;
}

export function mockLinearClient(
  config: MockLinearClientConfig = {},
): LinearClient {
  const prefix = config.teamKeyPrefix ?? 'MCOP';
  let counter = 0;
  let commentCounter = 0;
  return {
    async createIssue({ title, teamKey }) {
      counter += 1;
      const team = teamKey ?? prefix;
      const identifier = `${team}-${counter}`;
      return {
        id: `mock-issue-${identifier}`,
        identifier,
        url: `https://linear.app/mock/${team.toLowerCase()}/issue/${identifier}`,
        title,
        state: 'Triage',
      };
    },
    async appendComment() {
      commentCounter += 1;
      return { id: `mock-comment-${commentCounter}` };
    },
  };
}

export function mockSlackClient(): SlackClient {
  let counter = 0;
  return {
    async postMessage({ channel }) {
      counter += 1;
      const ts = `${Date.now()}.${counter.toString().padStart(6, '0')}`;
      return {
        channel,
        ts,
        permalink: `https://slack.com/archives/${channel}/p${ts.replace('.', '')}`,
      };
    },
  };
}
