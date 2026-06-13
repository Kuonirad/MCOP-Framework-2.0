# Free-Energy-Governed Graph-of-Thought

> **TL;DR** — `PGoT` used to stop expanding when it hit `maxFanout`/`maxDepth`:
> administrative caps. This wires the existing `ThermoTruthKernel` into the
> decision. Treat the thought set as a thermodynamic ensemble and **expand a
> thought only when it lowers the ensemble's Helmholtz free energy `F = U − T·S`;
> halt when ΔF plateaus** — equilibrium with the evidence. Curiosity stops being
> a hand-tuned bonus and becomes *literal temperature*. **Honest caveat, enforced
> in code:** under the hash backend the temperature degenerates and `F` collapses
> to the budget `U`, so the governor measures its own signal and **falls back to
> the administrative limits when it can't discriminate**. Free-energy governance
> needs the embedding backend.

## The bridge is concrete, not gestural

`ThermoTruthKernel` already computes every quantity deterministically. The
governor just maps a thought ensemble onto it:

| Thermodynamics | Graph-of-thought meaning | Source |
| --- | --- | --- |
| `U = Σ Eᵢ` (internal energy) | per-node budget already spent (cost/compute/etch) | `computeInternalEnergy` |
| `S` (Shannon entropy, bits) | coverage / diversity of the thought set | `computeEntropy` over quantized microstates |
| `T = (2/3)σ²` (equipartition) | configuration-space spread of the thoughts | `computeTemperature` over state-vector variance |
| curiosity | an **additive offset on `T`** — exploration knob | `curiosityTemperature` |
| `F = U − T·S` | the quantity expansion descends | `ensembleFreeEnergy` |

**Expansion rule:** admit a candidate iff `ΔF = F(ensemble ∪ {c}) − F(ensemble) ≤
tolerance`. Because adding any node raises `U`, a node is admitted only when its
temperature-weighted entropy gain (its diversity contribution) offsets its
budget cost.

**Stopping rule:** halt when `|ΔF|` plateaus for `plateauWindow` consecutive
admissions, or when no remaining candidate lowers `F`. The physical reading:
*reasoning halts when the thought-ensemble reaches equilibrium with its
evidence* — more thinking no longer pays for itself.

**Curiosity = temperature.** `F = U − T·S` with `T = T_equipartition +
curiosityTemperature`. Hotter ⇒ the `−T·S` term dominates ⇒ more diverse nodes
clear the `ΔF ≤ 0` bar before equilibrium. Cold ⇒ thrift. It is the same knob
physics uses to trade exploration for exploitation, now with a unit.

## What free-energy descent actually optimizes

Minimizing `F = U − T·S` **maximizes `T·S`** subject to the budget. So the
governor does *not* chase coherence — it chases **coverage per unit budget**: it
prefers thoughts that move the ensemble into new regions (raising entropy) and
stops paying for redundant ones. This is the correct objective for *deciding how
much to think*, and it is what the falsifier measures.

## Falsifier: ΔF-governance vs fixed fanout

`src/__tests__/freeEnergyGovernor.frontier.test.ts` is a standing falsifiable
test (not just a doc claim): four semantic clusters, four paraphrases each,
arriving cluster-grouped. Fixed fanout admits the first *k*; ΔF-governance admits
by free-energy descent. Quality = distinct clusters covered; cost = nodes
admitted. Artifact: `docs/benchmarks/free-energy-frontier.json`.

| Cost (nodes admitted) | Fixed-fanout coverage | ΔF-governed coverage |
| --- | --- | --- |
| 1 | 1 / 4 | 2 / 4 |
| 2 | 1 / 4 | 3 / 4 |
| 3 | 2 / 4 | **4 / 4 (full)** |
| 5 | 2 / 4 | 4 / 4 |

ΔF-governance reaches **full coverage at cost 3**; fixed fanout is still at **2
of 4 clusters by cost 5**, drowning in redundant paraphrases of the clusters it
already has. The governor then halts (`no-improving-candidate`) rather than
spending budget on nodes that no longer lower `F`. If a change ever lets fixed
fanout match this, the test fails — which is the point of a falsifier.

## The hard dependency this module refuses to hide

The original adversarial pass caught a real coupling: **equipartition
temperature is computed from state-vector variance, and hash-backend tensors
have near-constant variance.** Distinct texts map to statistically independent
tensors (concentration of measure), so:

1. `T` cannot tell a focused thought-ensemble from a scattered one;
2. every distinct microstate is unique, so `S` saturates at `log₂(N)`;
3. therefore `F = U − T·S` reduces to budget accounting plus a constant — **`F`
   collapses to `U`**, and the free-energy rule is no better than counting nodes.

A probe over a focused-vs-scattered set measured a temperature dynamic range of
**~13%** under the hash backend versus **~42%** under an embedding backend (~3×
more discriminating). So the governor does **not assume** its signal is good:
`assessFreeEnergySignal` measures the relative dynamic range of the equipartition
temperature across the candidate set, and when it falls below `degeneracyFloor`
(default `0.15`), `governExpansion` returns `mode: 'administrative-fallback'`
with a reason string naming the collapse. `PGoT.governedExpand` then applies the
ordinary `maxFanout` limit. `maxFanout`/`maxDepth` remain **hard safety caps in
both modes**.

This is exactly the kind of coupling an audit exists to surface before a reviewer
does: the feature is shipped *with its own falsification of the case where it
doesn't work*, wired into the control flow rather than buried in a footnote.

## Trust boundary

A low free energy means the thought-ensemble is at thermodynamic equilibrium with
its evidence under this budget — **not** that its conclusions are correct. The
physics governs *how much to explore and when to stop*, not *whether the answer
is right*. Guardian/human oversight keeps the veto; the kernel only supplies a
signal.

## API

From `@/core` (`src/core`, alongside the kernel and `PGoT` — this lives in the
app core, not the published `packages/core` subset):

| Symbol | Purpose |
| --- | --- |
| `ensembleFreeEnergy(thoughts, cfg)` | `F = U − T·S` with curiosity-augmented `T`. |
| `ensembleTemperature(thoughts, cfg)` | Equipartition + curiosity temperature. |
| `assessFreeEnergySignal(seed, candidates, cfg)` | Measure temperature discrimination; the degeneracy guard. |
| `evaluateExpansion(ensemble, candidate, cfg)` | ΔF and the admit/reject verdict for one candidate. |
| `governExpansion(seed, candidates, cfg)` | Free-energy-descent driver with plateau halting + fallback. |
| `PGoT.governedExpand(parentId, candidates, cfg)` | Wire it into a reasoning graph (hard `maxFanout`/`maxDepth` caps preserved). |

## Limitations

- **Requires the embedding backend.** Under hash/`novaNeoWeb` the governor
  deliberately abstains (see above).
- `U` and `T·S` must be on comparable scales — like real thermodynamics the
  result is scale-sensitive; pick per-node `energy` to mean something (token
  cost, etch expenditure) rather than leaving it at the unit default when the
  absolute frontier position matters.
- The objective is coverage/diversity per budget, not factual correctness or
  coherence (see the trust boundary).
- Greedy free-energy descent is deterministic but not guaranteed globally
  optimal; it is the analogue of the kernel's greedy `relaxToEquilibrium`.
