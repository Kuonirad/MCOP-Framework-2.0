// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Temporal pheromone dynamics for Stigmergy (advance #3).
 *
 * Real stigmergy is *temporal*: an ant's pheromone trail evaporates unless it is
 * re-walked, so trails that stop being useful fade and trails that keep being
 * useful are reinforced. Stigmergy v5 had neither — a trace's `weight` was the
 * cosine similarity frozen at record time, and recency was only a tiebreaker.
 * A six-month-old trace and a six-second-old one of equal similarity were
 * indistinguishable. Memory accumulated; it never decayed or strengthened.
 *
 * This module adds the two missing forces, as a small, deterministic ledger
 * layered *beside* the Merkle-sealed trace chain (it never touches the trace
 * hashes, so provenance is unchanged):
 *
 *   - **Evaporation.** A deposit decays with a configurable half-life:
 *     `strength(t) = max(floor, deposit · 2^(−Δt / halfLife))`. After one
 *     half-life an un-reinforced trail is at half strength; the `floor` lets a
 *     trail persist faintly forever (set `floor = 0` for true evaporation).
 *   - **Reinforcement.** Re-traversing a trail decays it to *now*, then adds a
 *     gain (saturating at `strengthCap`), resetting its decay clock. A trail
 *     walked often stays strong; a trail walked once fades.
 *
 * Time is injected (`nowMs`), never read from a wall clock inside the model, so
 * a replayed sequence of deposits/reinforcements yields identical strengths —
 * the same falsify-first determinism the rest of MCOP enforces.
 */

export interface TemporalDynamicsConfig {
  /** Master switch. Default `false` — Stigmergy behaves exactly as v5. */
  enabled?: boolean;
  /** Evaporation half-life in milliseconds. Default `60_000` (1 min). */
  halfLifeMs?: number;
  /** Pheromone added per reinforcement. Default `0.25`. */
  reinforcementGain?: number;
  /** Upper bound a deposit saturates at. Default `1`. */
  strengthCap?: number;
  /** Minimum strength a deposited trail decays toward. Default `0`. */
  floor?: number;
  /**
   * When true (default), a trace selected by `getResonance` is reinforced —
   * resonance counts as re-traversal. Disable to reinforce only explicitly.
   */
  reinforceOnResonance?: boolean;
}

export const DEFAULT_TEMPORAL_DYNAMICS: Required<TemporalDynamicsConfig> = Object.freeze({
  enabled: false,
  halfLifeMs: 60_000,
  reinforcementGain: 0.25,
  strengthCap: 1,
  floor: 0,
  reinforceOnResonance: true,
});

/**
 * Exponential evaporation. `elapsedMs < 0` is treated as 0 (clock skew guard).
 */
export function decayedStrength(
  deposit: number,
  elapsedMs: number,
  halfLifeMs: number,
  floor = 0,
): number {
  if (!Number.isFinite(deposit)) return floor;
  const dt = elapsedMs > 0 && Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const hl = halfLifeMs > 0 && Number.isFinite(halfLifeMs) ? halfLifeMs : DEFAULT_TEMPORAL_DYNAMICS.halfLifeMs;
  const decayed = deposit * Math.pow(2, -dt / hl);
  return Math.max(floor, decayed);
}

interface PheromoneState {
  deposit: number;
  lastUpdatedMs: number;
  reinforcements: number;
}

export interface PheromoneStats {
  tracked: number;
  totalStrength: number;
  meanStrength: number;
  maxStrength: number;
  totalReinforcements: number;
}

/**
 * Tracks per-trace pheromone level with deterministic decay + reinforcement.
 * Keyed by trace id; the clock is always supplied by the caller.
 */
export class PheromoneLedger {
  private readonly states = new Map<string, PheromoneState>();
  private readonly halfLifeMs: number;
  private readonly gain: number;
  private readonly cap: number;
  private readonly floor: number;

  constructor(config: TemporalDynamicsConfig = {}) {
    this.halfLifeMs = config.halfLifeMs ?? DEFAULT_TEMPORAL_DYNAMICS.halfLifeMs;
    this.gain = config.reinforcementGain ?? DEFAULT_TEMPORAL_DYNAMICS.reinforcementGain;
    this.cap = config.strengthCap ?? DEFAULT_TEMPORAL_DYNAMICS.strengthCap;
    this.floor = config.floor ?? DEFAULT_TEMPORAL_DYNAMICS.floor;
  }

  /** Lays down the initial pheromone for a trace. */
  deposit(id: string, baseWeight: number, nowMs: number): void {
    const clamped = clampRange(baseWeight, this.floor, this.cap);
    this.states.set(id, { deposit: clamped, lastUpdatedMs: nowMs, reinforcements: 0 });
  }

  /**
   * Reinforces a trace: decay-to-now, then add the gain (saturating at the cap)
   * and reset the decay clock. No-op for unknown ids.
   */
  reinforce(id: string, nowMs: number, gain: number = this.gain): number {
    const state = this.states.get(id);
    if (!state) return 0;
    const current = decayedStrength(state.deposit, nowMs - state.lastUpdatedMs, this.halfLifeMs, this.floor);
    const next = clampRange(current + gain, this.floor, this.cap);
    state.deposit = next;
    state.lastUpdatedMs = nowMs;
    state.reinforcements += 1;
    return next;
  }

  /** Current decayed strength of a trace (read-only). Unknown ids → floor. */
  strength(id: string, nowMs: number): number {
    const state = this.states.get(id);
    if (!state) return this.floor;
    return decayedStrength(state.deposit, nowMs - state.lastUpdatedMs, this.halfLifeMs, this.floor);
  }

  has(id: string): boolean {
    return this.states.has(id);
  }

  /** Forgets a trace's pheromone (e.g. when evicted from the trace buffer). */
  forget(id: string): void {
    this.states.delete(id);
  }

  /**
   * Drops every trace whose decayed strength has fallen to or below `minStrength`
   * at `nowMs`. Returns the ids pruned. With `floor > 0` nothing prunes unless
   * `minStrength >= floor`.
   */
  prune(nowMs: number, minStrength: number): string[] {
    const pruned: string[] = [];
    for (const [id, state] of this.states) {
      const s = decayedStrength(state.deposit, nowMs - state.lastUpdatedMs, this.halfLifeMs, this.floor);
      if (s <= minStrength) {
        this.states.delete(id);
        pruned.push(id);
      }
    }
    return pruned;
  }

  get size(): number {
    return this.states.size;
  }

  /** Aggregate strengths at `nowMs`, for dashboards/telemetry. */
  stats(nowMs: number): PheromoneStats {
    let total = 0;
    let max = 0;
    let reinforcements = 0;
    for (const state of this.states.values()) {
      const s = decayedStrength(state.deposit, nowMs - state.lastUpdatedMs, this.halfLifeMs, this.floor);
      total += s;
      if (s > max) max = s;
      reinforcements += state.reinforcements;
    }
    const tracked = this.states.size;
    return {
      tracked,
      totalStrength: total,
      meanStrength: tracked === 0 ? 0 : total / tracked,
      maxStrength: max,
      totalReinforcements: reinforcements,
    };
  }
}

function clampRange(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}
