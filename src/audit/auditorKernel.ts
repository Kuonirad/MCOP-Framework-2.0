// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Auditor Kernel — a deterministic, primitive-backed estimator
 * for the *verified value* of an audited MCOP cycle.
 *
 * Motivation. A natural question after a guardian-audited cycle lands is "how
 * much productive work did this actually represent?". It is tempting to answer
 * with a narrative number ("≈15 hours, ×1.18 resonance bonus"). But a number
 * typed into a ledger is not evidence — it is prose. The framework already
 * rejected that pattern once (see {@link ../audit/impactAuditor}, whose entire
 * purpose was to replace hand-written formulas with values produced by the
 * framework's own kernels). This module holds the same line for ROI accounting.
 *
 * What is supplied vs. computed.
 *
 *   - SUPPLIED (and clearly labelled as estimates): a list of {@link WorkItem}s,
 *     each carrying a *conservative* reference estimate of how long an expert
 *     engineer already familiar with the codebase would take — excluding AI
 *     co-author loops and self-audit overhead. This is the only externally
 *     provided magnitude, and it is inherently an estimate, never presented as a
 *     measurement.
 *   - SUPPLIED (factual, verifiable): whether the work {@link CycleFacts.merged|merged},
 *     the {@link CycleFacts.guardianVerdict|guardian verdict}, the anchoring
 *     commit hash, and an optional ThermoTruth free-energy delta.
 *   - COMPUTED by the kernels: the cycle's resonance (derived by routing each
 *     landed work item through {@link NovaNeoEncoder} → {@link HolographicEtch} →
 *     {@link PositiveResonanceAmplifier}, exactly as the Impact Auditor does),
 *     the resonance multiplier, the adjusted value, the growth Merkle root, and
 *     the report's own canonical SHA-256 provenance hash.
 *
 * The four steps mirror the Auditor Kernel prototype trace, but every number is
 * either a declared estimate or a kernel-produced value:
 *
 *   1. Classifier      — {@link isProductive}: a cycle only counts when it
 *      merged, passed the guardian, carries landed work, and the *computed*
 *      resonance clears the floor. Non-productive cycles return `null`.
 *   2. Human-path      — {@link conservativeHumanPathEstimate}: sums the
 *      conservative per-item estimates for landed work only.
 *   3. Scoring         — {@link resonanceMultiplier} lifts the human-path hours
 *      by the kernel-derived resonance into an adjusted value.
 *   4. Etch            — the returned {@link AuditReport} carries a canonical
 *      Merkle root over its own value-bearing payload, so it can be cited and
 *      replayed.
 *
 * Determinism. As with the Impact Auditor, timestamps are the only
 * non-deterministic surface and never feed a hash or a metric, so two runs over
 * the same inputs produce byte-identical hashes and values.
 */

import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { HolographicEtch } from '../core/holographicEtch';
import { PositiveResonanceAmplifier } from '../core/positiveResonanceAmplifier';
import { canonicalDigest } from '../core/canonicalEncoding';
import { classifyDomain } from './impactAuditor';

export const AUDITOR_KERNEL_VERSION = '1.0.0';

/** A single unit of unspecified, value-bearing work performed in a cycle. */
export interface WorkItem {
  /** Human-facing description, e.g. `'fusion wiring'`. */
  label: string;
  /**
   * Conservative reference estimate of the human hours an expert engineer
   * *already familiar with the codebase* would take to do this work, excluding
   * AI co-author loops and self-audit overhead. This is a declared estimate —
   * the kernel never invents it — and it is the only externally supplied
   * magnitude.
   */
  estimatedHumanHours: number;
  /** Whether the work actually landed (merged / passing). Unlanded work is skipped. */
  landed: boolean;
}

/** Factual, verifiable provenance for the cycle being audited. */
export interface CycleFacts {
  /** Stable session identifier for the cycle. */
  sessionId: string;
  /** Ledger tenant. Defaults to `'default'`. */
  tenant?: string;
  /** True only when the work was actually merged. */
  merged: boolean;
  /** Guardian audit outcome from the live host. */
  guardianVerdict: 'PASS' | 'FAIL';
  /** Commit / Merkle root the cycle is anchored to (e.g. a GitHub commit). */
  commitHash?: string;
  /**
   * Thermodynamic free-energy delta recorded by ThermoTruth, when available.
   * It is recorded as evidence only; it is never folded into the adjusted value
   * (so the value math stays `hours × resonanceMultiplier`). Omit it rather than
   * inventing one.
   */
  thermoFreeEnergyDelta?: number;
}

export interface AuditorKernelOptions {
  /** Clock override for deterministic provenance timestamps in tests. */
  now?: () => Date;
  /** Encoder dimensionality. Default `32` (matches the triad fixed-dim slice). */
  dimensions?: number;
  /** Holographic Etch acceptance floor. Default `0.65`. */
  confidenceFloor?: number;
  /**
   * Minimum *kernel-derived* resonance for the cycle to count as productive.
   * Default `0.92` (the constitutional high-stakes threshold used elsewhere).
   */
  resonanceFloor?: number;
  /**
   * Resonance multiplier gain. The multiplier is
   * `1 + gain · max(0, resonance − neutral)`. Default `0.4`.
   */
  resonanceGain?: number;
  /** Resonance value that maps to a neutral (×1.0) multiplier. Default `0.5`. */
  resonanceNeutral?: number;
}

const DEFAULTS = {
  dimensions: 32,
  confidenceFloor: 0.65,
  resonanceFloor: 0.92,
  resonanceGain: 0.4,
  resonanceNeutral: 0.5,
} as const;

/** Per-item signal produced by routing a work item through the MCOP kernels. */
export interface AuditedWorkItem {
  label: string;
  estimatedHumanHours: number;
  landed: boolean;
  /** Growth domain this item was classified into. */
  domain: ReturnType<typeof classifyDomain>;
  /** True when the Holographic Etch accepted the item (delta ≥ floor). */
  etchAccepted: boolean;
  /** Canonical SHA-256 of the accepted etch, or `null` when skipped. */
  etchHash: string | null;
  /** EudaimonicEtch flourishing score ∈ [0, 1]. */
  flourishingScore: number;
  /** Amplifier resonance score ∈ [0, 1] recorded for this item. */
  resonanceScore: number;
  /** Merkle-chained growth-event hash recorded on the amplifier. */
  growthEventHash: string;
}

/** Full result of an Auditor Kernel run for a productive cycle. */
export interface AuditReport {
  auditorKernelVersion: string;
  sessionId: string;
  tenant: string;
  /** Always `true` — non-productive cycles return `null` rather than a report. */
  productive: true;
  /** Conservative human-path estimate, in hours (sum of landed item estimates). */
  productiveHours: number;
  /** `productiveHours × resonanceMultiplier`, in adjusted hours. */
  adjustedValue: number;
  /** Kernel-derived resonance ∈ [0, 1] (mean amplifier resonance over landed work). */
  resonance: number;
  /** The multiplier applied to the human-path hours. */
  resonanceMultiplier: number;
  /** Recorded ThermoTruth free-energy delta, or `null` when not supplied. */
  thermoFreeEnergyDelta: number | null;
  guardianVerdict: 'PASS';
  merged: true;
  workItems: AuditedWorkItem[];
  /** Merkle root of the amplifier growth chain backing the resonance. */
  growthMerkleRoot: string;
  /** Anchoring commit / Merkle root, or `null`. */
  commitHash: string | null;
  /** Canonical SHA-256 over this report's value-bearing payload (the etch). */
  merkleRoot: string;
  /** ISO timestamp (provenance only; never hashed). */
  timestamp: string;
  /** Human-facing description of how the provenance hash chains back. */
  provenanceProof: string;
}

/**
 * The resonance multiplier: a monotonic, documented lift over the human-path
 * estimate. `1 + gain · max(0, resonance − neutral)`. At the default
 * gain/neutral, a resonance of ~0.96 yields ≈ ×1.18.
 */
export function resonanceMultiplier(
  resonance: number,
  options: Pick<AuditorKernelOptions, 'resonanceGain' | 'resonanceNeutral'> = {},
): number {
  const gain = options.resonanceGain ?? DEFAULTS.resonanceGain;
  const neutral = options.resonanceNeutral ?? DEFAULTS.resonanceNeutral;
  const r = clamp01(resonance);
  return 1 + gain * Math.max(0, r - neutral);
}

/**
 * Step 2 — sums the conservative per-item human-hour estimates for landed work
 * only. Unlanded work contributes nothing (no credit for work that did not
 * ship), and negative/non-finite estimates are floored at zero.
 */
export function conservativeHumanPathEstimate(workItems: readonly WorkItem[]): number {
  const hours = workItems
    .filter((item) => item.landed)
    .reduce((sum, item) => sum + Math.max(0, finite(item.estimatedHumanHours)), 0);
  return round2(hours);
}

/**
 * Step 1 — the productivity classifier. A cycle is productive only when it
 * merged, the guardian passed, it carries at least one landed work item, and
 * the *computed* resonance clears the floor.
 */
export function isProductive(
  facts: Pick<CycleFacts, 'merged' | 'guardianVerdict'>,
  resonance: number,
  hasLandedWork: boolean,
  resonanceFloor: number = DEFAULTS.resonanceFloor,
): boolean {
  return (
    facts.merged === true &&
    facts.guardianVerdict === 'PASS' &&
    hasLandedWork &&
    clamp01(resonance) >= resonanceFloor
  );
}

/**
 * Runs the Auditor Kernel over a cycle's work items and facts. Returns a fully
 * provenanced {@link AuditReport}, or `null` when the cycle does not pass the
 * productivity classifier (mirroring the prototype skeleton's `return None`).
 */
export function auditCycle(
  workItems: readonly WorkItem[],
  facts: CycleFacts,
  options: AuditorKernelOptions = {},
): AuditReport | null {
  const dimensions = options.dimensions ?? DEFAULTS.dimensions;
  const confidenceFloor = options.confidenceFloor ?? DEFAULTS.confidenceFloor;
  const resonanceFloor = options.resonanceFloor ?? DEFAULTS.resonanceFloor;
  const now = options.now ?? (() => new Date());

  const encoder = new NovaNeoEncoder({ dimensions, normalize: true });
  const amplifier = new PositiveResonanceAmplifier({ humanCelebrationEnabled: true });
  const etch = new HolographicEtch({ confidenceFloor, growthLedger: false });

  const audited: AuditedWorkItem[] = [];
  const landedResonances: number[] = [];

  for (const item of workItems) {
    const domain = classifyDomain(item.label);
    // Encode the item's outcome. The synthesis realises a target delta that is
    // positive for landed work and negative (etch-rejected) for unlanded work —
    // the same sign convention the Impact Auditor uses for pass/fail checks.
    const targetDelta = (item.landed ? 1 : -1) * 0.85;
    const direction = encoder.encode(`${item.label}::${item.landed ? 'landed' : 'unlanded'}`);
    const sumSq = direction.reduce((acc, x) => acc + x * x, 0) || 1;
    const gain = (targetDelta * dimensions) / sumSq;
    const synthesis = direction.map((x) => x * gain);

    const record = etch.applyEtch(direction, synthesis, item.label);
    const etchAccepted = record.hash !== '';
    const eudaimonic = etchAccepted
      ? {
          flourishingScore: record.flourishingScore ?? 0,
          propagationHint: record.propagationHint ?? 'seed',
        }
      : etch.scoreEudaimonicEtch(direction, synthesis, targetDelta);

    const resonanceDelta = item.landed
      ? clampSigned(2 * eudaimonic.flourishingScore - 1)
      : -0.6;

    const growthEvent = amplifier.recordGrowthEvent({
      domain,
      title: item.label,
      positiveBuilding: `Positive Building of ${domain}: ${item.label}`,
      resonanceDelta,
      evidence: {
        estimatedHumanHours: item.landed ? Math.max(0, finite(item.estimatedHumanHours)) : 0,
        landed: item.landed,
        etchHash: etchAccepted ? record.hash : null,
        flourishingScore: eudaimonic.flourishingScore,
      },
    });

    if (item.landed) landedResonances.push(growthEvent.resonanceScore);

    audited.push({
      label: item.label,
      estimatedHumanHours: item.estimatedHumanHours,
      landed: item.landed,
      domain,
      etchAccepted,
      etchHash: etchAccepted ? record.hash : null,
      flourishingScore: eudaimonic.flourishingScore,
      resonanceScore: growthEvent.resonanceScore,
      growthEventHash: growthEvent.hash,
    });
  }

  const hasLandedWork = landedResonances.length > 0;
  // Kernel-derived resonance: the mean amplifier resonance over landed work.
  const resonance = hasLandedWork ? round4(mean(landedResonances)) : 0;

  // Step 1 — classify. Non-productive cycles are not etched.
  if (!isProductive(facts, resonance, hasLandedWork, resonanceFloor)) {
    return null;
  }

  // Step 2 / Step 3 — human-path estimate lifted by the resonance multiplier.
  const productiveHours = conservativeHumanPathEstimate(workItems);
  const multiplier = round4(
    resonanceMultiplier(resonance, {
      resonanceGain: options.resonanceGain,
      resonanceNeutral: options.resonanceNeutral,
    }),
  );
  const adjustedValue = round2(productiveHours * multiplier);

  const growthMerkleRoot = amplifier.getMerkleRoot() ?? '';
  const thermoFreeEnergyDelta = Number.isFinite(facts.thermoFreeEnergyDelta as number)
    ? (facts.thermoFreeEnergyDelta as number)
    : null;
  const commitHash = facts.commitHash ?? null;
  const tenant = facts.tenant ?? 'default';

  // Step 4 — etch. The Merkle root is a canonical digest over the report's
  // value-bearing payload (everything except the non-deterministic timestamp),
  // so it is byte-stable and replayable.
  const etchPayload = {
    auditorKernelVersion: AUDITOR_KERNEL_VERSION,
    sessionId: facts.sessionId,
    tenant,
    productiveHours,
    adjustedValue,
    resonance,
    resonanceMultiplier: multiplier,
    thermoFreeEnergyDelta,
    guardianVerdict: 'PASS' as const,
    merged: true as const,
    commitHash,
    growthMerkleRoot,
    workItems: audited.map((item) => ({
      label: item.label,
      estimatedHumanHours: item.estimatedHumanHours,
      landed: item.landed,
      domain: item.domain,
      etchHash: item.etchHash,
      growthEventHash: item.growthEventHash,
    })),
  };
  const merkleRoot = canonicalDigest(etchPayload);

  return {
    auditorKernelVersion: AUDITOR_KERNEL_VERSION,
    sessionId: facts.sessionId,
    tenant,
    productive: true,
    productiveHours,
    adjustedValue,
    resonance,
    resonanceMultiplier: multiplier,
    thermoFreeEnergyDelta,
    guardianVerdict: 'PASS',
    merged: true,
    workItems: audited,
    growthMerkleRoot,
    commitHash,
    merkleRoot,
    timestamp: now().toISOString(),
    provenanceProof: commitHash
      ? `Canonical SHA-256 over the kernel-derived audit payload, anchored to commit ${commitHash}.`
      : 'Canonical SHA-256 over the kernel-derived audit payload.',
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function round2(value: number): number {
  return Math.round(finite(value) * 100) / 100;
}

function round4(value: number): number {
  return Math.round(finite(value) * 10000) / 10000;
}
