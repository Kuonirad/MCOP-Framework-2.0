/**
 * Devin Sub-Agent Orchestrator Adapter — wires arbitrary autonomous coding
 * sub-agents (the kind exposed by Devin / Cognition's MCP server, but the
 * shape generalises to any "spawn a session, dispatch a task, wait for an
 * artefact" platform) into the deterministic MCOP triad.
 *
 * Where the Grok adapter dispatches a single chat completion, this
 * adapter dispatches an entire **role** to a sub-agent — typically one
 * leg of a Researcher → Coder → Reviewer loop. Each leg gets its own
 * triad pass: encode → resonate → dialectical synthesise → etch → call.
 * Resonance against prior legs lets the orchestrator detect when a
 * sub-agent has effectively repeated work and short-circuit cheaply.
 *
 * The adapter does NOT bundle Devin's MCP client. Instead it accepts a
 * thin `SubAgentClient` interface so callers can supply either:
 *
 *   - the bundled `mockSubAgentClient(...)` (deterministic offline harness
 *     used by examples and Jest specs), or
 *   - a real Devin MCP client that calls `devin_mcp` `create_session` /
 *     `send_message` / `read_session_events` under the hood.
 *
 * Self-referential routing: combine the adapter with the entropy/resonance
 * router from `grokAdapter.ts` so MCOP itself decides whether a task is
 * worth dispatching to a fresh sub-agent or whether the cached resonance
 * trace is enough.
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

/**
 * Canonical sub-agent roles. The string is forwarded verbatim to the
 * underlying client so additional roles ("Refactorer", "Documenter", …)
 * are trivially supported.
 */
export type SubAgentRole =
  | 'researcher'
  | 'coder'
  | 'reviewer'
  | (string & {});

/**
 * Per-task options. Token / time budgets are forwarded to the client so
 * the underlying Devin session can self-cap.
 */
export interface SubAgentTaskOptions {
  /** Max tokens / time budget — interpretation is client-defined. */
  maxTokens?: number;
  /** Optional system instructions prepended verbatim by the client. */
  systemInstructions?: string;
  /** Free-form tags forwarded to the client (for cost attribution). */
  tags?: ReadonlyArray<string>;
}

export interface SubAgentRequest extends AdapterRequest {
  role: SubAgentRole;
  payload?: {
    options?: SubAgentTaskOptions;
  };
}

/** Subset of the sub-agent usage block we surface to callers. */
export interface SubAgentUsage {
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly tokensTotal: number;
  /** Wall-clock duration in milliseconds reported by the client. */
  readonly durationMs?: number;
}

export interface SubAgentResult {
  readonly role: SubAgentRole;
  readonly output: string;
  readonly sessionUrl: string | null;
  readonly usage: SubAgentUsage | null;
  readonly raw?: unknown;
}

/**
 * Minimal sub-agent client surface — keeps the adapter platform-agnostic
 * and trivial to mock. Implementations MUST forward `role` and `prompt`
 * verbatim and return a `SubAgentResult`.
 */
export interface SubAgentClient {
  dispatchTask(args: {
    role: SubAgentRole;
    prompt: string;
    options: SubAgentTaskOptions;
  }): Promise<SubAgentResult>;
}

export interface DevinOrchestratorAdapterConfig extends BaseAdapterDeps {
  client: SubAgentClient;
}

/* --------------------------------------------------------------------- */
/* Adapter                                                                */
/* --------------------------------------------------------------------- */

export class DevinOrchestratorAdapter extends BaseAdapter<
  SubAgentRequest,
  SubAgentResult
> {
  private readonly client: SubAgentClient;

  constructor(config: DevinOrchestratorAdapterConfig) {
    super(config);
    this.client = config.client;
  }

  protected platformName(): string {
    return 'devin-suba-gent';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: 'devin-suba-gent',
      version: '2025-01',
      models: ['researcher', 'coder', 'reviewer'],
      supportsAudit: true,
      features: [
        'multi-role-orchestration',
        'mcop-triad-refinement',
        'human-veto',
        'resonance-cache-detection',
        'session-link-export',
        'cost-attribution-tags',
      ],
      notes:
        'Generic orchestrator for autonomous coding sub-agents (Devin, ' +
        'Manus, etc.). Each role-task is funnelled through the MCOP triad ' +
        '(encode → resonance → dialectical synth → etch) and the resulting ' +
        "Merkle-rooted ProvenanceMetadata bundle is what governs the loop's " +
        'auditability — sub-agents themselves stay opaque on purpose.',
    };
  }

  /**
   * v2.1-spec convenience facade: dispatch a single role-task through the
   * triad. Multi-leg loops (Researcher → Coder → Reviewer) are composed
   * by `runResearcherCoderReviewer` below.
   */
  async dispatchOptimizedTask(
    role: SubAgentRole,
    prompt: string,
    options: SubAgentTaskOptions = {},
    extras: Pick<
      SubAgentRequest,
      'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'
    > = {},
  ): Promise<AdapterResponse<SubAgentResult>> {
    return this.generate({
      role,
      prompt,
      domain: 'generic',
      entropyTarget: extras.entropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: {
        ...(extras.metadata ?? {}),
        role,
        assetKind: 'sub-agent-artefact',
      },
      payload: { options },
    });
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: SubAgentRequest,
  ): Promise<SubAgentResult> {
    const opts = request.payload?.options ?? {};
    return this.client.dispatchTask({
      role: request.role,
      prompt: dispatch.refinedPrompt,
      options: opts,
    });
  }
}

/* --------------------------------------------------------------------- */
/* Researcher → Coder → Reviewer loop                                     */
/* --------------------------------------------------------------------- */

export interface ResearcherCoderReviewerInput {
  /** The user-facing task description that seeds the Researcher leg. */
  task: string;
  /** Optional per-leg options. */
  options?: {
    researcher?: SubAgentTaskOptions;
    coder?: SubAgentTaskOptions;
    reviewer?: SubAgentTaskOptions;
  };
  /**
   * Resonance threshold above which a leg is considered a cache hit —
   * the loop short-circuits and reuses the prior leg's output instead of
   * calling the sub-agent again. Default 0.85.
   */
  cacheResonanceThreshold?: number;
  /**
   * Optional per-leg human-veto/rewrite/notes hook. When provided it is
   * called BEFORE each leg's dispatch and its return value is forwarded
   * to the dialectical synthesiser, so an operator can interrupt the
   * loop without restarting it.
   */
  humanReview?: (
    leg: SubAgentRole,
    pendingPrompt: string,
  ) =>
    | { veto?: boolean; rewrittenPrompt?: string; notes?: string }
    | undefined;
}

export interface ResearcherCoderReviewerLeg {
  readonly role: SubAgentRole;
  readonly response: AdapterResponse<SubAgentResult> | null;
  /** True when resonance fired and the leg was satisfied from cache. */
  readonly cacheHit: boolean;
  /** True when the operator vetoed this leg via `humanReview`. */
  readonly vetoed: boolean;
}

export interface ResearcherCoderReviewerReport {
  readonly task: string;
  readonly legs: ReadonlyArray<ResearcherCoderReviewerLeg>;
  readonly merkleChain: ReadonlyArray<string>;
  readonly totalUsage: SubAgentUsage;
  readonly cacheHits: number;
  readonly humanVetoes: number;
}

const ZERO_USAGE: SubAgentUsage = {
  tokensIn: 0,
  tokensOut: 0,
  tokensTotal: 0,
  durationMs: 0,
};

function addUsage(
  a: SubAgentUsage,
  b: SubAgentUsage | null,
): SubAgentUsage {
  if (!b) return a;
  return {
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    tokensTotal: a.tokensTotal + b.tokensTotal,
    durationMs: (a.durationMs ?? 0) + (b.durationMs ?? 0),
  };
}

/**
 * Drive the Researcher → Coder → Reviewer loop. Each leg is dispatched
 * through the supplied `DevinOrchestratorAdapter`, which means each leg
 * gets:
 *
 *   - a fresh tensor + entropy estimate,
 *   - a resonance score against every prior leg recorded so far,
 *   - a dialectical synthesis pass (with the operator's veto / rewrite /
 *     notes injected),
 *   - a Merkle-rooted ProvenanceMetadata bundle in the returned report.
 *
 * When resonance ≥ `cacheResonanceThreshold` the loop reuses the prior
 * leg's artefact instead of calling the sub-agent — this is the
 * "before/after" win the case study highlights.
 */
export async function runResearcherCoderReviewer(
  adapter: DevinOrchestratorAdapter,
  input: ResearcherCoderReviewerInput,
): Promise<ResearcherCoderReviewerReport> {
  const cacheThreshold = input.cacheResonanceThreshold ?? 0.85;
  const legs: ResearcherCoderReviewerLeg[] = [];
  const merkleChain: string[] = [];
  let totalUsage: SubAgentUsage = ZERO_USAGE;
  let cacheHits = 0;
  let humanVetoes = 0;

  const sequence: ReadonlyArray<{
    role: SubAgentRole;
    promptFor(prior: ReadonlyArray<ResearcherCoderReviewerLeg>): string;
    options?: SubAgentTaskOptions;
  }> = [
    {
      role: 'researcher',
      promptFor: () =>
        `Research and outline the constraints, prior art, and risks for the ` +
        `following task. Produce a numbered findings list. Task:\n${input.task}`,
      options: input.options?.researcher,
    },
    {
      role: 'coder',
      promptFor: (prior) => {
        const research =
          prior[0]?.response?.result.output ??
          '(no research available — proceed cautiously)';
        return (
          `Using the research findings below, propose a concrete code change ` +
          `for the task. Output a unified diff or a short implementation plan, ` +
          `whichever is more useful.\n\nRESEARCH:\n${research}\n\nTASK:\n${input.task}`
        );
      },
      options: input.options?.coder,
    },
    {
      role: 'reviewer',
      promptFor: (prior) => {
        const research = prior[0]?.response?.result.output ?? '(none)';
        const code = prior[1]?.response?.result.output ?? '(none)';
        return (
          `Review the proposed change for correctness, regressions, and ` +
          `provenance auditability. Reference the research findings explicitly. ` +
          `Output PASS or FAIL plus a numbered review list.\n\nRESEARCH:\n${research}\n\nCODE:\n${code}\n\nTASK:\n${input.task}`
        );
      },
      options: input.options?.reviewer,
    },
  ];

  for (const step of sequence) {
    const pendingPrompt = step.promptFor(legs);
    const review = input.humanReview?.(step.role, pendingPrompt);
    if (review?.veto === true) {
      humanVetoes += 1;
      legs.push({
        role: step.role,
        response: null,
        cacheHit: false,
        vetoed: true,
      });
      continue;
    }

    // Dry-run the triad to inspect resonance BEFORE dispatching. If the
    // current task already resonates strongly with a prior leg's tensor,
    // the loop reuses that artefact verbatim — same Merkle root, no new
    // sub-agent call.
    const probeRequest: SubAgentRequest = {
      role: step.role,
      prompt: review?.rewrittenPrompt ?? pendingPrompt,
      domain: 'generic',
      humanFeedback: review
        ? {
            veto: review.veto,
            rewrittenPrompt: review.rewrittenPrompt,
            notes: review.notes,
          }
        : undefined,
      metadata: { role: step.role, assetKind: 'sub-agent-artefact' },
      payload: { options: step.options ?? {} },
    };
    const probe = adapter.prepare(probeRequest);
    if (probe.resonance.score >= cacheThreshold && legs.length > 0) {
      const cachedFrom =
        legs.find((leg) => leg.response !== null) ?? legs[0];
      cacheHits += 1;
      legs.push({
        role: step.role,
        response: cachedFrom.response,
        cacheHit: true,
        vetoed: false,
      });
      merkleChain.push(probe.etchHash);
      continue;
    }

    // Cold path — actually dispatch.
    const response = await adapter.dispatchOptimizedTask(
      step.role,
      review?.rewrittenPrompt ?? pendingPrompt,
      step.options ?? {},
      {
        humanFeedback: review
          ? {
              veto: review.veto,
              rewrittenPrompt: review.rewrittenPrompt,
              notes: review.notes,
            }
          : undefined,
        metadata: { role: step.role },
      },
    );
    merkleChain.push(response.merkleRoot);
    totalUsage = addUsage(totalUsage, response.result.usage);
    legs.push({
      role: step.role,
      response,
      cacheHit: false,
      vetoed: false,
    });
  }

  return {
    task: input.task,
    legs,
    merkleChain,
    totalUsage,
    cacheHits,
    humanVetoes,
  };
}

/* --------------------------------------------------------------------- */
/* Mock client for offline examples + tests                               */
/* --------------------------------------------------------------------- */

export interface MockSubAgentClientConfig {
  /**
   * Per-role response generator. Defaults produce short, deterministic
   * artefacts that exercise the resonance / dialectical pipeline without
   * any network access — perfect for CI-friendly examples.
   */
  responders?: Partial<
    Record<
      SubAgentRole,
      (args: {
        prompt: string;
        options: SubAgentTaskOptions;
      }) => SubAgentResult
    >
  >;
}

const DEFAULT_RESPONDERS: Record<
  string,
  (args: { prompt: string; options: SubAgentTaskOptions }) => SubAgentResult
> = {
  researcher: ({ prompt }) => ({
    role: 'researcher',
    output:
      `Findings:\n` +
      `1. Existing literature covers the core sub-problem.\n` +
      `2. Prior MCOP integrations imply a deterministic refinement step.\n` +
      `3. Risk: under-specified human-veto path.\nPrompt-echo: ${prompt.slice(0, 80)}`,
    sessionUrl: null,
    usage: { tokensIn: prompt.length, tokensOut: 256, tokensTotal: prompt.length + 256, durationMs: 1200 },
  }),
  coder: ({ prompt }) => ({
    role: 'coder',
    output:
      `Plan:\n` +
      `- Implement the change in src/adapters/<adapter>.ts.\n` +
      `- Cover with one Jest spec per branch.\n` +
      `- Surface provenance verbatim in the returned bundle.\nPrompt-echo: ${prompt.slice(0, 80)}`,
    sessionUrl: null,
    usage: { tokensIn: prompt.length, tokensOut: 384, tokensTotal: prompt.length + 384, durationMs: 1800 },
  }),
  reviewer: ({ prompt }) => ({
    role: 'reviewer',
    output:
      `PASS\n` +
      `1. Research findings are referenced correctly.\n` +
      `2. Code change preserves Merkle provenance shape.\n` +
      `3. Recommend adding INTEGRATIONS.md row before merge.\nPrompt-echo: ${prompt.slice(0, 80)}`,
    sessionUrl: null,
    usage: { tokensIn: prompt.length, tokensOut: 192, tokensTotal: prompt.length + 192, durationMs: 900 },
  }),
};

/**
 * In-memory `SubAgentClient` that returns deterministic artefacts per
 * role. Used by the example script and the test suite so the case study
 * is reproducible offline.
 */
export function mockSubAgentClient(
  config: MockSubAgentClientConfig = {},
): SubAgentClient {
  const responders = { ...DEFAULT_RESPONDERS, ...(config.responders ?? {}) };
  return {
    async dispatchTask({ role, prompt, options }) {
      const responder =
        (responders as Record<string, typeof DEFAULT_RESPONDERS[string] | undefined>)[role] ??
        DEFAULT_RESPONDERS.reviewer;
      return responder({ prompt, options });
    },
  };
}
