// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Impact Auditor — Phase 1 of the operational positive-impact
 * recursion.
 *
 * The `pnpm positive:audit` flow historically derived its Positive Impact
 * Report metrics from hand-written formulas (e.g. `0.72 + score/100 * 0.23`).
 * Those numbers described the project's aspiration, but they were not produced
 * by the framework's own primitives — so the README's claim that "positive
 * impact becomes a first-class observable" remained architecture prose.
 *
 * This module closes that gap. It runs the live verification-check results
 * through the same deterministic MCOP kernels that power core cognition:
 *
 *   1. {@link NovaNeoEncoder} — encodes each check (label + outcome) into a
 *      deterministic context tensor.
 *   2. {@link HolographicEtch} — scores each check as a eudaimonic etch,
 *      yielding a flourishing score, a propagation hint, and a canonical
 *      SHA-256 hash that the report can *cite* as a scoring event.
 *   3. {@link PositiveResonanceAmplifier} — records each check as a
 *      Merkle-chained growth event and derives the report's contributorJoy /
 *      adoptionVelocity / beneficialOutcomeAmplification metrics from real
 *      recorded resonance, not formulas.
 *   4. {@link ProteomeOrchestrator} — evolves a small sparse substrate whose
 *      edge-of-chaos knobs are conditioned by the audit's pass ratio (more
 *      passes → more homeostasis/order; more failures → more chaotic
 *      exploration), emitting an equilibrium-stability signal + Merkle root.
 *
 * The returned {@link PositiveImpactAudit} therefore carries the specific
 * kernels, scoring events, and Merkle roots that strengthened each section of
 * the report — exactly the "operational evidence, not just architecture prose"
 * target described in the README's Positive Impact section.
 *
 * The auditor is deterministic given its inputs: timestamps (the only
 * non-deterministic surface) never feed a hash or metric, so two runs over the
 * same check matrix produce byte-identical hashes and metrics. This keeps the
 * report replayable and the Jest proof stable.
 */

import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { HolographicEtch } from '../core/holographicEtch';
import {
  PositiveResonanceAmplifier,
  type PositiveGrowthDomain,
  type PositiveImpactMetrics,
} from '../core/positiveResonanceAmplifier';
import { ProteomeOrchestrator } from '../proteome/ProteomeOrchestrator';

/** A single verification check, as collected by `scripts/positive-audit.mjs`. */
export interface VerificationCheckInput {
  /** Human-facing label, e.g. `'TypeScript app resonance'`. */
  label: string;
  /** The command that produced this result (optional, for evidence). */
  command?: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/** Per-check signal produced by routing a check through the MCOP kernels. */
export interface AuditedCheckSignal {
  label: string;
  command?: string;
  passed: boolean;
  durationMs: number;
  /** Growth domain this check was classified into. */
  domain: PositiveGrowthDomain;
  /** True when the Holographic Etch accepted the check (delta ≥ floor). */
  etchAccepted: boolean;
  /** Canonical SHA-256 of the accepted etch, or `null` when skipped. */
  etchHash: string | null;
  /** EudaimonicEtch flourishing score ∈ [0, 1]. */
  flourishingScore: number;
  /** EudaimonicEtch propagation hint. */
  propagationHint: 'seed' | 'bloom' | 'radiate';
  /** Merkle-chained growth-event hash recorded on the amplifier. */
  growthEventHash: string;
}

/** Proteome substrate-stability signal, conditioned on the audit pass ratio. */
export interface SubstrateStabilitySignal {
  kernel: 'ProteomeOrchestrator';
  steps: number;
  nodeCount: number;
  /** Replicator-dynamics equilibrium score ∈ [0, 1] after the final step. */
  equilibriumScore: number;
  /** Per-node energy variance — the edge-of-chaos temperature gauge. */
  energyVariance: number;
  /** SHA-256 Merkle root sealing the final substrate state. */
  merkleRoot: string;
}

/** A piece of operational evidence backing part of the report. */
export interface ImpactCitation {
  /** The MCOP kernel that produced the evidence. */
  kernel: string;
  /** The kind of scoring event. */
  signal: string;
  /** The canonical hash / Merkle root of the event. */
  hash: string;
  /** Which report element this evidences. */
  backs: string;
}

/** Full result of an impact audit. */
export interface PositiveImpactAudit {
  generatedAt: string;
  /** Integer percentage: passed / total * 100. */
  positiveImpactScore: number;
  passed: number;
  total: number;
  /** Metrics derived from the real PositiveResonanceAmplifier. */
  metrics: PositiveImpactMetrics;
  checks: AuditedCheckSignal[];
  substrate?: SubstrateStabilitySignal;
  citations: ImpactCitation[];
}

export interface ImpactAuditorOptions {
  /** Clock override for deterministic provenance timestamps in tests. */
  now?: () => Date;
  /** Encoder dimensionality. Default `32` (matches the triad fixed-dim slice). */
  dimensions?: number;
  /** Holographic Etch acceptance floor. Default `0.65`. */
  confidenceFloor?: number;
  /** Duration (ms) mapped to zero speed bonus. Default `60_000`. */
  durationBudgetMs?: number;
  /** Proteome steps to run. `0` disables the substrate signal. Default `16`. */
  proteomeSteps?: number;
  /** Proteome node count. Default `96` (kept small for fast, bounded audits). */
  proteomeNodeCount?: number;
}

const DEFAULTS = {
  dimensions: 32,
  confidenceFloor: 0.65,
  durationBudgetMs: 60_000,
  proteomeSteps: 16,
  proteomeNodeCount: 96,
} as const;

/**
 * Maps a verification-check label onto a {@link PositiveGrowthDomain}. The
 * mapping is a deterministic keyword heuristic; unknown labels fall back to
 * `'joy'`. Domain diversity feeds the amplifier's adoptionVelocity metric, so
 * a spread of domains across the suite is itself a positive signal.
 */
export function classifyDomain(label: string): PositiveGrowthDomain {
  const l = label.toLowerCase();
  if (l.includes('typescript') || l.includes('test') || l.includes('determinism')) {
    return 'determinism';
  }
  if (l.includes('lint')) return 'identity';
  if (l.includes('parity')) return 'provenance';
  if (l.includes('doc')) return 'doc-code-sync';
  if (l.includes('placement') || l.includes('link')) return 'link-integrity';
  if (l.includes('sbom') || l.includes('dependency') || l.includes('dep')) {
    return 'dependency-hygiene';
  }
  if (l.includes('branch')) return 'branch-hygiene';
  return 'joy';
}

/**
 * Runs the verification-check matrix through the MCOP kernels and returns a
 * fully-cited {@link PositiveImpactAudit}.
 */
export async function auditPositiveImpact(
  checks: readonly VerificationCheckInput[],
  options: ImpactAuditorOptions = {},
): Promise<PositiveImpactAudit> {
  const dimensions = options.dimensions ?? DEFAULTS.dimensions;
  const confidenceFloor = options.confidenceFloor ?? DEFAULTS.confidenceFloor;
  const durationBudgetMs = options.durationBudgetMs ?? DEFAULTS.durationBudgetMs;
  const proteomeSteps = options.proteomeSteps ?? DEFAULTS.proteomeSteps;
  const proteomeNodeCount = options.proteomeNodeCount ?? DEFAULTS.proteomeNodeCount;
  const now = options.now ?? (() => new Date());

  const encoder = new NovaNeoEncoder({ dimensions, normalize: true });
  const amplifier = new PositiveResonanceAmplifier({ humanCelebrationEnabled: true });
  const etch = new HolographicEtch({ confidenceFloor, growthLedger: false });

  const auditedChecks: AuditedCheckSignal[] = [];

  for (const check of checks) {
    const domain = classifyDomain(check.label);
    const speed = clamp01(1 - Math.max(0, check.durationMs) / durationBudgetMs);
    // Target delta encodes the outcome (sign) and speed (magnitude). Passing
    // checks land above the acceptance floor; failing checks land below zero
    // and are skipped by the etch — exactly mirroring how the triad treats
    // aligned vs. misaligned synthesis.
    const targetDelta = (0.7 + 0.25 * speed) * (check.passed ? 1 : -1);

    // The encoded direction differs per (label, outcome), so each accepted
    // etch carries a distinct, citable hash; the synthesis is that same
    // direction scaled to realise `targetDelta` once the etch re-normalises.
    const direction = encoder.encode(`${check.label}::${check.passed ? 'pass' : 'fail'}`);
    const sumSq = direction.reduce((acc, x) => acc + x * x, 0) || 1;
    const gain = (targetDelta * dimensions) / sumSq;
    const synthesis = direction.map((x) => x * gain);

    const record = etch.applyEtch(direction, synthesis, check.label);
    const etchAccepted = record.hash !== '';
    const eudaimonic = etchAccepted
      ? {
          flourishingScore: record.flourishingScore ?? 0,
          propagationHint: record.propagationHint ?? 'seed',
        }
      : etch.scoreEudaimonicEtch(direction, synthesis, targetDelta);

    const resonanceDelta = check.passed
      ? clampSigned(2 * eudaimonic.flourishingScore - 1)
      : -0.6;

    const growthEvent = amplifier.recordGrowthEvent({
      domain,
      title: check.label,
      positiveBuilding: `Positive Building of ${domain}: ${check.label}`,
      resonanceDelta,
      evidence: {
        command: check.command ?? null,
        passed: check.passed,
        durationMs: check.durationMs,
        etchHash: etchAccepted ? record.hash : null,
        propagationHint: eudaimonic.propagationHint,
        flourishingScore: eudaimonic.flourishingScore,
      },
    });

    auditedChecks.push({
      label: check.label,
      command: check.command,
      passed: check.passed,
      durationMs: check.durationMs,
      domain,
      etchAccepted,
      etchHash: etchAccepted ? record.hash : null,
      flourishingScore: eudaimonic.flourishingScore,
      propagationHint: eudaimonic.propagationHint,
      growthEventHash: growthEvent.hash,
    });
  }

  const metrics = amplifier.getPositiveImpactMetrics();

  const total = checks.length;
  const passed = checks.filter((c) => c.passed).length;
  const positiveImpactScore = total === 0 ? 0 : Math.round((passed / total) * 100);

  const substrate =
    proteomeSteps > 0 && total > 0
      ? await evolveSubstrate({
          passed,
          total,
          labels: checks.map((c) => c.label),
          steps: proteomeSteps,
          nodeCount: proteomeNodeCount,
          now,
        })
      : undefined;

  const citations = buildCitations(metrics, auditedChecks, substrate);

  return {
    generatedAt: now().toISOString(),
    positiveImpactScore,
    passed,
    total,
    metrics,
    checks: auditedChecks,
    substrate,
    citations,
  };
}

interface SubstrateInput {
  passed: number;
  total: number;
  labels: readonly string[];
  steps: number;
  nodeCount: number;
  now: () => Date;
}

async function evolveSubstrate(input: SubstrateInput): Promise<SubstrateStabilitySignal> {
  const passRatio = input.total === 0 ? 0 : input.passed / input.total;
  const proteome = new ProteomeOrchestrator(
    {
      nodeCount: input.nodeCount,
      stateDim: 16,
      seed: deriveSeed(input.labels, input.passed, input.total),
      // A healthy suite (high pass ratio) pulls the substrate toward order;
      // a failing suite injects exploration. The resulting equilibrium score
      // is thus a substrate-level read of the current trust regime.
      homeostasis: clamp01(passRatio),
      mutationTemperature: clamp01(1 - passRatio),
    },
    { now: input.now },
  );

  const results = await proteome.runSteps(input.steps);
  const last = results[results.length - 1];

  return {
    kernel: 'ProteomeOrchestrator',
    steps: input.steps,
    nodeCount: proteome.nodeCount,
    equilibriumScore: last.equilibriumScore,
    energyVariance: last.energyVariance,
    merkleRoot: last.merkleRoot,
  };
}

function buildCitations(
  metrics: PositiveImpactMetrics,
  checks: readonly AuditedCheckSignal[],
  substrate: SubstrateStabilitySignal | undefined,
): ImpactCitation[] {
  const citations: ImpactCitation[] = [];

  if (metrics.merkleRoot) {
    citations.push({
      kernel: 'PositiveResonanceAmplifier',
      signal: 'growth-merkle-root',
      hash: metrics.merkleRoot,
      backs: 'contributorJoy, adoptionVelocity, beneficialOutcomeAmplification',
    });
  }

  for (const check of checks) {
    if (!check.etchAccepted || check.etchHash === null) continue;
    citations.push({
      kernel: 'HolographicEtch',
      signal: 'eudaimonic-etch',
      hash: check.etchHash,
      backs: `${check.label} → ${check.propagationHint} (flourishing ${check.flourishingScore})`,
    });
  }

  if (substrate) {
    citations.push({
      kernel: 'ProteomeOrchestrator',
      signal: 'equilibrium-merkle-root',
      hash: substrate.merkleRoot,
      backs: `substrate stability (equilibrium ${round3(substrate.equilibriumScore)})`,
    });
  }

  return citations;
}

/**
 * Derives a deterministic 32-bit seed from the audit inputs so the substrate
 * reflects the run while remaining byte-stable for replay.
 */
function deriveSeed(labels: readonly string[], passed: number, total: number): number {
  let h = 0x811c9dc5 ^ (passed * 0x01000193) ^ (total * 0x85ebca6b);
  for (const label of labels) {
    for (let i = 0; i < label.length; i++) {
      h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
    }
  }
  return h >>> 0;
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
