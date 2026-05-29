/**
 * MCOP Organelle Prompt Builder
 *
 * Reusable, production-grade utilities for constructing the system prompts
 * that turn a capable model (especially Grok-4.3+) into a remote MCOP organelle host.
 *
 * This is the extracted, first-class implementation of the prompt logic that was
 * previously duplicated in simulation examples. It is the primary mechanism for
 * shipping a compact LowMemoryMCOPProfile + prior traces to a model so it can
 * perform encode → resonate (stigmergy) → synthesize → etch operations internally.
 *
 * Design goals:
 * - Single source of truth for the grok-organelle-v2 (and future) protocols.
 * - Accept either a raw `LowMemoryMCOPProfile` or a `LowMemoryMCOPMode` instance.
 * - Support the two main usage patterns:
 *     1. Strict JSON-only output (current production adapter default).
 *     2. Tool-calling aware (for advanced multi-turn organelle sessions).
 * - Produce token-efficient, high-signal prompts.
 * - Remain fully deterministic and auditable (no hidden logic).
 *
 * Usage (typical adapter / orchestrator path):
 *   const mode = new LowMemoryMCOPMode(GROK_4_3_LOW_MEMORY_MCOP_PRESET);
 *   const profile = mode.buildProfile();
 *   const prompt = buildOrganelleSystemPrompt(profile, priorTraces, userTask, {
 *     includeToolSupport: false,
 *   });
 *
 * Then send `prompt` as the system message (plus the refined user task) when
 * `organelleMode` is active on the Grok adapter.
 */

import type {
  LowMemoryMCOPMode,
  LowMemoryMCOPProfile,
} from '../core/lowMemoryMCOPMode';

import { ORGANELLE_PROTOCOL_VERSION } from './organelleMerge';

export { ORGANELLE_PROTOCOL_VERSION };

export interface OrganellePriorTrace {
  id: string;
  resonance: number;
  summary: string;
  contextTensorHint?: string;
}

export interface OrganellePromptOptions {
  /**
   * Protocol version string embedded in the prompt.
   * Default: the current grok-organelle-v2 constant.
   */
  protocolVersion?: string;

  /**
   * When true, include tool-calling instructions and the two standard
   * organelle tools (`request_more_traces`, `query_resonance`).
   * When false (default), enforce strict single-JSON-object output.
   */
  includeToolSupport?: boolean;

  /**
   * Maximum number of prior traces to include in the prompt for context.
   * Traces are included in the order provided (most recent first is recommended).
   */
  maxPriorTracesToShow?: number;

  /**
   * Name of the expected output interface in the prompt.
   * Default: "OrganelleArtifacts"
   */
  outputSchemaName?: string;

  /**
   * Extra instructions appended before "Begin internal MCOP processing now."
   * Useful for domain-specific guidance or safety constraints.
   */
  additionalInstructions?: string;

  /**
   * If true, pretty-print the profile and traces JSON with 2-space indentation.
   * Default: true (more readable for the model).
   */
  prettyPrintContext?: boolean;
}

const DEFAULT_OPTIONS: Required<OrganellePromptOptions> = {
  protocolVersion: ORGANELLE_PROTOCOL_VERSION,
  includeToolSupport: false,
  maxPriorTracesToShow: 12,
  outputSchemaName: 'OrganelleArtifacts',
  additionalInstructions: '',
  prettyPrintContext: true,
};

function hasBuildProfile(
  input: LowMemoryMCOPProfile | LowMemoryMCOPMode
): input is LowMemoryMCOPMode {
  const candidate = input as { buildProfile?: unknown };
  return typeof candidate.buildProfile === 'function';
}

function resolveProfile(
  input: LowMemoryMCOPProfile | LowMemoryMCOPMode
): LowMemoryMCOPProfile {
  if (hasBuildProfile(input)) {
    return input.buildProfile();
  }
  return input;
}

function formatContext(
  value: unknown,
  pretty: boolean
): string {
  return JSON.stringify(value, null, pretty ? 2 : undefined);
}

function buildStrictJsonInstructions(schemaName: string): string[] {
  return [
    '=== OUTPUT RULES (STRICT) ===',
    `After internal reasoning, emit ONLY a single JSON object matching this TypeScript interface exactly:`,
    '',
    `interface ${schemaName} {`,
    '  synthesizedInsight: string;           // 2–6 sentence synthesis of the task through the MCOP lens',
    '  internalTraces: Array<{',
    '    id: string;                         // unique within this response',
    '    resonance: number;                  // 0.0–1.0',
    '    summary: string;                    // concise, high-signal',
    '    contextTensorHint?: string;         // JSON array of 8–32 floats, or "f32:<base64>"',
    '  }>;',
    '  proposedEtchDelta: number;            // typically 0.05–0.25',
    '  resonanceScores: Record<string, number>;',
    '  organelleNotes: string;',
    `  organelleProtocolVersion: "${ORGANELLE_PROTOCOL_VERSION}";`,
    '  modelInternalMerkleRoot?: string;',
    '}',
    '',
    'No markdown fences, no extra text, no explanations outside the JSON.',
  ];
}

function buildToolAwareInstructions(): string[] {
  return [
    '=== ALLOWED ACTIONS ===',
    '- Perform internal encoding (NOVA-NEO style), stigmergic recall, synthesis, and holographic etching using the provided profile.',
    '- If you need more context from the host, you MAY call the tool "request_more_traces".',
    '- You can also call "query_resonance" to test how well a potential new trace would fit.',
    '',
    '=== OUTPUT RULES ===',
    'You may make 0 or more tool calls in the standard OpenAI tool-calling format.',
    'After all tool interactions are resolved, you must end with a single JSON object matching the OrganelleArtifacts interface.',
  ];
}

/**
 * Builds the system prompt that instructs a model to act as an MCOP organelle host.
 *
 * This is the canonical, reusable implementation for the bidirectional Grok-MCOP
 * symbiosis (and any other model that supports the grok-organelle protocol family).
 */
export function buildOrganelleSystemPrompt(
  profileOrMode: LowMemoryMCOPProfile | LowMemoryMCOPMode,
  priorTraces: OrganellePriorTrace[],
  task: string,
  options: OrganellePromptOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const profile = resolveProfile(profileOrMode);

  const tracesToShow = priorTraces
    .slice(0, opts.maxPriorTracesToShow)
    .map((t) => ({
      id: t.id,
      resonance: t.resonance,
      summary: t.summary,
      contextTensorHint: t.contextTensorHint,
    }));

  const lines: string[] = [
    `You are operating as a host for the MCOP organelle under protocol ${opts.protocolVersion}.`,
    '',
    'You have received a compact LowMemoryMCOPProfile. You MUST run MCOP operations internally using this profile.',
    '',
  ];

  if (opts.includeToolSupport) {
    lines.push(...buildToolAwareInstructions());
  } else {
    lines.push('=== ALLOWED ACTIONS ===');
    lines.push(
      '- Perform internal encoding (NOVA-NEO style), stigmergic recall against prior traces, dialectical synthesis, and holographic etching.'
    );
    lines.push(
      '- Produce new internal traces with resonance scores (0.0–1.0).'
    );
    lines.push(
      '- Propose an etch delta (typically 0.05–0.25 for meaningful synthesis).'
    );
    lines.push(
      '- Include optional contextTensorHint (JSON array of 8–32 floats or f32:base64) for each trace so the host can reconstruct deterministic tensors.'
    );
    lines.push('');
    lines.push(...buildStrictJsonInstructions(opts.outputSchemaName));
  }

  if (opts.additionalInstructions) {
    lines.push('');
    lines.push(opts.additionalInstructions.trim());
  }

  lines.push('');
  lines.push('Compact LowMemoryMCOPProfile:');
  lines.push(formatContext(profile, opts.prettyPrintContext));
  lines.push('');
  lines.push('Available prior high-resonance traces (use for stigmergic recall):');
  lines.push(formatContext(tracesToShow, opts.prettyPrintContext));
  lines.push('');
  lines.push('Current task:');
  lines.push(task);
  lines.push('');
  lines.push('Begin internal MCOP processing now. When complete, output ONLY the JSON object (or tool calls if enabled).');

  return lines.join('\n');
}

/**
 * Convenience helper that returns both the system prompt and a suggested
 * structure for the user message (the actual refined task).
 *
 * Many adapters send the organelle instructions as the system message and
 * the MCOP-refined user task as the final user message.
 */
export function buildOrganellePromptPair(
  profileOrMode: LowMemoryMCOPProfile | LowMemoryMCOPMode,
  priorTraces: OrganellePriorTrace[],
  task: string,
  options?: OrganellePromptOptions
): { system: string; user: string } {
  return {
    system: buildOrganelleSystemPrompt(profileOrMode, priorTraces, task, options),
    user: task,
  };
}

/**
 * Returns the canonical tool definitions that a model may call when
 * `includeToolSupport: true` is used.
 *
 * These match the tools declared in the historical organelle experiments.
 */
export const ORGANELLE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'request_more_traces',
      description:
        'Request additional prior MCOP traces from the host for better stigmergic recall. Use when resonance is low or context is insufficient.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why more history is needed' },
          max_traces: { type: 'number', description: 'Maximum number of traces requested' },
          min_resonance: { type: 'number', description: 'Only return traces above this resonance' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_resonance',
      description:
        'Ask the host to compute resonance of a proposed internal trace against current host memory.',
      parameters: {
        type: 'object',
        properties: {
          proposed_summary: { type: 'string' },
        },
        required: ['proposed_summary'],
      },
    },
  },
] as const;
