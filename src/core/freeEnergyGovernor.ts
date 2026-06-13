// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Free-energy-governed expansion — turn graph-of-thought halting from an
 * administrative limit into a physical one.
 *
 * `PGoT` currently stops expanding a reasoning graph when it hits `maxFanout`
 * or `maxDepth`: bookkeeping caps with no link to whether more thinking is
 * *worth it*. This module wires the existing {@link ./thermoTruthKernel} into
 * the expansion decision. Treat the thought set as a thermodynamic ensemble:
 *
 *   - **U** (internal energy) = the per-node budget already spent — each
 *     thought's `energy` (token cost, compute, etch expenditure; caller's
 *     choice). Adding a node always raises U.
 *   - **S** (entropy) = Shannon entropy over the quantized thought
 *     configuration vectors — how much *coverage / diversity* the ensemble has.
 *   - **T** (temperature) = the equipartition temperature `(2/3)σ²` over the
 *     configuration-space variance, plus a **curiosity** offset. Curiosity is
 *     no longer a hand-tuned bonus; it is literally temperature.
 *   - **F = U − T·S** (Helmholtz free energy).
 *
 * Expansion rule: **add a thought only when it lowers ensemble F** (ΔF ≤
 * tolerance) — its diversity gain, weighted by temperature, must offset its
 * budget cost. **Halt when ΔF plateaus**: the ensemble has reached equilibrium
 * with its evidence, and more thinking no longer pays for itself. Curiosity
 * temperature is the knob that trades exploration for thrift: hotter ⇒ the
 * −T·S term dominates ⇒ more diverse nodes are accepted before equilibrium.
 *
 * ## The hard dependency this module refuses to hide
 *
 * Temperature is computed from configuration-space variance. Under the
 * **hash** encoder backend, distinct texts map to statistically independent
 * tensors whose ensemble variance is near-constant (concentration of measure):
 * T cannot tell a focused thought-ensemble from a scattered one, every distinct
 * microstate is unique so S saturates at its maximum, and **F collapses to U** —
 * the free-energy rule degenerates into plain budget accounting. A probe over a
 * small focused-vs-scattered set measured ~13% relative temperature range under
 * the hash backend versus ~42% under an embedding backend (~3× more
 * discriminating). So the governor does not *assume* the signal is good — it
 * {@link assessFreeEnergySignal | measures the temperature's dynamic range} and,
 * when it is too flat to be meaningful, **refuses to govern and falls back to
 * the administrative limits**, reporting exactly why. Free-energy governance is
 * meaningful only with a semantic (embedding) backend.
 *
 * Everything here is deterministic and pure — no clocks, no RNG — preserving
 * the substrate's reproducibility.
 *
 * @see docs/FREE_ENERGY_GOVERNOR.md
 */

import {
  computeEntropy,
  computeInternalEnergy,
  computeTemperature,
  type ThermoMicrostate,
} from './thermoTruthKernel';

const EPS = 1e-10;

/** A thought, reduced to the thermodynamic quantities the governor needs. */
export interface GovernedThought {
  readonly id: string;
  /** Per-node budget — the node's contribution to internal energy U. */
  readonly energy: number;
  /** Configuration vector (the node's context/embedding tensor). */
  readonly stateVector: readonly number[];
}

export interface FreeEnergyGovernorConfig {
  /**
   * Curiosity as literal temperature — an additive offset on the equipartition
   * temperature. Higher ⇒ the entropy term is weighted more ⇒ more exploration.
   * Default `0` (drive on the intrinsic ensemble temperature alone).
   */
  readonly curiosityTemperature?: number;
  /**
   * A candidate is accepted iff `ΔF ≤ tolerance`. Default `0` (must strictly
   * not raise free energy).
   */
  readonly tolerance?: number;
  /** `|ΔF|` at or below this counts as a plateau step. Default `1e-3`. */
  readonly plateauEpsilon?: number;
  /**
   * Number of consecutive plateau steps that declare equilibrium (halt).
   * Default `2`.
   */
  readonly plateauWindow?: number;
  /**
   * Minimum relative temperature dynamic range across candidates for the
   * free-energy signal to be considered informative. Below this the governor
   * falls back to administrative limits. Default `0.15` (the hash backend
   * measured ~0.13; an embedding backend ~0.42).
   */
  readonly degeneracyFloor?: number;
  /** Effective Boltzmann constant. Default `1`. */
  readonly kEff?: number;
  /** Quantization precision for the entropy estimate. Default `6`. */
  readonly precision?: number;
}

export interface FreeEnergySignal {
  /** Whether temperature discriminates enough for F to govern. */
  readonly informative: boolean;
  /** Relative dynamic range of temperature across the candidate set. */
  readonly temperatureDynamicRange: number;
  /** The floor it was compared against. */
  readonly degeneracyFloor: number;
  /** Plain-language explanation (always set; cites the hash-backend collapse). */
  readonly reason: string;
}

export interface ExpansionEvaluation {
  readonly candidateId: string;
  /** Free energy of the ensemble before adding the candidate. */
  readonly freeEnergyBefore: number;
  /** Free energy of the ensemble with the candidate added. */
  readonly freeEnergyAfter: number;
  /** `freeEnergyAfter − freeEnergyBefore`. Negative = worth adding. */
  readonly deltaF: number;
  /** Temperature (incl. curiosity) of the candidate-augmented ensemble. */
  readonly temperature: number;
  /** Whether the rule accepts this expansion (`ΔF ≤ tolerance`). */
  readonly expand: boolean;
}

export type GovernedMode = 'free-energy' | 'administrative-fallback';

export interface GovernedExpansionResult {
  readonly mode: GovernedMode;
  /** Candidates accepted, in commit order. */
  readonly accepted: readonly GovernedThought[];
  /** Per-round evaluation of the candidate chosen that round. */
  readonly trajectory: readonly ExpansionEvaluation[];
  /** Why expansion stopped. */
  readonly haltReason: 'plateau' | 'no-improving-candidate' | 'exhausted' | 'degenerate-signal';
  /** The signal assessment that decided `mode`. */
  readonly signal: FreeEnergySignal;
}

/**
 * Helmholtz free energy `F = U − T·S` of a thought ensemble, with temperature
 * augmented by the curiosity offset. Reuses the kernel's pure quantities, so it
 * stays consistent with every other thermodynamic reading in the system.
 */
export function ensembleFreeEnergy(
  thoughts: readonly GovernedThought[],
  config: FreeEnergyGovernorConfig = {},
): number {
  const kEff = config.kEff ?? 1;
  const precision = config.precision ?? 6;
  const curiosity = config.curiosityTemperature ?? 0;
  const micro = toMicrostates(thoughts);
  const u = computeInternalEnergy(micro);
  const s = computeEntropy(micro, precision);
  const t = computeTemperature(micro, kEff) + curiosity;
  return u - t * s * kEff;
}

/** Temperature (equipartition + curiosity) of a thought ensemble. */
export function ensembleTemperature(
  thoughts: readonly GovernedThought[],
  config: FreeEnergyGovernorConfig = {},
): number {
  return computeTemperature(toMicrostates(thoughts), config.kEff ?? 1) + (config.curiosityTemperature ?? 0);
}

/**
 * Measure whether the free-energy signal is informative for this ensemble +
 * candidate set, by the dynamic range of the temperature each candidate would
 * produce. A near-constant temperature (the hash-backend regime) means F cannot
 * discriminate between candidates and the governor must not pretend otherwise.
 */
export function assessFreeEnergySignal(
  ensemble: readonly GovernedThought[],
  candidates: readonly GovernedThought[],
  config: FreeEnergyGovernorConfig = {},
): FreeEnergySignal {
  const floor = config.degeneracyFloor ?? 0.15;
  if (candidates.length < 2) {
    return {
      informative: false,
      temperatureDynamicRange: 0,
      degeneracyFloor: floor,
      reason:
        'Fewer than two candidates: no dynamic range to assess. Falling back to administrative limits.',
    };
  }
  // Measure discriminating power on the *equipartition* temperature alone.
  // The curiosity offset is an additive constant; including it would inflate
  // the mean and artificially shrink the relative dynamic range, masking a
  // genuinely informative signal (or flattering a degenerate one).
  const kEff = config.kEff ?? 1;
  const temps = candidates.map((c) =>
    computeTemperature(toMicrostates([...ensemble, c]), kEff),
  );
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const t of temps) {
    if (t < min) min = t;
    if (t > max) max = t;
    sum += t;
  }
  const mean = sum / temps.length;
  const range = (max - min) / (Math.abs(mean) + EPS);
  const informative = range >= floor;
  const reason = informative
    ? `Temperature dynamic range ${(range * 100).toFixed(1)}% ≥ floor ${(floor * 100).toFixed(
        1,
      )}%: configuration variance discriminates between candidates, so F governs.`
    : `Temperature dynamic range ${(range * 100).toFixed(1)}% < floor ${(floor * 100).toFixed(
        1,
      )}%: configuration variance is near-constant across candidates. This is the hash-backend collapse — distinct texts map to independent tensors, so T degenerates, S saturates, and F reduces to the budget U. Free-energy governance needs a semantic (embedding) backend; falling back to administrative limits.`;
  return { informative, temperatureDynamicRange: range, degeneracyFloor: floor, reason };
}

/**
 * Evaluate adding one candidate to the current ensemble: compute ΔF and whether
 * the expansion rule accepts it.
 */
export function evaluateExpansion(
  ensemble: readonly GovernedThought[],
  candidate: GovernedThought,
  config: FreeEnergyGovernorConfig = {},
): ExpansionEvaluation {
  const tolerance = config.tolerance ?? 0;
  const fBefore = ensembleFreeEnergy(ensemble, config);
  const augmented = [...ensemble, candidate];
  const fAfter = ensembleFreeEnergy(augmented, config);
  const deltaF = fAfter - fBefore;
  return {
    candidateId: candidate.id,
    freeEnergyBefore: fBefore,
    freeEnergyAfter: fAfter,
    deltaF,
    temperature: ensembleTemperature(augmented, config),
    expand: deltaF <= tolerance,
  };
}

/**
 * Drive expansion by free-energy descent: starting from `seed`, repeatedly pick
 * the remaining candidate with the most-negative ΔF, commit it if it lowers F,
 * and halt when ΔF plateaus (equilibrium) or no candidate improves F. If the
 * free-energy signal is degenerate (the hash-backend case), do **not** govern —
 * return `mode: 'administrative-fallback'` so the caller applies its
 * `maxFanout`/`maxDepth` limits instead.
 *
 * Deterministic: candidate ties broken by input order; no RNG, no clocks.
 */
export function governExpansion(
  seed: readonly GovernedThought[],
  candidates: readonly GovernedThought[],
  config: FreeEnergyGovernorConfig = {},
): GovernedExpansionResult {
  const signal = assessFreeEnergySignal(seed, candidates, config);
  if (!signal.informative) {
    return {
      mode: 'administrative-fallback',
      accepted: [],
      trajectory: [],
      haltReason: 'degenerate-signal',
      signal,
    };
  }

  const plateauEpsilon = config.plateauEpsilon ?? 1e-3;
  const plateauWindow = Math.max(1, Math.floor(config.plateauWindow ?? 2));

  const ensemble: GovernedThought[] = [...seed];
  const remaining: GovernedThought[] = [...candidates];
  const accepted: GovernedThought[] = [];
  const trajectory: ExpansionEvaluation[] = [];
  let plateauRun = 0;
  let haltReason: GovernedExpansionResult['haltReason'] = 'exhausted';

  while (remaining.length > 0) {
    // Pick the most free-energy-lowering candidate this round (deterministic).
    let bestIdx = -1;
    let best: ExpansionEvaluation | undefined;
    for (let i = 0; i < remaining.length; i += 1) {
      const evaluation = evaluateExpansion(ensemble, remaining[i], config);
      if (best === undefined || evaluation.deltaF < best.deltaF) {
        best = evaluation;
        bestIdx = i;
      }
    }
    if (!best || !best.expand) {
      haltReason = 'no-improving-candidate';
      break;
    }

    trajectory.push(best);
    const [chosen] = remaining.splice(bestIdx, 1);
    ensemble.push(chosen);
    accepted.push(chosen);

    if (Math.abs(best.deltaF) <= plateauEpsilon) {
      plateauRun += 1;
      if (plateauRun >= plateauWindow) {
        haltReason = 'plateau';
        break;
      }
    } else {
      plateauRun = 0;
    }
  }

  return { mode: 'free-energy', accepted, trajectory, haltReason, signal };
}

function toMicrostates(thoughts: readonly GovernedThought[]): ThermoMicrostate[] {
  return thoughts.map((t) => ({ energy: t.energy, stateVector: t.stateVector }));
}
