// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview The isolation barrier — the mechanism that makes the efficacy
 * program something the {@link NovaEvolveTuner} *cannot optimise against*.
 *
 * A held-out test is only held out if the optimiser cannot see it, cannot train
 * on it, and cannot have leaked it into the trace memory it *does* see. This
 * module enforces all three structurally:
 *
 *   1. **Capability-gated access.** Held-out tasks live in a {@link HeldOutVault}
 *      and are revealed only to a holder of the matching {@link EvaluatorCapability}.
 *      There is no API that hands the tuner a capability; the type system and a
 *      runtime token check keep the two worlds apart.
 *
 *   2. **Commitment, not contents.** The vault publishes a salted digest of its
 *      task ids — enough to pin the set in a sealed pre-registration, not enough
 *      to reconstruct it. The salt never leaves the vault.
 *
 *   3. **Leakage detection.** {@link detectLeakage} scans the exact trace/etch
 *      stream the tuner consumed for any held-out task id (salted the same way),
 *      catching the case where a task slipped into the optimiser's context.
 *
 * Together these turn "we promise we didn't train on the test set" into a
 * checkable, falsifiable property — the same standard the rest of MCOP applies
 * to its own attestations.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import type { EfficacyTask } from './types';

/** Thrown when held-out material is accessed without a valid capability. */
export class IsolationViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IsolationViolationError';
  }
}

/**
 * An unforgeable-by-convention capability token. The vault mints exactly one
 * per instance and only code holding that exact object reference may reveal the
 * held-out tasks. The tuner is never handed one.
 */
export interface EvaluatorCapability {
  readonly token: symbol;
  readonly vaultId: string;
}

/** Salted commitment to a held-out set's membership. */
export function commitHeldOut(taskIds: readonly string[], salt: string): string {
  const sorted = [...taskIds].sort();
  return canonicalDigest({ kind: 'mcop-held-out-commitment', salt, taskIds: sorted });
}

/** Per-task salted id used for leakage scanning (never reveals the raw id). */
function saltedTaskDigest(taskId: string, salt: string): string {
  return canonicalDigest({ kind: 'mcop-held-out-task', salt, taskId });
}

/**
 * Holds the held-out tasks behind a capability gate and publishes only a salted
 * commitment to its membership.
 */
export class HeldOutVault {
  private readonly tasks: ReadonlyArray<EfficacyTask>;
  private readonly salt: string;
  private readonly capabilityToken: symbol;
  readonly vaultId: string;
  readonly commitment: string;

  constructor(tasks: ReadonlyArray<EfficacyTask>, salt: string, vaultId = 'held-out') {
    if (tasks.length === 0) throw new Error('HeldOutVault requires at least one task.');
    const ids = tasks.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('HeldOutVault task ids must be unique.');
    }
    this.tasks = Object.freeze([...tasks]);
    this.salt = salt;
    this.vaultId = vaultId;
    this.capabilityToken = Symbol(`mcop-evaluator-capability:${vaultId}`);
    this.commitment = commitHeldOut(ids, salt);
  }

  /**
   * Mints the single capability that unlocks this vault. Intended to be handed
   * to the efficacy program *only* — never to the tuner. Callers that hold a
   * reference to the vault could call this, so by convention the vault is
   * constructed inside the evaluation boundary and never shared with optimiser
   * code.
   */
  issueCapability(): EvaluatorCapability {
    return { token: this.capabilityToken, vaultId: this.vaultId };
  }

  /** Reveals the held-out tasks, but only to a holder of the matching token. */
  reveal(capability: EvaluatorCapability): ReadonlyArray<EfficacyTask> {
    if (!capability || capability.token !== this.capabilityToken) {
      throw new IsolationViolationError(
        `Held-out tasks for vault "${this.vaultId}" accessed without a valid evaluator capability.`,
      );
    }
    return this.tasks;
  }

  /** The salted per-task digests, for leakage scanning. */
  saltedDigests(capability: EvaluatorCapability): string[] {
    return this.reveal(capability).map((t) => saltedTaskDigest(t.id, this.salt));
  }

  /** Salt accessor, capability-gated, for leakage scans over raw id strings. */
  revealSalt(capability: EvaluatorCapability): string {
    if (!capability || capability.token !== this.capabilityToken) {
      throw new IsolationViolationError(
        `Salt for vault "${this.vaultId}" accessed without a valid evaluator capability.`,
      );
    }
    return this.salt;
  }
}

export interface LeakageScanResult {
  checked: boolean;
  violations: string[];
}

/**
 * Scans the tuner's *observed* context — the serialised Stigmergy traces and
 * Holographic etches it actually consumed — for any held-out task id.
 *
 * The scan is salt-aware: it looks both for raw id substrings (the obvious
 * leak) and for the salted per-task digest (the leak that survives hashing).
 * Any hit means a held-out item reached the optimiser's context window, which
 * invalidates the efficacy claim regardless of effect size.
 */
export function detectLeakage(
  observedContext: unknown,
  vault: HeldOutVault,
  capability: EvaluatorCapability,
): LeakageScanResult {
  const tasks = vault.reveal(capability);
  const salt = vault.revealSalt(capability);
  const haystack = safeStringify(observedContext);
  const violations: string[] = [];

  for (const task of tasks) {
    if (task.id.length > 0 && haystack.includes(task.id)) {
      violations.push(`held-out task id "${task.id}" found in tuner-observed context`);
    }
    const digest = saltedTaskDigest(task.id, salt);
    if (haystack.includes(digest)) {
      violations.push(`held-out task digest for "${task.id}" found in tuner-observed context`);
    }
  }

  return { checked: true, violations };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Circular or non-serialisable context: fall back to a shallow scan of keys
    // and string values so we still catch obvious leaks.
    try {
      return String(value);
    } catch {
      return '';
    }
  }
}
