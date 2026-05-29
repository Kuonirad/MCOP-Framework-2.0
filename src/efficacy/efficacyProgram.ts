// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview The pre-registered, multi-rater, held-out efficacy program.
 *
 * This is the framework's answer to its own hardest open question: it is richly
 * able to prove that a reasoning trace is *attested* — Merkle-rooted, replayable,
 * mutation-tested — but it had no way to show the cognitive machinery produces
 * *better reasoning*. The {@link NovaEvolveTuner} optimises a self-referential
 * fit score; left to itself it can only ever make its own metric go up.
 *
 * The program closes that gap with a method the tuner cannot game:
 *
 *   1. A {@link SealedPreRegistration} freezes the hypothesis, rubric,
 *      reliability floor, and decision rule before any output is rated.
 *   2. A {@link HeldOutVault} keeps the evaluation tasks behind a capability
 *      gate the optimiser is never given, and a leakage scan proves none of
 *      those tasks reached the optimiser's context.
 *   3. Several independent, blinded raters score treatment vs control outputs;
 *      Krippendorff's alpha gates whether they agreed enough to adjudicate.
 *   4. A distribution-free effect size with a seeded bootstrap CI decides the
 *      pre-registered hypothesis.
 *
 * The headline verdict is rater-derived, not score-function-derived. The tuner
 * can move its own number all it likes; it cannot move this one without
 * actually convincing independent judges on data it never saw.
 *
 * Deterministic given its inputs (the only wall-clock value is `generatedAt`,
 * which never feeds a statistic), so a sealed program replays byte-for-byte.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import {
  detectLeakage,
  HeldOutVault,
  type EvaluatorCapability,
} from './isolationBarrier';
import {
  krippendorffAlpha,
  type RatingMatrix,
} from './interRaterReliability';
import {
  bootstrapCI,
  cliffsDelta,
  clamp,
  hodgesLehmannShift,
  mannWhitneyU,
  median,
} from './statistics';
import { verifyPreRegistration } from './preRegistration';
import type {
  Arm,
  BlindedItem,
  EfficacyOutput,
  EfficacyReport,
  EfficacyVerdict,
  Rater,
  SealedPreRegistration,
  SystemUnderTest,
} from './types';

export interface RunEfficacyOptions {
  /** Clock override for deterministic provenance in tests. */
  now?: () => Date;
  /**
   * The exact context the tuner consumed (serialised Stigmergy traces / etches).
   * When provided, it is scanned for held-out task leakage; a hit invalidates
   * the run. Omit only when there is no optimiser in the loop.
   */
  observedTunerContext?: unknown;
}

export interface EfficacyInputs {
  sealed: SealedPreRegistration;
  vault: HeldOutVault;
  capability: EvaluatorCapability;
  systems: ReadonlyArray<SystemUnderTest>;
  raters: ReadonlyArray<Rater>;
}

/** Runs the full program and returns a Merkle-sealed {@link EfficacyReport}. */
export async function runEfficacyProgram(
  inputs: EfficacyInputs,
  options: RunEfficacyOptions = {},
): Promise<EfficacyReport> {
  const { sealed, vault, capability, systems, raters } = inputs;
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();

  const treatmentSystems = systems.filter((s) => s.arm === 'treatment');
  const controlSystems = systems.filter((s) => s.arm === 'control');
  if (treatmentSystems.length === 0 || controlSystems.length === 0) {
    throw new Error('runEfficacyProgram requires at least one treatment and one control system.');
  }
  if (raters.length < 2) {
    throw new Error('runEfficacyProgram requires at least two raters (multi-rater by design).');
  }

  // ---- Protocol integrity gates (precede everything else) -----------------
  const preRegValid = verifyPreRegistration(sealed);
  const commitmentMatches = sealed.protocol.heldOutCommitment === vault.commitment;
  const preRegisteredBeforeResults = sealed.sealedAt < generatedAt;

  const protocolViolations: string[] = [];
  if (!preRegValid) protocolViolations.push('pre-registration hash does not verify');
  if (!commitmentMatches) {
    protocolViolations.push('held-out commitment does not match the sealed protocol');
  }
  if (!preRegisteredBeforeResults) {
    protocolViolations.push('pre-registration was not sealed strictly before results');
  }

  // ---- Reveal held-out tasks (capability-gated) ---------------------------
  const tasks = vault.reveal(capability);

  // ---- Leakage scan over the optimiser's observed context -----------------
  const leakage =
    options.observedTunerContext === undefined
      ? { checked: false, violations: [] as string[] }
      : detectLeakage(options.observedTunerContext, vault, capability);

  // ---- Produce outputs, then blind them for rating ------------------------
  const rubricMin = sealed.protocol.rubric.min;
  const rubricMax = sealed.protocol.rubric.max;

  interface ScoredUnit {
    taskId: string;
    arm: Arm;
    systemId: string;
    ratings: Array<number | null>;
  }

  const blinded: BlindedItem[] = [];
  const units: ScoredUnit[] = [];

  for (const system of systems) {
    for (const task of tasks) {
      const output: EfficacyOutput = await system.run(task);
      const handle = canonicalDigest({
        kind: 'mcop-blinded-item',
        i: blinded.length,
        // The handle is deliberately opaque: it does NOT encode arm or system,
        // so a rater (or a rater's logging) cannot recover the assignment.
        nonce: sealed.preRegistrationHash,
      });
      blinded.push({ handle, task, output });
      units.push({ taskId: task.id, arm: system.arm, systemId: system.id, ratings: [] });
    }
  }

  // Each rater scores every blinded item; abstentions (null) are preserved.
  for (let u = 0; u < blinded.length; u += 1) {
    for (const rater of raters) {
      const raw = await rater.rate(blinded[u]);
      const score = raw === null || raw === undefined || !Number.isFinite(raw)
        ? null
        : clamp(raw, rubricMin, rubricMax);
      units[u].ratings.push(score);
    }
  }

  // ---- Inter-rater reliability (the adjudication gate) --------------------
  const metric = sealed.protocol.reliability.metric;
  const floor = sealed.protocol.reliability.floor;
  const toMatrix = (arm?: Arm): RatingMatrix =>
    units.filter((row) => arm === undefined || row.arm === arm).map((row) => row.ratings);

  const treatmentAlpha = krippendorffAlpha(toMatrix('treatment'), metric).alpha;
  const controlAlpha = krippendorffAlpha(toMatrix('control'), metric).alpha;
  const pooledAlpha = krippendorffAlpha(toMatrix(), metric).alpha;
  const meetsFloor = pooledAlpha >= floor;

  // ---- Per-item aggregation → treatment vs control samples ----------------
  const aggregateByTask = (arm: Arm): number[] => {
    const byTask = new Map<string, number[]>();
    for (const row of units) {
      if (row.arm !== arm) continue;
      const present = row.ratings.filter((r): r is number => r !== null && Number.isFinite(r));
      if (present.length === 0) continue;
      const taskScores = byTask.get(row.taskId) ?? [];
      taskScores.push(median(present)); // median across raters for this output
      byTask.set(row.taskId, taskScores);
    }
    // If an arm has multiple systems, average their per-task medians.
    const out: number[] = [];
    for (const scores of byTask.values()) {
      out.push(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    return out;
  };

  const treatmentScores = aggregateByTask('treatment');
  const controlScores = aggregateByTask('control');

  // ---- Effect size + inference --------------------------------------------
  const { delta, magnitude } = cliffsDelta(treatmentScores, controlScores);
  const hl = hodgesLehmannShift(treatmentScores, controlScores);
  const mw = mannWhitneyU(treatmentScores, controlScores);
  const rule = sealed.protocol.decisionRule;
  const boot = bootstrapCI(
    treatmentScores,
    controlScores,
    (t, c) => cliffsDelta(t, c).delta,
    { resamples: rule.bootstrapResamples, ciLevel: rule.ciLevel, seed: rule.seed },
  );

  // ---- Verdict (precedence: integrity → leakage → reliability → effect) ---
  let verdict: EfficacyVerdict;
  let rationale: string;

  const directionOk =
    rule.direction === 'two-sided'
      ? Math.abs(delta) >= rule.minCliffsDelta
      : rule.direction === 'treatment-greater'
        ? delta >= rule.minCliffsDelta
        : delta <= -rule.minCliffsDelta;

  const ciExcludesNull =
    rule.direction === 'two-sided'
      ? boot.lower > 0 || boot.upper < 0
      : rule.direction === 'treatment-greater'
        ? boot.lower > 0
        : boot.upper < 0;

  if (protocolViolations.length > 0) {
    verdict = 'invalidated';
    rationale = `Protocol integrity failed: ${protocolViolations.join('; ')}.`;
  } else if (leakage.checked && leakage.violations.length > 0) {
    verdict = 'invalidated';
    rationale = `Held-out leakage detected: ${leakage.violations.join('; ')}.`;
  } else if (!meetsFloor) {
    verdict = 'inconclusive';
    rationale =
      `Inter-rater reliability (α=${round3(pooledAlpha)}) is below the pre-registered ` +
      `floor (${floor}); raters did not agree enough to adjudicate efficacy.`;
  } else if (directionOk && ciExcludesNull) {
    verdict = 'supported';
    rationale =
      `Cliff's delta=${round3(delta)} (${magnitude}) meets the pre-registered rule ` +
      `(|δ|≥${rule.minCliffsDelta}, ${rule.direction}) with a ${Math.round(rule.ciLevel * 100)}% ` +
      `bootstrap CI [${round3(boot.lower)}, ${round3(boot.upper)}] excluding the null.`;
  } else {
    verdict = 'not-supported';
    rationale =
      `Cliff's delta=${round3(delta)} (${magnitude}) does not meet the pre-registered rule ` +
      `(|δ|≥${rule.minCliffsDelta}, ${rule.direction}); CI [${round3(boot.lower)}, ` +
      `${round3(boot.upper)}]. Raters agreed (α=${round3(pooledAlpha)}) but the effect is insufficient.`;
  }

  const reportBody = {
    kind: 'mcop-efficacy-report' as const,
    schemaVersion: 1 as const,
    preRegistrationHash: sealed.preRegistrationHash,
    preRegisteredBeforeResults,
    verdict,
    rationale,
    reliability: {
      metric,
      floor,
      treatmentAlpha: round3(treatmentAlpha),
      controlAlpha: round3(controlAlpha),
      pooledAlpha: round3(pooledAlpha),
      meetsFloor,
    },
    effect: {
      cliffsDelta: round3(delta),
      magnitude,
      hodgesLehmannShift: round3(hl),
      bootstrap: {
        point: round3(boot.point),
        lower: round3(boot.lower),
        upper: round3(boot.upper),
        ciLevel: boot.ciLevel,
        resamples: boot.resamples,
      },
      mannWhitney: { u: round3(mw.u), z: round3(mw.z), pValue: round3(mw.pValue) },
      treatmentMedian: round3(median(treatmentScores)),
      controlMedian: round3(median(controlScores)),
      n: { treatment: treatmentScores.length, control: controlScores.length, raters: raters.length },
    },
    leakage,
    generatedAt,
  };

  const reportMerkleRoot = canonicalDigest(reportBody);
  return { ...reportBody, reportMerkleRoot };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
