// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Shared types for the fast control loop (advance #2): the
 * closed feedback loop that sits *below* the slow {@link NovaEvolveTuner} genome
 * and drives the substrate to a setpoint on a fast tick, using the homeostasis
 * kernel as its actuator.
 */

/**
 * A controllable process. `measure` reports the current process variable (e.g.
 * the proteome's `equilibriumScore`); `actuate` applies a control effort (e.g.
 * sets the effective homeostasis pull-back) and advances the plant one step.
 *
 * The contract is deliberately minimal so the loop can drive a synthetic test
 * plant or the real {@link ProteomeOrchestrator} through the same interface.
 */
export interface ControlPlant {
  measure(): number | Promise<number>;
  actuate(command: ControlCommand): void | Promise<void>;
}

export interface ControlCommand {
  /** Raw control effort from the controller, after output clamping. */
  value: number;
}

export interface ControlTick {
  /** Tick index, from 0. */
  tick: number;
  /** Measured process variable this tick. */
  measurement: number;
  /** setpoint − measurement. */
  error: number;
  /** Control effort applied to the plant. */
  output: number;
  /** Proportional / integral / derivative contributions. */
  p: number;
  i: number;
  d: number;
  /** True when the controller output saturated this tick. */
  saturated: boolean;
  /** Merkle leaf: canonical digest of this tick chained on the previous. */
  hash: string;
}

export type ControlVerdict =
  | 'converged' // settled within tolerance for the settle window
  | 'diverging' // error grew without settling
  | 'oscillating' // error keeps changing sign without settling
  | 'saturated' // actuator pinned at a limit most of the run, never settled
  | 'unsettled'; // ran out of ticks before any of the above resolved

export interface FastControlReport {
  kind: 'mcop-fast-control-report';
  schemaVersion: 1;
  setpoint: number;
  ticksRun: number;
  verdict: ControlVerdict;
  rationale: string;
  /** |error| on the final tick. */
  finalError: number;
  /** Mean |error| over the settle window (steady-state error estimate). */
  steadyStateError: number;
  /** First tick from which the loop stayed settled, or null if never. */
  settleTick: number | null;
  /** Peak overshoot beyond the setpoint, as a fraction of the setpoint step. */
  overshoot: number;
  /** Count of error-derivative sign changes (oscillation proxy). */
  oscillationCount: number;
  /** Fraction of ticks the actuator was saturated. */
  saturationRate: number;
  /** Full per-tick trace, in order. */
  ticks: ControlTick[];
  /** Merkle root sealing the trace (the final tick hash). */
  merkleRoot: string;
  generatedAt: string;
}

export interface FastControlLoopOptions {
  /** |error| at or below which a tick counts as "on target". Default 0.02. */
  settleTolerance?: number;
  /** Consecutive on-target ticks required to declare convergence. Default 5. */
  settleWindow?: number;
  /** Time step passed to the controller each tick. Default 1. */
  dt?: number;
  /** Clock override for deterministic provenance in tests. */
  now?: () => Date;
}
