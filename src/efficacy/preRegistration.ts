// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Pre-registration sealing and verification.
 *
 * Pre-registration is the defence against HARKing (Hypothesising After the
 * Results are Known) and against the optimiser silently rewriting the goalposts.
 * The protocol — hypothesis, rubric, reliability floor, decision rule, held-out
 * commitment, analysis plan — is frozen and hashed *before* a single rater sees
 * an output. The efficacy program then refuses to admit results unless they
 * carry the matching pre-registration hash and were generated after the seal.
 *
 * Because the seal is a canonical RFC-8785 digest, it is byte-stable across
 * runtimes and trivially auditable: anyone can recompute it from the published
 * protocol and confirm nothing moved.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import type { PreRegistrationProtocol, SealedPreRegistration } from './types';

export interface SealOptions {
  /** Clock override for deterministic provenance in tests. */
  now?: () => Date;
}

/** Validates a protocol's internal consistency before it can be sealed. */
export function validateProtocol(protocol: PreRegistrationProtocol): string[] {
  const errors: string[] = [];
  if (!protocol.hypothesis?.trim()) errors.push('hypothesis must be a non-empty string.');
  if (!protocol.heldOutCommitment?.trim()) errors.push('heldOutCommitment must be set before sealing.');
  if (!(protocol.rubric.max > protocol.rubric.min)) {
    errors.push('rubric.max must be greater than rubric.min.');
  }
  if (protocol.reliability.floor < -1 || protocol.reliability.floor > 1) {
    errors.push('reliability.floor must be in [-1, 1].');
  }
  const rule = protocol.decisionRule;
  if (rule.minCliffsDelta < 0 || rule.minCliffsDelta > 1) {
    errors.push('decisionRule.minCliffsDelta must be in [0, 1].');
  }
  if (rule.ciLevel <= 0.5 || rule.ciLevel >= 1) {
    errors.push('decisionRule.ciLevel must be in (0.5, 1).');
  }
  if (!Number.isInteger(rule.bootstrapResamples) || rule.bootstrapResamples < 1) {
    errors.push('decisionRule.bootstrapResamples must be a positive integer.');
  }
  if (!Number.isFinite(rule.seed)) errors.push('decisionRule.seed must be a finite number.');
  return errors;
}

/** Seals a protocol into a tamper-anchored pre-registration. */
export function sealPreRegistration(
  protocol: PreRegistrationProtocol,
  options: SealOptions = {},
): SealedPreRegistration {
  const errors = validateProtocol(protocol);
  if (errors.length > 0) {
    throw new Error(`Cannot seal pre-registration:\n - ${errors.join('\n - ')}`);
  }
  const now = options.now ?? (() => new Date());
  const sealedAt = now().toISOString();
  const preRegistrationHash = canonicalDigest({
    kind: 'mcop-pre-registration',
    protocol,
    sealedAt,
  });
  return { protocol, sealedAt, preRegistrationHash };
}

/** Recomputes and checks a sealed pre-registration's hash. */
export function verifyPreRegistration(sealed: SealedPreRegistration): boolean {
  const recomputed = canonicalDigest({
    kind: 'mcop-pre-registration',
    protocol: sealed.protocol,
    sealedAt: sealed.sealedAt,
  });
  return recomputed === sealed.preRegistrationHash;
}
