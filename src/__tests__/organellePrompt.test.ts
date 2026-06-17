/**
 * @jest-environment node
 */
import { LowMemoryMCOPMode } from '../core';
import {
  buildOrganellePromptPair,
  buildOrganelleSystemPrompt,
  ORGANELLE_PROTOCOL_VERSION,
  ORGANELLE_TOOLS,
} from '../utils/organellePrompt';
import type {
  OrganellePriorTrace,
} from '../utils/organellePrompt';

function extractJsonSection(prompt: string, startMarker: string, endMarker: string): unknown {
  const start = prompt.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const afterStart = prompt.slice(start + startMarker.length);
  const end = afterStart.indexOf(endMarker);
  expect(end).toBeGreaterThanOrEqual(0);
  return JSON.parse(afterStart.slice(0, end).trim());
}

const priorTraces: OrganellePriorTrace[] = [
  {
    id: 'trace-1',
    resonance: 0.97,
    summary: 'Recent high-resonance memory',
    contextTensorHint: '[0.1,0.2,0.3]',
  },
  {
    id: 'trace-2',
    resonance: 0.83,
    summary: 'Second relevant memory',
  },
  {
    id: 'trace-3',
    resonance: 0.76,
    summary: 'Should be truncated from the prompt',
  },
];

describe('buildOrganelleSystemPrompt', () => {
  it('builds a strict JSON prompt from a LowMemoryMCOPMode and truncates prior traces deterministically', () => {
    const mode = new LowMemoryMCOPMode({
      maxTraces: 5,
      tensorDim: 8,
      promptTokenBudget: 512,
    });

    const prompt = buildOrganelleSystemPrompt(
      mode,
      priorTraces,
      'Synthesize a risk-controlled launch plan.',
      {
        additionalInstructions: 'Keep regulated claims grounded in evidence.  ',
        maxPriorTracesToShow: 2,
        outputSchemaName: 'RemoteOrganelleArtifacts',
      },
    );

    expect(prompt).toContain(`protocol ${ORGANELLE_PROTOCOL_VERSION}`);
    expect(prompt).toContain('=== OUTPUT RULES (STRICT) ===');
    expect(prompt).toContain('interface RemoteOrganelleArtifacts');
    expect(prompt).toContain('No markdown fences, no extra text');
    expect(prompt).toContain('Keep regulated claims grounded in evidence.');
    expect(prompt).toContain('Synthesize a risk-controlled launch plan.');
    expect(prompt).not.toContain('request_more_traces');

    const profile = extractJsonSection(
      prompt,
      'Compact LowMemoryMCOPProfile:\n',
      '\n\nAvailable prior high-resonance traces',
    ) as { settings: { maxTraces: number; tensorDim: number; promptTokenBudget: number } };
    expect(profile.settings).toMatchObject({
      maxTraces: 5,
      tensorDim: 8,
      promptTokenBudget: 512,
    });

    const traces = extractJsonSection(
      prompt,
      'Available prior high-resonance traces (use for stigmergic recall):\n',
      '\n\nCurrent task:',
    ) as OrganellePriorTrace[];
    expect(traces.map((trace) => trace.id)).toEqual(['trace-1', 'trace-2']);
    expect(traces[0]).toMatchObject({
      resonance: 0.97,
      summary: 'Recent high-resonance memory',
      contextTensorHint: '[0.1,0.2,0.3]',
    });
  });

  it('supports raw profiles, compact context JSON, and tool-aware prompt mode', () => {
    const rawProfile = new LowMemoryMCOPMode({
      maxTraces: 2,
      tensorDim: 4,
      useTypedArrays: false,
    }).buildProfile();

    const prompt = buildOrganelleSystemPrompt(
      rawProfile,
      priorTraces.slice(0, 1),
      'Ask the host for more memory when needed.',
      {
        includeToolSupport: true,
        prettyPrintContext: false,
      },
    );

    expect(prompt).toContain('=== ALLOWED ACTIONS ===');
    expect(prompt).toContain('request_more_traces');
    expect(prompt).toContain('query_resonance');
    expect(prompt).toContain('standard OpenAI tool-calling format');
    expect(prompt).not.toContain('=== OUTPUT RULES (STRICT) ===');
    expect(prompt).not.toContain('\n  "encoderConfig"');
    expect(prompt).toContain('"useTypedArrays":false');
  });
});

describe('buildOrganellePromptPair', () => {
  it('returns the generated system prompt with the task as the user message', () => {
    const profile = new LowMemoryMCOPMode({ tensorDim: 4 }).buildProfile();
    const pair = buildOrganellePromptPair(profile, [], 'Refine the operator brief.');

    expect(pair.system).toContain('Compact LowMemoryMCOPProfile:');
    expect(pair.system).toContain('Refine the operator brief.');
    expect(pair.user).toBe('Refine the operator brief.');
  });
});

describe('ORGANELLE_TOOLS', () => {
  it('publishes the canonical tool definitions expected by tool-aware prompts', () => {
    expect(ORGANELLE_TOOLS.map((tool) => tool.function.name)).toEqual([
      'request_more_traces',
      'query_resonance',
    ]);
    expect(ORGANELLE_TOOLS[0].function.parameters.required).toEqual(['reason']);
    expect(ORGANELLE_TOOLS[1].function.parameters.required).toEqual([
      'proposed_summary',
    ]);
  });
});
