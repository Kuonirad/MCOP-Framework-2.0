// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Verification Quality — Phase 3 of the operational
 * positive-impact recursion (the stacked layer).
 *
 *   Phase 1: impact is measured by the MCOP primitives.
 *   Phase 2: the measurement is verifiable — a committed attestation replays
 *            byte-for-byte through those primitives.
 *   Phase 3 (here): the *verifier itself* is evaluated — and the Proteome
 *            substrate is the active driver of that evaluation.
 *
 * A verifier is only meaningful if it actually discriminates: it must accept
 * the genuine attestation (specificity) AND reject tampered ones (sensitivity).
 * This module mutation-tests {@link verifyPositiveImpact}: a
 * {@link ProteomeOrchestrator}, seeded from the attestation, runs at the edge
 * of chaos and its per-step Merkle stream deterministically schedules a set of
 * adversarial perturbations (corrupt an etch hash, flip a metric, forge/drop a
 * citation, perturb a recorded input, alter the substrate root). The verifier
 * must catch every one.
 *
 * `qualityScore` = sensitivity (fraction of substrate-generated forgeries
 * caught), gated by the genuine attestation still verifying. A `missed`
 * perturbation is a real finding — a verifier blind spot. The substrate drives
 * *adversarial generation*, never the headline numbers, so the coupling stays
 * principled and falsify-first.
 *
 * Deterministic given its inputs: the scheduling substrate is seeded from the
 * attestation, so the perturbation schedule and the report are replayable.
 */

import { ProteomeOrchestrator } from '../proteome/ProteomeOrchestrator';
import {
  verifyPositiveImpact,
  type PositiveImpactAttestation,
} from './positiveImpactVerifier';

export interface PerturbationOutcome {
  /** Position in the substrate-scheduled sequence. */
  index: number;
  /** The kind of forgery injected. */
  kind: PerturbationKind;
  /** Human-readable description of what was mutated. */
  target: string;
  /** True when `verifyPositiveImpact` correctly rejected the forgery. */
  caught: boolean;
}

export interface VerificationQualityReport {
  /** The untouched attestation still verifies (specificity precondition). */
  genuineVerified: boolean;
  /** Number of adversarial perturbations actually applied. */
  perturbations: number;
  /** How many were caught (rejected) by the verifier. */
  caught: number;
  /** Perturbations the verifier failed to reject — verifier blind spots. */
  missed: PerturbationOutcome[];
  /** caught / perturbations, or 1 when no perturbation could be applied. */
  sensitivity: number;
  /** Equilibrium of the scheduling substrate after its final step. */
  substrateEquilibrium: number;
  /** Merkle root sealing the scheduling substrate. */
  substrateMerkleRoot: string;
  /** genuineVerified ? sensitivity : 0 — the headline quality signal. */
  qualityScore: number;
  /** Every perturbation outcome, in schedule order. */
  outcomes: PerturbationOutcome[];
}

export interface VerificationQualityOptions {
  /** Number of adversarial perturbations to schedule. Default `12`. */
  perturbations?: number;
  /** Scheduling-substrate steps. Default = `perturbations`. */
  proteomeSteps?: number;
  /** Scheduling-substrate node count. Default `48`. */
  proteomeNodeCount?: number;
  /** Clock override for deterministic provenance in tests. */
  now?: () => Date;
}

type PerturbationKind =
  | 'flip-metric'
  | 'corrupt-etch-hash'
  | 'corrupt-growth-hash'
  | 'corrupt-merkle-root'
  | 'corrupt-substrate-root'
  | 'perturb-duration'
  | 'forge-citation'
  | 'drop-citation'
  | 'flip-check-passed';

const KINDS: readonly PerturbationKind[] = Object.freeze([
  'flip-metric',
  'corrupt-etch-hash',
  'corrupt-growth-hash',
  'corrupt-merkle-root',
  'corrupt-substrate-root',
  'perturb-duration',
  'forge-citation',
  'drop-citation',
  'flip-check-passed',
]);

/**
 * Mutation-tests the verifier using a Proteome-scheduled adversarial sequence.
 */
export async function assessVerificationQuality(
  attestation: PositiveImpactAttestation,
  options: VerificationQualityOptions = {},
): Promise<VerificationQualityReport> {
  const perturbationCount = Math.max(1, options.perturbations ?? 12);
  const steps = Math.max(perturbationCount, options.proteomeSteps ?? perturbationCount);
  const nodeCount = options.proteomeNodeCount ?? 48;

  const genuine = await verifyPositiveImpact(attestation);
  const genuineVerified = genuine.ok;

  const proteome = new ProteomeOrchestrator(
    {
      nodeCount,
      stateDim: 16,
      seed: deriveSeed(attestation),
      // Edge of chaos: enough exploration to spread perturbations across the
      // evidence surface, enough homeostasis to keep the schedule stable.
      homeostasis: 0.5,
      mutationTemperature: 0.6,
    },
    { now: options.now },
  );
  const stepResults = await proteome.runSteps(steps);

  const outcomes: PerturbationOutcome[] = [];
  let cursor = 0;

  for (const step of stepResults) {
    if (outcomes.length >= perturbationCount) break;
    const stepInt = hexToInt(step.merkleRoot);
    const applied = applyScheduledPerturbation(attestation, stepInt);
    if (!applied) continue;

    const result = await verifyPositiveImpact(applied.attestation);
    outcomes.push({
      index: cursor++,
      kind: applied.kind,
      target: applied.target,
      caught: !result.ok,
    });
  }

  const perturbations = outcomes.length;
  const caught = outcomes.filter((o) => o.caught).length;
  const missed = outcomes.filter((o) => !o.caught);
  const sensitivity = perturbations === 0 ? 1 : round3(caught / perturbations);
  const last = stepResults[stepResults.length - 1];

  return {
    genuineVerified,
    perturbations,
    caught,
    missed,
    sensitivity,
    substrateEquilibrium: last ? round3(last.equilibriumScore) : 0,
    substrateMerkleRoot: last ? last.merkleRoot : '',
    qualityScore: genuineVerified ? sensitivity : 0,
    outcomes,
  };
}

interface AppliedPerturbation {
  attestation: PositiveImpactAttestation;
  kind: PerturbationKind;
  target: string;
}

/**
 * Tries each perturbation kind in a substrate-selected order until one mutates
 * the attestation, returning the perturbed clone. Returns `null` if none apply
 * (e.g. an attestation with no citations and no accepted etches).
 */
function applyScheduledPerturbation(
  attestation: PositiveImpactAttestation,
  stepInt: number,
): AppliedPerturbation | null {
  const start = stepInt % KINDS.length;
  const selector = Math.floor(stepInt / KINDS.length);
  for (let offset = 0; offset < KINDS.length; offset++) {
    const kind = KINDS[(start + offset) % KINDS.length];
    const clone = jsonClone(attestation);
    const target = mutate(clone, kind, selector);
    if (target) return { attestation: clone, kind, target };
  }
  return null;
}

/** Applies one perturbation in place; returns a target description or null. */
function mutate(
  attestation: PositiveImpactAttestation,
  kind: PerturbationKind,
  selector: number,
): string | null {
  const audit = attestation.audit;
  const accepted = audit.checks.filter((c) => c.etchAccepted && c.etchHash);

  switch (kind) {
    case 'flip-metric': {
      const keys = ['contributorJoy', 'adoptionVelocity', 'beneficialOutcomeAmplification'] as const;
      const key = keys[selector % keys.length];
      const before = audit.metrics[key];
      audit.metrics[key] = round3(before >= 0.5 ? before - 0.25 : before + 0.25);
      return `metrics.${key}`;
    }
    case 'corrupt-etch-hash': {
      if (accepted.length === 0) return null;
      const check = accepted[selector % accepted.length];
      check.etchHash = flipHex(check.etchHash as string);
      return `checks[${check.label}].etchHash`;
    }
    case 'corrupt-growth-hash': {
      if (audit.checks.length === 0) return null;
      const check = audit.checks[selector % audit.checks.length];
      check.growthEventHash = flipHex(check.growthEventHash);
      return `checks[${check.label}].growthEventHash`;
    }
    case 'corrupt-merkle-root': {
      if (!audit.metrics.merkleRoot) return null;
      audit.metrics.merkleRoot = flipHex(audit.metrics.merkleRoot);
      return 'metrics.merkleRoot';
    }
    case 'corrupt-substrate-root': {
      if (!audit.substrate) return null;
      audit.substrate.merkleRoot = flipHex(audit.substrate.merkleRoot);
      return 'substrate.merkleRoot';
    }
    case 'perturb-duration': {
      if (audit.checks.length === 0) return null;
      const check = audit.checks[selector % audit.checks.length];
      check.durationMs = check.durationMs + 1;
      return `checks[${check.label}].durationMs`;
    }
    case 'forge-citation': {
      audit.citations.push({
        kernel: 'HolographicEtch',
        signal: 'eudaimonic-etch',
        hash: 'f'.repeat(64),
        backs: 'a scoring event that never happened',
      });
      return 'citations(+forged)';
    }
    case 'drop-citation': {
      if (audit.citations.length === 0) return null;
      const idx = selector % audit.citations.length;
      const [removed] = audit.citations.splice(idx, 1);
      return `citations(-${removed.kernel})`;
    }
    case 'flip-check-passed': {
      if (audit.checks.length === 0) return null;
      const check = audit.checks[selector % audit.checks.length];
      check.passed = !check.passed;
      return `checks[${check.label}].passed`;
    }
    default:
      return null;
  }
}

/** Deterministic 32-bit seed from the attested growth Merkle root. */
function deriveSeed(attestation: PositiveImpactAttestation): number {
  const root = attestation.audit.metrics.merkleRoot;
  if (root) return hexToInt(root);
  return 0xc0ffee;
}

function hexToInt(hex: string): number {
  const parsed = Number.parseInt(hex.slice(0, 8), 16);
  return Number.isFinite(parsed) ? parsed >>> 0 : 0xc0ffee;
}

/** Flips the leading hex digit so the string is guaranteed to differ. */
function flipHex(hash: string): string {
  if (hash.length === 0) return 'f';
  const head = hash[0] === '0' ? '1' : '0';
  return head + hash.slice(1);
}

function jsonClone(attestation: PositiveImpactAttestation): PositiveImpactAttestation {
  return JSON.parse(JSON.stringify(attestation)) as PositiveImpactAttestation;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
