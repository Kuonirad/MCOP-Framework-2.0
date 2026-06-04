// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview FastControlLoop — closes the feedback loop the kernels sketch.
 *
 * The framework already had the two ends of a control loop: the homeostasis
 * kernel (an actuator that pulls state toward equilibrium) and the equilibrium
 * score (a sensor). But the pull-back ran *open-loop* at a fixed gain, and the
 * only adaptation was the slow {@link NovaEvolveTuner}, which re-tunes the
 * genome every N tasks against a self-referential score. Between those slow
 * meta-tunes nothing watched the substrate's actual state and corrected it.
 *
 * This loop is that fast inner controller. Each tick it:
 *
 *   1. **observes** the plant's process variable (`measure`),
 *   2. runs the {@link PIDController} to compute a control effort, and
 *   3. **actuates** the plant with that effort (`actuate`),
 *
 * sealing every tick into a Merkle chain so the whole trajectory replays
 * byte-for-byte. After the run it classifies the trajectory — converged,
 * oscillating, diverging, saturated, or unsettled — turning "did the loop
 * actually stabilise the substrate?" into an auditable verdict rather than a
 * vibe. The slow genome sets this loop's setpoint and gains (see
 * `controlTargetsFromGenome`); the loop is what makes those targets real on a
 * fast timescale.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import { PIDController } from './pidController';
import type {
  ControlPlant,
  ControlTick,
  ControlVerdict,
  FastControlLoopOptions,
  FastControlReport,
} from './types';

export class FastControlLoop {
  private readonly settleTolerance: number;
  private readonly settleWindow: number;
  private readonly dt: number;
  private readonly now: () => Date;

  constructor(
    private readonly plant: ControlPlant,
    private readonly controller: PIDController,
    options: FastControlLoopOptions = {},
  ) {
    this.settleTolerance = Math.max(0, options.settleTolerance ?? 0.02);
    this.settleWindow = Math.max(1, Math.floor(options.settleWindow ?? 5));
    this.dt = options.dt && options.dt > 0 ? options.dt : 1;
    this.now = options.now ?? (() => new Date());
  }

  /** Runs `maxTicks` of the closed loop and returns a sealed report. */
  async run(maxTicks: number): Promise<FastControlReport> {
    const total = Math.max(1, Math.floor(maxTicks));
    const ticks: ControlTick[] = [];
    let parent: string | null = null;
    const setpoint = this.controller.getSetpoint();
    const initialMeasurement = await this.plant.measure();
    const initialError = setpoint - initialMeasurement;

    for (let k = 0; k < total; k += 1) {
      const measurement = await this.plant.measure();
      const decision = this.controller.update(measurement, this.dt);
      await this.plant.actuate({ value: decision.output });

      const leaf = {
        tick: k,
        measurement: round6(measurement),
        error: round6(decision.error),
        output: round6(decision.output),
        p: round6(decision.p),
        i: round6(decision.i),
        d: round6(decision.d),
        saturated: decision.saturated,
      };
      const hash = canonicalDigest({ parent, leaf });
      parent = hash;
      ticks.push({ ...leaf, hash });
    }

    return this.summarize(setpoint, initialError, ticks);
  }

  private summarize(
    setpoint: number,
    initialError: number,
    ticks: ControlTick[],
  ): FastControlReport {
    const absErr = ticks.map((t) => Math.abs(t.error));
    const finalError = absErr[absErr.length - 1] ?? 0;

    // Settling: the earliest tick from which every subsequent tick stays within
    // tolerance (and there is at least a full settle window of them).
    let settleTick: number | null = null;
    for (let start = 0; start <= ticks.length - this.settleWindow; start += 1) {
      let ok = true;
      for (let k = start; k < ticks.length; k += 1) {
        if (absErr[k] > this.settleTolerance) {
          ok = false;
          break;
        }
      }
      if (ok) {
        settleTick = start;
        break;
      }
    }

    const windowStart = Math.max(0, ticks.length - this.settleWindow);
    const steadyStateError = mean(absErr.slice(windowStart));

    // Overshoot: how far past the setpoint the measurement swung, relative to
    // the initial setpoint step. Only meaningful when there was a step to take.
    const step = Math.abs(initialError);
    let peakBeyond = 0;
    for (const t of ticks) {
      const beyond = initialError >= 0 ? t.measurement - setpoint : setpoint - t.measurement;
      if (beyond > peakBeyond) peakBeyond = beyond;
    }
    const overshoot = step > 1e-9 ? peakBeyond / step : 0;

    // Oscillation: sign changes of the error derivative.
    let oscillationCount = 0;
    for (let k = 2; k < ticks.length; k += 1) {
      const d1 = ticks[k - 1].error - ticks[k - 2].error;
      const d2 = ticks[k].error - ticks[k - 1].error;
      if (d1 !== 0 && d2 !== 0 && Math.sign(d1) !== Math.sign(d2)) oscillationCount += 1;
    }

    const saturationRate = ticks.filter((t) => t.saturated).length / ticks.length;

    const { verdict, rationale } = this.classify({
      settled: settleTick !== null,
      settleTick,
      finalError,
      initialError: Math.abs(initialError),
      oscillationCount,
      saturationRate,
      steadyStateError,
      ticks: ticks.length,
    });

    return {
      kind: 'mcop-fast-control-report',
      schemaVersion: 1,
      setpoint: round6(setpoint),
      ticksRun: ticks.length,
      verdict,
      rationale,
      finalError: round6(finalError),
      steadyStateError: round6(steadyStateError),
      settleTick,
      overshoot: round6(overshoot),
      oscillationCount,
      saturationRate: round6(saturationRate),
      ticks,
      merkleRoot: ticks[ticks.length - 1]?.hash ?? '',
      generatedAt: this.now().toISOString(),
    };
  }

  private classify(m: {
    settled: boolean;
    settleTick: number | null;
    finalError: number;
    initialError: number;
    oscillationCount: number;
    saturationRate: number;
    steadyStateError: number;
    ticks: number;
  }): { verdict: ControlVerdict; rationale: string } {
    if (m.settled) {
      return {
        verdict: 'converged',
        rationale:
          `Settled from tick ${m.settleTick} with steady-state |error|=${round6(m.steadyStateError)} ` +
          `≤ tolerance; the closed loop stabilised the plant at the setpoint.`,
      };
    }
    // Diverging: the loop ended materially further from target than it started.
    if (m.finalError > m.initialError * 1.5 && m.initialError > 1e-6) {
      return {
        verdict: 'diverging',
        rationale:
          `Final |error|=${round6(m.finalError)} exceeds 1.5× the initial |error|=${round6(m.initialError)}; ` +
          `gains are too aggressive for this plant.`,
      };
    }
    // Oscillating: lots of error-derivative sign changes but never settled.
    if (m.oscillationCount >= Math.max(3, Math.floor(m.ticks / 3))) {
      return {
        verdict: 'oscillating',
        rationale:
          `${m.oscillationCount} error-derivative sign changes without settling; the loop is ` +
          `limit-cycling around the setpoint.`,
      };
    }
    // Saturated: actuator pinned most of the run and never reached target.
    if (m.saturationRate > 0.5) {
      return {
        verdict: 'saturated',
        rationale:
          `Actuator saturated on ${Math.round(m.saturationRate * 100)}% of ticks without settling; ` +
          `the setpoint is likely unreachable within the output limits.`,
      };
    }
    return {
      verdict: 'unsettled',
      rationale:
        `Ran ${m.ticks} ticks ending at |error|=${round6(m.finalError)} without settling within ` +
        `tolerance; needs more ticks or different gains.`,
    };
  }
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function round6(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}
