// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Shared types for the pre-registered, multi-rater, held-out
 * efficacy program — the first advance the framework's own roadmap names as the
 * one worth more than every proposed new layer combined: evidence that the
 * cognitive machinery produces *better reasoning* rather than *better-attested*
 * reasoning, measured in a way the {@link NovaEvolveTuner} cannot optimise
 * against.
 */

import type { ReliabilityMetric } from './interRaterReliability';

/** A single held-out evaluation item. `id` is what the isolation barrier hides. */
export interface EfficacyTask {
  id: string;
  /** Opaque task payload handed to a system under test. */
  prompt: unknown;
  /** Optional free-form metadata (domain, difficulty, …) — never the answer. */
  meta?: Record<string, unknown>;
}

/** What a system under test returns for a task. Raters see `content` only. */
export interface EfficacyOutput {
  taskId: string;
  /** The reasoning artefact a rater will judge. */
  content: unknown;
}

/** The arm a system belongs to. Raters never see this. */
export type Arm = 'treatment' | 'control';

export interface SystemUnderTest {
  id: string;
  arm: Arm;
  run(task: EfficacyTask): Promise<EfficacyOutput> | EfficacyOutput;
}

/** A blinded item shown to a rater: arm and system identity are stripped. */
export interface BlindedItem {
  /** Stable opaque handle the program uses to re-associate the rating. */
  handle: string;
  task: EfficacyTask;
  output: EfficacyOutput;
}

export interface Rater {
  id: string;
  /** Returns a score on the pre-registered rubric scale, or `null` to abstain. */
  rate(item: BlindedItem): Promise<number | null> | number | null;
}

/** The pre-registered analysis plan and decision rule. Frozen before results. */
export interface PreRegistrationProtocol {
  /** Human-readable directional hypothesis being tested. */
  hypothesis: string;
  /** Name of the primary outcome (informational; the rubric defines the scale). */
  primaryMetric: string;
  /** Inclusive rubric bounds, e.g. `{ min: 1, max: 7 }`. */
  rubric: { min: number; max: number; description: string };
  /** Reliability metric and the floor below which the verdict is inconclusive. */
  reliability: { metric: ReliabilityMetric; floor: number };
  /** Decision rule on the primary effect size (Cliff's delta). */
  decisionRule: {
    /** Minimum |Cliff's delta| to call the effect non-negligible. */
    minCliffsDelta: number;
    /** Required direction of the effect. */
    direction: 'treatment-greater' | 'control-greater' | 'two-sided';
    /** Confidence level for the bootstrap CI (e.g. 0.95). */
    ciLevel: number;
    /** Number of bootstrap resamples. */
    bootstrapResamples: number;
    /** PRNG seed fixing the bootstrap so the CI is replayable. */
    seed: number;
  };
  /**
   * Commitment to the held-out set: a salted digest of the sorted task ids.
   * Sealing this *before* results is what makes the set "held out" — the
   * contents cannot be derived from the commitment, and the commitment cannot
   * be changed after the fact without breaking the pre-registration hash.
   */
  heldOutCommitment: string;
  /** Free-form notes: exclusions, stopping rule, conflicts of interest. */
  analysisPlan: string;
}

export interface SealedPreRegistration {
  protocol: PreRegistrationProtocol;
  /** ISO timestamp the protocol was sealed (must precede result admission). */
  sealedAt: string;
  /** Canonical SHA-256 over `{ protocol, sealedAt }`. The tamper anchor. */
  preRegistrationHash: string;
}

export type EfficacyVerdict =
  | 'supported' // effect meets the pre-registered rule and reliability gate
  | 'not-supported' // reliability ok, but effect fails the rule
  | 'inconclusive' // reliability below floor — raters did not earn adjudication
  | 'invalidated'; // protocol violated (leakage, post-hoc preReg, …)

export interface EfficacyReport {
  kind: 'mcop-efficacy-report';
  schemaVersion: 1;
  preRegistrationHash: string;
  /** True iff the pre-registration was sealed strictly before results. */
  preRegisteredBeforeResults: boolean;
  verdict: EfficacyVerdict;
  /** Why the verdict was reached, in order of precedence. */
  rationale: string;
  reliability: {
    metric: ReliabilityMetric;
    floor: number;
    treatmentAlpha: number;
    controlAlpha: number;
    pooledAlpha: number;
    meetsFloor: boolean;
  };
  effect: {
    cliffsDelta: number;
    magnitude: 'negligible' | 'small' | 'medium' | 'large';
    hodgesLehmannShift: number;
    bootstrap: { point: number; lower: number; upper: number; ciLevel: number; resamples: number };
    mannWhitney: { u: number; z: number; pValue: number };
    treatmentMedian: number;
    controlMedian: number;
    n: { treatment: number; control: number; raters: number };
  };
  /** Leakage findings from scanning the tuner's own trace stream. */
  leakage: { checked: boolean; violations: string[] };
  generatedAt: string;
  /** Canonical SHA-256 sealing the whole report (excludes this field). */
  reportMerkleRoot: string;
}
