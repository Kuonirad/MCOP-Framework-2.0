// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview ThermoTruthKernel — a deterministic TypeScript port of the
 * thermodynamic-consensus primitives from the `thermo-truth-proto` project
 * (https://github.com/Kuonirad/thermo-truth-proto, `core/state.py` +
 * `core/annealing.py`).
 *
 * The kernel supplies MCOP with *physical natural constraints* for
 * conditioning: instead of relying solely on hand-tuned thresholds, a
 * reasoning ensemble can be scored by its Helmholtz free energy
 * `F = U − T·S` and driven toward low-`F`, low-surprise coherent states the
 * way a physical system relaxes toward equilibrium.
 *
 * Design constraints that make this safe to infuse into MCOP:
 *
 *   - **Deterministic.** No `Math.random`, no clocks. Every output is a pure
 *     function of the inputs, so it preserves the proteome's mulberry32
 *     seeded reproducibility and RFC 8785 Merkle parity. The Python proto's
 *     stochastic `anneal_step` (numpy `random.choice` resampling) is replaced
 *     by a deterministic greedy free-energy descent — see
 *     {@link relaxToEquilibrium}.
 *   - **Non-committal / pure-scoring.** The kernel never mutates its inputs.
 *     Callers decide whether to act on the metrics; the physics supplies a
 *     signal, human/Guardian oversight keeps the veto.
 *   - **Additive.** Quantities mirror the proto 1:1 (`U`, `T`, `S`, `F`, `Z`,
 *     Boltzmann weights) so existing thermo analysis transfers unchanged.
 *
 * Mapping conventions (proto → kernel):
 *   - `ConsensusState.state_vector` → {@link ThermoMicrostate.stateVector}
 *   - `ConsensusState.energy`       → {@link ThermoMicrostate.energy}
 *   - `ThermodynamicEnsemble.compute_temperature()` — equipartition
 *     `T = (2/3)·σ²` over the configuration (state-vector) variance.
 *   - `compute_entropy()` — Shannon entropy (bits) over the distribution of
 *     quantized microstates.
 *   - `compute_free_energy()` — `F = U − T·S`.
 */

/**
 * One microstate in a thermodynamic ensemble. For the proteome each node is
 * a microstate: `energy` is the per-node conserved-budget energy and
 * `stateVector` is the node's configuration vector.
 */
export interface ThermoMicrostate {
  /** Internal energy contribution (proto: PoW expenditure). */
  readonly energy: number;
  /**
   * Configuration vector in state space. Optional — when omitted, the energy
   * scalar is used as a 1-D configuration so temperature/entropy still have a
   * well-defined (if coarse) meaning.
   */
  readonly stateVector?: readonly number[] | Float32Array;
}

/**
 * Full thermodynamic snapshot of an ensemble. Field names mirror the proto's
 * {@link https://github.com/Kuonirad/thermo-truth-proto `state.py`}.
 */
export interface ThermoMetrics {
  /** Number of microstates in the ensemble. */
  readonly count: number;
  /** Internal energy `U = Σ E_i`. */
  readonly internalEnergy: number;
  /** Configuration-space variance `σ²` (consensus error). */
  readonly variance: number;
  /** Temperature `T = (2/3)·σ² / kEff` (equipartition). */
  readonly temperature: number;
  /** Shannon entropy `S` (bits) over the quantized microstate distribution. */
  readonly entropy: number;
  /** Maximum attainable entropy `log2(N)` for `N` microstates (`0` for `N<2`). */
  readonly maxEntropy: number;
  /**
   * Negentropy `J = maxEntropy − S ≥ 0` — the order / "flourishing" signal.
   * High negentropy = highly ordered, low-surprise ensemble.
   */
  readonly negentropy: number;
  /** Helmholtz free energy `F = U − T·S·kEff` (minimized at equilibrium). */
  readonly freeEnergy: number;
  /** Partition function `Z = Σ exp(−β·E_i)`. */
  readonly partitionFunction: number;
  /** Inverse temperature `β` used for {@link partitionFunction}. */
  readonly beta: number;
}

export interface ThermoOptions {
  /**
   * Decimal places used to quantize state vectors before binning them for the
   * Shannon-entropy estimate. Higher = finer buckets = higher entropy. The
   * proto hashes full states (effectively infinite precision); a finite grid
   * keeps the entropy meaningful for continuous proteome states. Default `6`.
   */
  readonly precision?: number;
  /**
   * Inverse temperature for the partition function. Defaults to the proto's
   * `beta = 1.0`. Pass `'intrinsic'` to derive `β = 1/(T + ε)` from the
   * ensemble's own temperature.
   */
  readonly beta?: number | 'intrinsic';
  /** Effective Boltzmann constant `kEff` (dimensionless). Default `1`. */
  readonly kEff?: number;
}

const EPS = 1e-10;
const DEFAULT_PRECISION = 6;

function asVector(m: ThermoMicrostate): readonly number[] {
  if (m.stateVector === undefined) return [m.energy];
  return m.stateVector instanceof Float32Array ? Array.from(m.stateVector) : m.stateVector;
}

function meanVector(states: readonly (readonly number[])[]): number[] {
  if (states.length === 0) return [];
  const dim = states[0].length;
  const mean = new Array<number>(dim).fill(0);
  for (const s of states) for (let d = 0; d < dim; d += 1) mean[d] += s[d] ?? 0;
  for (let d = 0; d < dim; d += 1) mean[d] /= states.length;
  return mean;
}

/**
 * Configuration-space variance `σ²` — the mean squared deviation of each
 * microstate's vector from the ensemble mean. Maps directly to the proto's
 * `ThermodynamicEnsemble.compute_variance()`.
 */
export function computeVariance(microstates: readonly ThermoMicrostate[]): number {
  if (microstates.length < 2) return 0;
  const vectors = microstates.map(asVector);
  const mean = meanVector(vectors);
  let acc = 0;
  for (const v of vectors) {
    let sq = 0;
    for (let d = 0; d < v.length; d += 1) {
      const delta = (v[d] ?? 0) - (mean[d] ?? 0);
      sq += delta * delta;
    }
    acc += sq; // ||v − mean||²
  }
  return acc / microstates.length;
}

/** Equipartition temperature `T = (2/3)·σ² / kEff`. */
export function computeTemperature(
  microstates: readonly ThermoMicrostate[],
  kEff = 1,
): number {
  const variance = computeVariance(microstates);
  return ((2 / 3) * variance) / (kEff || 1);
}

/**
 * Shannon entropy (bits) over the distribution of quantized microstates,
 * `H = −Σ p_i·log2(p_i)`. Continuous state vectors are snapped to a decimal
 * grid (see {@link ThermoOptions.precision}) before binning.
 */
export function computeEntropy(
  microstates: readonly ThermoMicrostate[],
  precision = DEFAULT_PRECISION,
): number {
  if (microstates.length < 2) return 0;
  const factor = 10 ** precision;
  const counts = new Map<string, number>();
  for (const m of microstates) {
    const key = asVector(m)
      .map((x) => Math.round(x * factor) / factor)
      .join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const n = microstates.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p + EPS);
  }
  return h;
}

/** Internal energy `U = Σ E_i`. */
export function computeInternalEnergy(microstates: readonly ThermoMicrostate[]): number {
  let u = 0;
  for (const m of microstates) u += m.energy;
  return u;
}

/** Partition function `Z = Σ exp(−β·E_i)`; empty ensemble → `1` (proto parity). */
export function computePartitionFunction(
  microstates: readonly ThermoMicrostate[],
  beta = 1,
): number {
  if (microstates.length === 0) return 1;
  let z = 0;
  for (const m of microstates) z += Math.exp(-beta * m.energy);
  return z;
}

/**
 * Boltzmann weights `w_i = exp(−β·E_i) / Z`. Lower-energy microstates carry
 * more weight — the basis for energy-favoring consensus and the deterministic
 * relaxation in {@link relaxToEquilibrium}.
 */
export function computeBoltzmannWeights(
  microstates: readonly ThermoMicrostate[],
  beta = 1,
): number[] {
  if (microstates.length === 0) return [];
  const z = computePartitionFunction(microstates, beta);
  return microstates.map((m) => Math.exp(-beta * m.energy) / z);
}

/**
 * Compute the full thermodynamic snapshot of an ensemble. This is the kernel's
 * primary scoring entry point — the `computeFreeEnergy(contextTensor,
 * synthesisTensor, ensemble)` surface from the integration plan, generalized to
 * an arbitrary microstate ensemble.
 */
export function computeFreeEnergy(
  microstates: readonly ThermoMicrostate[],
  options: ThermoOptions = {},
): ThermoMetrics {
  const kEff = options.kEff ?? 1;
  const precision = options.precision ?? DEFAULT_PRECISION;
  const count = microstates.length;
  const internalEnergy = computeInternalEnergy(microstates);
  const variance = computeVariance(microstates);
  const temperature = ((2 / 3) * variance) / (kEff || 1);
  const entropy = computeEntropy(microstates, precision);
  const maxEntropy = count >= 2 ? Math.log2(count) : 0;
  const negentropy = Math.max(0, maxEntropy - entropy);
  const freeEnergy = internalEnergy - temperature * entropy * kEff;
  const beta =
    options.beta === 'intrinsic' ? 1 / (temperature + EPS) : (options.beta ?? 1);
  const partitionFunction = computePartitionFunction(microstates, beta);
  return Object.freeze({
    count,
    internalEnergy,
    variance,
    temperature,
    entropy,
    maxEntropy,
    negentropy,
    freeEnergy,
    partitionFunction,
    beta,
  });
}

/* ------------------------------------------------------------------ */
/* Annealing schedule                                                  */
/* ------------------------------------------------------------------ */

export interface AnnealingScheduleOptions {
  /** Initial (hot) temperature. Default `10`. */
  readonly tInitial?: number;
  /** Final (cold) temperature floor. Default `0.01`. */
  readonly tFinal?: number;
  /** Number of steps in the schedule. Default `100`. */
  readonly steps?: number;
  /** Schedule shape. Default `'exponential'`. */
  readonly type?: 'exponential' | 'linear' | 'logarithmic';
  /** Cooling rate for the exponential schedule. Default `0.95`. */
  readonly alpha?: number;
}

/**
 * Build a deterministic temperature ladder, mirroring the proto's
 * `AnnealingSchedule`. Returns an explicit `number[]` so the relaxation is
 * fully reproducible and serializable.
 */
export function makeAnnealingSchedule(options: AnnealingScheduleOptions = {}): number[] {
  const tInitial = options.tInitial ?? 10;
  const tFinal = options.tFinal ?? 0.01;
  const steps = Math.max(1, Math.floor(options.steps ?? 100));
  const type = options.type ?? 'exponential';
  const alpha = options.alpha ?? 0.95;
  const out: number[] = [];
  for (let k = 0; k < steps; k += 1) {
    let t: number;
    if (type === 'exponential') {
      t = tInitial * alpha ** k;
    } else if (type === 'linear') {
      t = tInitial - (k * (tInitial - tFinal)) / steps;
    } else {
      t = tInitial / Math.log(k + 2);
    }
    out.push(Math.max(t, tFinal));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Deterministic relaxation                                            */
/* ------------------------------------------------------------------ */

export interface RelaxationOptions extends ThermoOptions {
  /**
   * Fraction each microstate moves toward the Boltzmann-weighted (low-energy)
   * consensus on an accepted step, `∈ (0, 1]`. Default `0.5`.
   */
  readonly contraction?: number;
  /**
   * Tolerance when deciding whether a candidate step is "downhill". A
   * candidate is accepted iff `F_candidate ≤ F_current + tolerance`. Default
   * `1e-9`.
   */
  readonly tolerance?: number;
}

export interface RelaxationStep {
  /** Step index (0 = initial ensemble before any move). */
  readonly step: number;
  /** Scheduled temperature for this step (`0` for the initial entry). */
  readonly temperature: number;
  /** Free energy of the accepted ensemble after this step. */
  readonly freeEnergy: number;
  /** Whether the candidate move was accepted (false = rejected as uphill). */
  readonly accepted: boolean;
}

export interface RelaxationResult {
  /** The relaxed ensemble (a fresh copy — inputs are never mutated). */
  readonly final: ThermoMicrostate[];
  /** Full thermodynamic snapshot of {@link final}. */
  readonly finalMetrics: ThermoMetrics;
  /** Free-energy trajectory; guaranteed non-increasing in `freeEnergy`. */
  readonly trajectory: readonly RelaxationStep[];
  /** Always `true` by construction — uphill moves are rejected. */
  readonly monotonic: boolean;
}

function cloneState(m: ThermoMicrostate): { energy: number; stateVector: number[] } {
  return { energy: m.energy, stateVector: asVector(m).slice() };
}

/**
 * Deterministically relax an ensemble toward equilibrium by greedy free-energy
 * descent. On each scheduled temperature the ensemble is contracted toward its
 * Boltzmann-weighted (low-energy) consensus; the move is committed only if it
 * does not raise `F`. Uphill moves are rejected, so the returned trajectory is
 * **monotonically non-increasing** in free energy — the deterministic analogue
 * of the proto's stochastic `ThermodynamicAnnealer.converge`.
 *
 * The input ensemble is never mutated; {@link RelaxationResult.final} is a copy.
 */
export function relaxToEquilibrium(
  microstates: readonly ThermoMicrostate[],
  schedule: readonly number[],
  options: RelaxationOptions = {},
): RelaxationResult {
  const contraction = Math.min(1, Math.max(0, options.contraction ?? 0.5));
  const tolerance = options.tolerance ?? 1e-9;
  const metricOpts: ThermoOptions = {
    precision: options.precision,
    beta: options.beta,
    kEff: options.kEff,
  };

  let current = microstates.map(cloneState);
  let currentMetrics = computeFreeEnergy(current, metricOpts);
  const trajectory: RelaxationStep[] = [
    Object.freeze({
      step: 0,
      temperature: 0,
      freeEnergy: currentMetrics.freeEnergy,
      accepted: true,
    }),
  ];

  for (let i = 0; i < schedule.length; i += 1) {
    const t = schedule[i];
    const beta = 1 / (t + EPS);
    const weights = computeBoltzmannWeights(current, beta);

    const dim = current[0]?.stateVector.length ?? 0;
    const targetState = new Array<number>(dim).fill(0);
    let targetEnergy = 0;
    for (let j = 0; j < current.length; j += 1) {
      const w = weights[j] ?? 0;
      targetEnergy += w * current[j].energy;
      for (let d = 0; d < dim; d += 1) targetState[d] += w * current[j].stateVector[d];
    }

    const candidate = current.map((m) => ({
      energy: m.energy + contraction * (targetEnergy - m.energy),
      stateVector: m.stateVector.map((x, d) => x + contraction * (targetState[d] - x)),
    }));
    const candidateMetrics = computeFreeEnergy(candidate, metricOpts);

    const accepted = candidateMetrics.freeEnergy <= currentMetrics.freeEnergy + tolerance;
    if (accepted) {
      current = candidate;
      currentMetrics = candidateMetrics;
    }
    trajectory.push(
      Object.freeze({
        step: i + 1,
        temperature: t,
        freeEnergy: currentMetrics.freeEnergy,
        accepted,
      }),
    );
  }

  return Object.freeze({
    final: current,
    finalMetrics: currentMetrics,
    trajectory: Object.freeze(trajectory),
    monotonic: true,
  });
}
