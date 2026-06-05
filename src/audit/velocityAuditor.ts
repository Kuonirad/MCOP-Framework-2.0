// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Velocity Auditor — a deterministic, primitive-backed estimator
 * of the *AI velocity multiplier* of an audited MCOP cycle.
 *
 * Motivation. The {@link ./auditorKernel|Auditor Kernel} answers "how much
 * verified value did this cycle represent?" by lifting a conservative human-path
 * estimate with a kernel-derived resonance multiplier. The Velocity Auditor
 * answers the adjacent question: "how much *faster* was the AI-human cycle than
 * the human-only baseline?" — and it answers it with the same MCOP primitives,
 * so the figure is a kernel-produced value, not a narrative number typed into a
 * ledger.
 *
 * What is supplied vs. computed.
 *
 *   - SUPPLIED (declared estimates): for each {@link VelocityWorkItem}, a
 *     *conservative* human-only baseline (`humanBaselineHours`) and the
 *     *observed* AI-assisted wall-clock cost (`observedHours`). The baseline is
 *     the only inherently-estimated magnitude; the observed cost is a measured
 *     wall-clock figure. Neither is invented by the kernel.
 *   - SUPPLIED (factual, verifiable): whether the work {@link VelocitySessionFacts.merged|merged},
 *     the {@link VelocitySessionFacts.guardianVerdict|guardian verdict}, the
 *     anchoring commit hash, whether the cycle was {@link VelocitySessionFacts.aiAssisted|AI-assisted},
 *     and an optional ThermoTruth free-energy delta.
 *   - COMPUTED by the kernels: the cycle's resonance (routing each landed item
 *     through {@link NovaNeoEncoder} → {@link HolographicEtch} →
 *     {@link PositiveResonanceAmplifier}, exactly as the Impact Auditor and
 *     Auditor Kernel do), the AI velocity multiplier, the hours saved, the
 *     eudaimonic delta, a free-energy divergence gate via the
 *     {@link DriftSentinelKernel}, and the report's own canonical SHA-256
 *     provenance Merkle root.
 *
 * Multiplier orientation. The AI velocity multiplier is
 * `humanBaselineHours / observedHours` — i.e. how many times longer the
 * human-only path would have taken. This is the orientation behind the
 * enterprise narrative "this workflow delivered 12.4× AI velocity": a value
 * above 1 means the AI-human cycle was faster. When the cycle is not flagged as
 * AI-assisted, the multiplier is pinned at exactly 1 (no acceleration claimed).
 *
 * ThermoTruth constraint. Before a report is emitted, the session's declared
 * intent (its canonical encoding) and the synthesised report summary are run
 * through the Drift Sentinel as a (T_d, B_e) pair. A `critical` divergence means
 * the velocity claim is thermodynamically inconsistent with the work it
 * describes, and the cycle is classified as NOT productive (returns `null`) —
 * the loop refuses to attest a velocity it cannot reconcile.
 *
 * Determinism. As with the sibling auditors, timestamps are the only
 * non-deterministic surface and never feed a hash or a metric, so two runs over
 * the same inputs produce a byte-identical {@link VelocityReport} (including the
 * derived `runId`, which is itself a deterministic function of the Merkle root).
 */

import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { HolographicEtch } from '../core/holographicEtch';
import { PositiveResonanceAmplifier } from '../core/positiveResonanceAmplifier';
import { DriftSentinelKernel, type DriftSeverity } from '../core/driftSentinelKernel';
import { canonicalDigest } from '../core/canonicalEncoding';
import { classifyDomain } from './impactAuditor';

export const VELOCITY_AUDITOR_VERSION = '1.0.0';

/** A single unit of value-bearing work, with a human baseline and observed cost. */
export interface VelocityWorkItem {
  /** Human-facing description, e.g. `'Merkle provenance kernel'`. */
  label: string;
  /**
   * Conservative reference estimate of the *human-only* hours an expert engineer
   * already familiar with the codebase would take — excluding AI co-author loops.
   * This is a declared estimate; the kernel never invents it. (Step 2 prior:
   * e.g. a "Merkle provenance kernel" ≈ 120 h human-only.)
   */
  humanBaselineHours: number;
  /**
   * Observed AI-assisted wall-clock hours actually spent on this item. A measured
   * figure, not an estimate. Defaults to `0` only when omitted for unlanded work.
   */
  observedHours: number;
  /** Whether the work actually landed (merged / passing). Unlanded work is skipped. */
  landed: boolean;
}

/** Factual, verifiable provenance for the session being audited. */
export interface VelocitySessionFacts {
  /** Stable session identifier for the cycle. */
  sessionId: string;
  /** Ledger tenant. Defaults to `'default'`. */
  tenant?: string;
  /** True only when the work was actually merged. */
  merged: boolean;
  /** Guardian audit outcome from the live host. */
  guardianVerdict: 'PASS' | 'FAIL';
  /**
   * Whether the cycle was AI-assisted. When `false`, the velocity multiplier is
   * pinned at exactly 1 (no acceleration claimed) regardless of the hours.
   * Defaults to `true`.
   */
  aiAssisted?: boolean;
  /** Commit / Merkle root the cycle is anchored to (e.g. a GitHub commit). */
  commitHash?: string;
  /**
   * Thermodynamic free-energy delta recorded by ThermoTruth, when available.
   * Recorded as evidence only; it is never folded into the velocity math. Omit
   * it rather than inventing one.
   */
  thermoFreeEnergyDelta?: number;
}

export interface VelocityAuditorOptions {
  /** Clock override for deterministic provenance timestamps in tests. */
  now?: () => Date;
  /** Encoder dimensionality. Default `64` (the Velocity Auditor's wider slice). */
  dimensions?: number;
  /** Holographic Etch acceptance floor. Default `0.65`. */
  confidenceFloor?: number;
  /**
   * Minimum *kernel-derived* resonance for the cycle to count as productive.
   * Default `0.55` (the resonance threshold the protocol pins Stigmergy to).
   */
  resonanceFloor?: number;
  /**
   * Drift severity at and above which the velocity claim is rejected as
   * thermodynamically inconsistent. Default `'critical'`.
   */
  driftRejectFloor?: DriftSeverity;
}

const DEFAULTS = {
  dimensions: 64,
  confidenceFloor: 0.65,
  resonanceFloor: 0.55,
  driftRejectFloor: 'critical' as DriftSeverity,
} as const;

const SEVERITY_ORDER: Record<DriftSeverity, number> = {
  nominal: 0,
  watch: 1,
  elevated: 2,
  critical: 3,
};

/** Per-item signal produced by routing a work item through the MCOP kernels. */
export interface AuditedVelocityItem {
  label: string;
  humanBaselineHours: number;
  observedHours: number;
  landed: boolean;
  /** Growth domain this item was classified into. */
  domain: ReturnType<typeof classifyDomain>;
  /** Per-item AI velocity multiplier (`humanBaselineHours / observedHours`). */
  itemMultiplier: number;
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

/** Full result of a Velocity Auditor run for a productive cycle. */
export interface VelocityReport {
  velocityAuditorVersion: string;
  /** Deterministic, replayable run identifier derived from {@link merkleRoot}. */
  runId: string;
  sessionId: string;
  tenant: string;
  /** Always `true` — non-productive cycles return `null` rather than a report. */
  productive: true;
  /** Conservative human-only baseline, in hours (sum of landed item baselines). */
  humanBaselineHours: number;
  /** Observed AI-assisted wall-clock cost, in hours (sum of landed item costs). */
  observedHours: number;
  /** `humanBaselineHours / observedHours`, or `1` when not AI-assisted. */
  aiMultiplier: number;
  /** `max(0, humanBaselineHours − observedHours)`. */
  hoursSaved: number;
  /** Kernel-derived positive-impact score ∈ [0, 1] (mean resonance over landed work). */
  positiveImpactScore: number;
  /** `positiveImpactScore × aiMultiplier` — the eudaimonic delta. */
  eudaimonicDelta: number;
  /** Free-energy divergence Δ(T_d, B_e) ∈ [0, 1] from the Drift Sentinel. */
  freeEnergyDivergence: number;
  /** Drift Sentinel severity classification of the divergence. */
  driftSeverity: DriftSeverity;
  /** Recorded ThermoTruth free-energy delta, or `null` when not supplied. */
  thermoFreeEnergyDelta: number | null;
  guardianVerdict: 'PASS';
  merged: true;
  aiAssisted: boolean;
  workItems: AuditedVelocityItem[];
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
 * The AI velocity multiplier for a single (baseline, observed) pair. Returns `1`
 * when not AI-assisted, when the observed cost is non-positive, or when either
 * figure is non-finite — never a fabricated acceleration.
 */
export function aiVelocityMultiplier(
  humanBaselineHours: number,
  observedHours: number,
  aiAssisted = true,
): number {
  if (!aiAssisted) return 1;
  const baseline = Math.max(0, finite(humanBaselineHours));
  const observed = finite(observedHours);
  if (observed <= 0 || baseline <= 0) return 1;
  return round4(baseline / observed);
}

/**
 * Sums the conservative per-item human baseline for landed work only. Unlanded
 * work contributes nothing, and negative/non-finite estimates are floored at zero.
 */
export function humanBaselineEstimate(workItems: readonly VelocityWorkItem[]): number {
  const hours = workItems
    .filter((item) => item.landed)
    .reduce((sum, item) => sum + Math.max(0, finite(item.humanBaselineHours)), 0);
  return round2(hours);
}

/**
 * Sums the observed AI-assisted wall-clock cost for landed work only.
 */
export function observedCostEstimate(workItems: readonly VelocityWorkItem[]): number {
  const hours = workItems
    .filter((item) => item.landed)
    .reduce((sum, item) => sum + Math.max(0, finite(item.observedHours)), 0);
  return round2(hours);
}

/**
 * The productivity classifier. A cycle is productive only when it merged, the
 * guardian passed, it carries at least one landed work item, the *computed*
 * resonance clears the floor, and the free-energy divergence is below the
 * rejection floor (ThermoTruth constraint).
 */
export function isProductiveVelocity(
  facts: Pick<VelocitySessionFacts, 'merged' | 'guardianVerdict'>,
  resonance: number,
  hasLandedWork: boolean,
  driftSeverity: DriftSeverity,
  resonanceFloor: number = DEFAULTS.resonanceFloor,
  driftRejectFloor: DriftSeverity = DEFAULTS.driftRejectFloor,
): boolean {
  return (
    facts.merged === true &&
    facts.guardianVerdict === 'PASS' &&
    hasLandedWork &&
    clamp01(resonance) >= resonanceFloor &&
    SEVERITY_ORDER[driftSeverity] < SEVERITY_ORDER[driftRejectFloor]
  );
}

/**
 * Derives a deterministic, RFC-9562-shaped (version 8, "custom") UUID from the
 * report's canonical Merkle root, so a replayed audit reproduces the same
 * `runId` byte-for-byte. The protocol calls for `runId: UUID`; pinning it to the
 * Merkle root keeps the whole report reproducible rather than introducing a
 * non-deterministic surface.
 */
export function deterministicRunId(merkleRoot: string): string {
  const h = (merkleRoot || '').padEnd(32, '0').slice(0, 32);
  return (
    `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-` +
    `8${h.slice(17, 20)}-${h.slice(20, 32)}`
  );
}

/**
 * Runs the Velocity Auditor over a session's work items and facts. Returns a
 * fully provenanced {@link VelocityReport}, or `null` when the cycle does not
 * pass the productivity classifier (mirroring the Auditor Kernel's `return null`).
 */
export function auditVelocity(
  workItems: readonly VelocityWorkItem[],
  facts: VelocitySessionFacts,
  options: VelocityAuditorOptions = {},
): VelocityReport | null {
  const dimensions = options.dimensions ?? DEFAULTS.dimensions;
  const confidenceFloor = options.confidenceFloor ?? DEFAULTS.confidenceFloor;
  const resonanceFloor = options.resonanceFloor ?? DEFAULTS.resonanceFloor;
  const driftRejectFloor = options.driftRejectFloor ?? DEFAULTS.driftRejectFloor;
  const now = options.now ?? (() => new Date());
  const aiAssisted = facts.aiAssisted ?? true;

  const encoder = new NovaNeoEncoder({ dimensions, normalize: true });
  const amplifier = new PositiveResonanceAmplifier({ humanCelebrationEnabled: true });
  const etch = new HolographicEtch({ confidenceFloor, growthLedger: false });
  const sentinel = new DriftSentinelKernel();

  const audited: AuditedVelocityItem[] = [];
  const landedResonances: number[] = [];

  for (const item of workItems) {
    const domain = classifyDomain(item.label);
    // Encode the item's outcome. The synthesis realises a target delta that is
    // positive for landed work and negative (etch-rejected) for unlanded work —
    // the same sign convention the sibling auditors use.
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

    const itemMultiplier = item.landed
      ? aiVelocityMultiplier(item.humanBaselineHours, item.observedHours, aiAssisted)
      : 1;

    const growthEvent = amplifier.recordGrowthEvent({
      domain,
      title: item.label,
      positiveBuilding: `Positive Building of ${domain}: ${item.label}`,
      resonanceDelta,
      evidence: {
        humanBaselineHours: item.landed ? Math.max(0, finite(item.humanBaselineHours)) : 0,
        observedHours: item.landed ? Math.max(0, finite(item.observedHours)) : 0,
        itemMultiplier,
        landed: item.landed,
        etchHash: etchAccepted ? record.hash : null,
        flourishingScore: eudaimonic.flourishingScore,
      },
    });

    if (item.landed) landedResonances.push(growthEvent.resonanceScore);

    audited.push({
      label: item.label,
      humanBaselineHours: item.humanBaselineHours,
      observedHours: item.observedHours,
      landed: item.landed,
      domain,
      itemMultiplier,
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

  // Step 3 — ThermoTruth-constrained free-energy divergence check. T_d is the
  // session's declared intent; B_e is the synthesised behavioural summary,
  // constructed as a resonance-weighted blend of T_d and an independent
  // behavioural draw. The free-energy divergence Δ(T_d, B_e) therefore tracks
  // *inversely* with the kernel-derived resonance: a high-resonance cycle
  // behaves close to what it declared (low Δ, nominal), while a low-resonance
  // cycle drifts away (high Δ). A `critical` divergence means the velocity
  // claim cannot be reconciled with the work, and the classifier rejects it.
  const declaredTask = encoder.encode(`velocity-audit::${facts.sessionId}`);
  const behaviourDraw = encoder.encode(
    `velocity-behaviour::${facts.sessionId}::landed=${landedResonances.length}`,
  );
  const w = clamp01(resonance);
  const behaviour = normalizeVector(
    declaredTask.map((value, i) => w * value + (1 - w) * (behaviourDraw[i] ?? 0)),
  );
  const driftEvent = sentinel.observe({
    declaredTask,
    ensembleBehavior: [behaviour],
    reasoningStepId: 'velocity-audit',
    metadata: { sessionId: facts.sessionId },
  });
  const freeEnergyDivergence = round4(driftEvent.delta);
  const driftSeverity = driftEvent.severity;

  // Step 1 — classify. Non-productive cycles are not etched.
  if (
    !isProductiveVelocity(
      facts,
      resonance,
      hasLandedWork,
      driftSeverity,
      resonanceFloor,
      driftRejectFloor,
    )
  ) {
    return null;
  }

  // Step 2 — aggregate velocity figures over landed work.
  const humanBaselineHours = humanBaselineEstimate(workItems);
  const observedHours = observedCostEstimate(workItems);
  const aiMultiplier = aiVelocityMultiplier(humanBaselineHours, observedHours, aiAssisted);
  const hoursSaved = round2(Math.max(0, humanBaselineHours - observedHours));

  // Eudaimonic delta = kernel-derived positive-impact score × velocity multiplier.
  const positiveImpactScore = resonance;
  const eudaimonicDelta = round4(positiveImpactScore * aiMultiplier);

  const growthMerkleRoot = amplifier.getMerkleRoot() ?? '';
  const thermoFreeEnergyDelta = Number.isFinite(facts.thermoFreeEnergyDelta as number)
    ? (facts.thermoFreeEnergyDelta as number)
    : null;
  const commitHash = facts.commitHash ?? null;
  const tenant = facts.tenant ?? 'default';

  // Step 4 — etch. The Merkle root is a canonical digest over the report's
  // value-bearing payload (everything except the non-deterministic timestamp and
  // the runId it derives), so it is byte-stable and replayable.
  const etchPayload = {
    velocityAuditorVersion: VELOCITY_AUDITOR_VERSION,
    sessionId: facts.sessionId,
    tenant,
    humanBaselineHours,
    observedHours,
    aiMultiplier,
    hoursSaved,
    positiveImpactScore,
    eudaimonicDelta,
    freeEnergyDivergence,
    driftSeverity,
    thermoFreeEnergyDelta,
    guardianVerdict: 'PASS' as const,
    merged: true as const,
    aiAssisted,
    commitHash,
    growthMerkleRoot,
    workItems: audited.map((item) => ({
      label: item.label,
      humanBaselineHours: item.humanBaselineHours,
      observedHours: item.observedHours,
      landed: item.landed,
      domain: item.domain,
      itemMultiplier: item.itemMultiplier,
      etchHash: item.etchHash,
      growthEventHash: item.growthEventHash,
    })),
  };
  const merkleRoot = canonicalDigest(etchPayload);
  const runId = deterministicRunId(merkleRoot);

  return {
    velocityAuditorVersion: VELOCITY_AUDITOR_VERSION,
    runId,
    sessionId: facts.sessionId,
    tenant,
    productive: true,
    humanBaselineHours,
    observedHours,
    aiMultiplier,
    hoursSaved,
    positiveImpactScore,
    eudaimonicDelta,
    freeEnergyDivergence,
    driftSeverity,
    thermoFreeEnergyDelta,
    guardianVerdict: 'PASS',
    merged: true,
    aiAssisted,
    workItems: audited,
    growthMerkleRoot,
    commitHash,
    merkleRoot,
    timestamp: now().toISOString(),
    provenanceProof: commitHash
      ? `Canonical SHA-256 over the kernel-derived velocity payload, anchored to commit ${commitHash}.`
      : 'Canonical SHA-256 over the kernel-derived velocity payload.',
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** L2-normalises a vector, returning it unchanged when its norm is zero. */
function normalizeVector(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((acc, x) => acc + x * x, 0));
  if (!Number.isFinite(norm) || norm === 0) return values;
  return values.map((x) => x / norm);
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
