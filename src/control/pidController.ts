// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Deterministic discrete PID controller — the control *law* the
 * fast loop runs every tick.
 *
 * The CUDA kernels already sketch the two halves of a feedback loop: a
 * `homeostasis` op that drags state toward an equilibrium, and an `evolveScore`
 * op that measures it. What was missing is the *controller* that closes them —
 * something that reads the measured error and decides how hard to actuate,
 * instead of applying a fixed-gain pull-back open-loop. This is that piece.
 *
 * It is a textbook positional-form PID, but hardened for an auditable substrate:
 *
 *   - **Deterministic.** No clock, no RNG; given the same measurements and `dt`
 *     it produces the same outputs, so a sealed control trace replays exactly.
 *   - **Anti-windup.** The integral term is clamped, and integration is held
 *     (conditional integration) whenever the output is saturated and further
 *     integration would only deepen the saturation — the classic fix for the
 *     "integrator winds up while the actuator is pinned" failure.
 *   - **Derivative on measurement.** By default the derivative acts on the
 *     measurement, not the error, so a step change in the setpoint does not
 *     produce a derivative "kick".
 */

export interface PIDGains {
  /** Proportional gain. */
  kp: number;
  /** Integral gain (per unit time). */
  ki: number;
  /** Derivative gain (per unit time). */
  kd: number;
}

export interface PIDOptions {
  gains: PIDGains;
  /** Target value the controller drives the measurement toward. */
  setpoint: number;
  /** Output (control effort) clamp. Defaults to (-∞, +∞). */
  outputMin?: number;
  outputMax?: number;
  /** Integral-accumulator clamp for anti-windup. Defaults to the output clamp. */
  integralMin?: number;
  integralMax?: number;
  /**
   * When true (default) the derivative term acts on −Δmeasurement, avoiding a
   * derivative kick on setpoint changes. When false it acts on Δerror.
   */
  derivativeOnMeasurement?: boolean;
  /** Default time step used when `update` is called without an explicit `dt`. */
  sampleTime?: number;
}

export interface PIDUpdate {
  /** Clamped control effort to apply to the plant. */
  output: number;
  /** setpoint − measurement at this tick. */
  error: number;
  /** Proportional contribution. */
  p: number;
  /** Integral contribution (post-anti-windup). */
  i: number;
  /** Derivative contribution. */
  d: number;
  /** True when the raw output was clamped to a limit this tick. */
  saturated: boolean;
}

const INF = Number.POSITIVE_INFINITY;

export class PIDController {
  private gains: PIDGains;
  private setpoint: number;
  private readonly outputMin: number;
  private readonly outputMax: number;
  private readonly integralMin: number;
  private readonly integralMax: number;
  private readonly derivativeOnMeasurement: boolean;
  private readonly sampleTime: number;

  private integral = 0;
  private prevError: number | undefined;
  private prevMeasurement: number | undefined;

  constructor(options: PIDOptions) {
    this.gains = { ...options.gains };
    this.setpoint = options.setpoint;
    this.outputMin = options.outputMin ?? -INF;
    this.outputMax = options.outputMax ?? INF;
    // Anti-windup default: bound the integral by the output range so the
    // integral term alone can never demand more than the actuator can deliver.
    this.integralMin = options.integralMin ?? this.outputMin;
    this.integralMax = options.integralMax ?? this.outputMax;
    this.derivativeOnMeasurement = options.derivativeOnMeasurement ?? true;
    this.sampleTime = options.sampleTime ?? 1;
  }

  /** Advances the controller one tick and returns the control decision. */
  update(measurement: number, dt: number = this.sampleTime): PIDUpdate {
    const step = dt > 0 && Number.isFinite(dt) ? dt : this.sampleTime;
    const error = this.setpoint - measurement;

    const p = this.gains.kp * error;

    // Tentative integral with clamping (windup guard #1).
    const candidateIntegral = clamp(
      this.integral + this.gains.ki * error * step,
      this.integralMin,
      this.integralMax,
    );

    const d = this.derivativeTerm(error, measurement, step);

    const rawWithCandidate = p + candidateIntegral + d;
    const clamped = clamp(rawWithCandidate, this.outputMin, this.outputMax);
    const saturated = rawWithCandidate !== clamped;

    // Conditional integration (windup guard #2): only commit the new integral
    // if we are not saturated, or if integrating would pull us *out* of
    // saturation (error has the opposite sign of the saturated direction).
    const pushingDeeper =
      (clamped >= this.outputMax && error > 0) || (clamped <= this.outputMin && error < 0);
    this.integral = saturated && pushingDeeper ? this.integral : candidateIntegral;

    const output = clamp(p + this.integral + d, this.outputMin, this.outputMax);

    this.prevError = error;
    this.prevMeasurement = measurement;

    return { output, error, p, i: this.integral, d, saturated };
  }

  private derivativeTerm(error: number, measurement: number, step: number): number {
    if (this.gains.kd === 0) return 0;
    if (this.derivativeOnMeasurement) {
      if (this.prevMeasurement === undefined) return 0;
      return -this.gains.kd * ((measurement - this.prevMeasurement) / step);
    }
    if (this.prevError === undefined) return 0;
    return this.gains.kd * ((error - this.prevError) / step);
  }

  setSetpoint(setpoint: number): void {
    this.setpoint = setpoint;
  }

  getSetpoint(): number {
    return this.setpoint;
  }

  setGains(gains: Partial<PIDGains>): void {
    this.gains = { ...this.gains, ...gains };
  }

  getGains(): PIDGains {
    return { ...this.gains };
  }

  /** Clears integral and derivative history (e.g. after a regime change). */
  reset(): void {
    this.integral = 0;
    this.prevError = undefined;
    this.prevMeasurement = undefined;
  }
}

export function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
