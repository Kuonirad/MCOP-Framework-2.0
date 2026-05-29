// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Control plants for the fast loop, plus the slow→fast bridge.
 *
 *   - {@link FirstOrderPlant}: a deterministic first-order lag — the standard
 *     analytically-tractable test bed. Its DC gain is known, so the loop's
 *     steady-state behaviour (P-only residual error, PI zero error) is
 *     verifiable rather than empirical.
 *   - {@link ProteomeControlPlant}: wraps the real {@link ProteomeOrchestrator}
 *     so the fast loop drives the actual 150-node substrate — `measure` steps
 *     the proteome and reads its `equilibriumScore`; `actuate` sets the
 *     effective homeostasis pull-back for the next step. This is the homeostasis
 *     kernel acting as the loop's actuator, now closed.
 *   - {@link controlTargetsFromGenome}: maps a NOVA-EVOLVE genome's slow
 *     edge-of-chaos knobs onto the inner loop's setpoint and gains, so the
 *     two timescales are coupled by construction.
 */

import { ProteomeOrchestrator } from '../proteome/ProteomeOrchestrator';
import { clamp, clamp01, type PIDGains } from './pidController';
import type { ControlCommand, ControlPlant } from './types';

/**
 * First-order lag plant: `y ← a·y + (1−a)·K·u`. Steady-state output for a
 * constant input `u` is `K·u` (the DC gain is `K`, independent of `a`), which
 * makes the closed-loop steady-state error analytically known.
 */
export class FirstOrderPlant implements ControlPlant {
  private y: number;
  constructor(
    private readonly a: number = 0.7,
    private readonly k: number = 1,
    initial = 0,
  ) {
    this.y = initial;
  }

  measure(): number {
    return this.y;
  }

  actuate(command: ControlCommand): void {
    this.y = this.a * this.y + (1 - this.a) * this.k * command.value;
  }

  /** Current state, for tests/inspection. */
  get state(): number {
    return this.y;
  }
}

export interface ProteomeControlPlantOptions {
  /** Also modulate mutationTemperature inversely with the control effort. */
  coupleMutationTemperature?: boolean;
}

/**
 * Adapts a {@link ProteomeOrchestrator} to the {@link ControlPlant} interface.
 * The control effort is interpreted as the effective homeostasis pull-back
 * (clamped to [0, 1]); the process variable is the per-step `equilibriumScore`.
 */
export class ProteomeControlPlant implements ControlPlant {
  constructor(
    private readonly proteome: ProteomeOrchestrator,
    private readonly options: ProteomeControlPlantOptions = {},
  ) {}

  /** Steps the substrate once and reports its equilibrium score. */
  async measure(): Promise<number> {
    const result = await this.proteome.step();
    return result.equilibriumScore;
  }

  /** Sets the homeostasis pull-back (and optionally mutationTemperature). */
  actuate(command: ControlCommand): void {
    const homeostasis = clamp01(command.value);
    this.proteome.homeostasis = homeostasis;
    if (this.options.coupleMutationTemperature) {
      // More pull-back ⇒ less exploration noise, and vice versa. Keeps the
      // substrate on the edge of chaos instead of letting the controller drive
      // it into either a frozen or a chaotic corner.
      this.proteome.mutationTemperature = clamp01(1 - homeostasis);
    }
  }

  /** The homeostasis value currently applied to the substrate. */
  get appliedHomeostasis(): number {
    return this.proteome.homeostasis;
  }
}

/** The minimal slice of a NOVA-EVOLVE genome the bridge consumes. */
export interface GenomeControlSlice {
  homeostasis: number;
  mutationTemperature: number;
}

export interface ControlTargets {
  setpoint: number;
  gains: PIDGains;
  outputMin: number;
  outputMax: number;
}

/**
 * Maps the slow genome's edge-of-chaos knobs onto the fast loop's targets.
 *
 *   - `homeostasis` sets *where* to aim: a stronger intended pull-back implies a
 *     tighter target equilibrium score, mapped into [0.4, 0.8].
 *   - `mutationTemperature` sets *how hard* to push: more exploration noise ⇒
 *     gentler proportional gain, so the inner loop tracks the trend rather than
 *     fighting per-step Gaussian jitter.
 *
 * These are principled defaults, not tuned constants; callers can override the
 * returned gains. The point is that the two timescales are coupled: re-tuning
 * the genome moves the inner loop's goalposts, which is what "closing the loop"
 * means here.
 */
export function controlTargetsFromGenome(genome: GenomeControlSlice): ControlTargets {
  const homeostasis = clamp01(genome.homeostasis);
  const temperature = clamp01(genome.mutationTemperature);
  const setpoint = clamp(0.4 + 0.4 * homeostasis, 0.4, 0.8);
  const kp = clamp(0.6 * (1 - 0.5 * temperature), 0.1, 0.6);
  return {
    setpoint,
    gains: { kp, ki: 0.15, kd: 0.05 },
    outputMin: 0,
    outputMax: 1,
  };
}
