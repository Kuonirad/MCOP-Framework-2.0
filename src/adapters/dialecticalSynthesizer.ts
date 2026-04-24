/**
 * Dialectical synthesizer — deterministic, human-in-the-loop refinement
 * stage that sits between the MCOP encoder/stigmergy step and the platform
 * call. It does not depend on or modify the core triad; it merely composes
 * the prompt + resonance signal + optional human feedback into a final
 * dispatched prompt.
 */

import type { ResonanceResult } from '../core/types';
import {
  HumanFeedback,
  HumanVetoError,
  IDialecticalSynthesizer,
} from './types';

export interface DialecticalSynthesizerConfig {
  /**
   * When the resonance score meets or exceeds this threshold, the
   * synthesizer appends a continuity preamble derived from the prior
   * trace's metadata so brand/style continuity is preserved across calls.
   */
  resonancePreambleThreshold?: number;
}

export class DialecticalSynthesizer implements IDialecticalSynthesizer {
  private readonly resonancePreambleThreshold: number;

  constructor(config: DialecticalSynthesizerConfig = {}) {
    this.resonancePreambleThreshold = config.resonancePreambleThreshold ?? 0.6;
  }

  synthesize(
    prompt: string,
    resonance: ResonanceResult,
    feedback?: HumanFeedback,
  ): string {
    if (feedback?.veto) {
      throw new HumanVetoError();
    }

    if (feedback?.rewrittenPrompt) {
      return feedback.rewrittenPrompt;
    }

    const parts: string[] = [];

    if (
      resonance.trace &&
      resonance.score >= this.resonancePreambleThreshold
    ) {
      const note = pickStringMeta(resonance.trace.metadata, 'note');
      const styleTag = note
        ? `[continuity:${note}]`
        : `[continuity:${resonance.trace.id.slice(0, 8)}]`;
      parts.push(styleTag);
    }

    parts.push(prompt.trim());

    if (feedback?.notes) {
      parts.push(`[operator-notes] ${feedback.notes.trim()}`);
    }

    return parts.join(' ');
  }
}

function pickStringMeta(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!metadata) return undefined;
  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
}
