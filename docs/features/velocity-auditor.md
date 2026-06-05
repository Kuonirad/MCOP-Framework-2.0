# Velocity Auditor

The **Velocity Auditor** (`src/audit/velocityAuditor.ts`) is a deterministic,
primitive-backed MCOP kernel that measures the **AI velocity multiplier** of an
audited cycle — *how many times faster* the AI-human collaboration was than the
human-only baseline — using the same primitives the framework uses to reason.

It is the sibling of the [Auditor Kernel](../../src/audit/auditorKernel.ts)
(which estimates *verified value*) and the
[Impact Auditor](../../src/audit/impactAuditor.ts) (which scores *positive
impact*). All three replace hand-written narrative numbers with values produced
by the kernels themselves.

## What it computes

For each landed work item, the auditor routes the item through
`NovaNeoEncoder → HolographicEtch → PositiveResonanceAmplifier` (identical to the
sibling auditors) to derive a kernel resonance, then aggregates:

| Field | Definition |
|:---|:---|
| `aiMultiplier` | `humanBaselineHours / observedHours` — pinned to `1` when not AI-assisted, or when either figure is degenerate. A value above 1 means the AI-human cycle was faster. |
| `hoursSaved` | `max(0, humanBaselineHours − observedHours)`. |
| `positiveImpactScore` | Kernel-derived mean resonance over landed work, ∈ [0, 1]. |
| `eudaimonicDelta` | `positiveImpactScore × aiMultiplier`. |
| `freeEnergyDivergence` | `Δ(T_d, B_e) ∈ [0, 1]` from the `DriftSentinelKernel` (ThermoTruth gate). |
| `runId` | An RFC-9562 (version 8, "custom") UUID **derived deterministically** from `merkleRoot`, so a replayed audit reproduces the same id byte-for-byte. |
| `merkleRoot` | Canonical SHA-256 (RFC 8785 JCS) over the report's value-bearing payload. |

### Supplied vs. computed

- **Supplied (declared estimate):** `humanBaselineHours` — the conservative
  human-only cost an expert engineer already familiar with the codebase would
  take, excluding AI co-author loops. This is the only inherently-estimated
  magnitude, and it is never invented by the kernel.
- **Supplied (measured):** `observedHours` — the AI-assisted wall-clock cost.
- **Supplied (factual):** `merged`, `guardianVerdict`, `aiAssisted`,
  `commitHash`, and an optional ThermoTruth `thermoFreeEnergyDelta` (recorded as
  evidence only — never folded into the velocity math).
- **Computed by the kernels:** resonance, multiplier, hours saved, eudaimonic
  delta, free-energy divergence, and every Merkle root.

## ThermoTruth constraint

Before a report is emitted, the session's declared intent `T_d` and a
resonance-weighted behavioural blend `B_e` are run through the Drift Sentinel.
The free-energy divergence therefore tracks **inversely** with resonance: a
high-resonance cycle behaves close to what it declared (low Δ, `nominal`), while
a low-resonance cycle drifts away. A `critical` divergence classifies the cycle
as **not productive** (`auditVelocity` returns `null`) — the loop refuses to
attest a velocity it cannot thermodynamically reconcile.

## Productivity classifier

`auditVelocity` returns a report only when **all** of the following hold,
otherwise `null`:

1. the work `merged`,
2. the `guardianVerdict` is `PASS`,
3. there is at least one landed work item,
4. the kernel-derived resonance clears `resonanceFloor` (default `0.55`),
5. the free-energy divergence is below `driftRejectFloor` (default `critical`).

## Determinism

Timestamps are the only non-deterministic surface and never feed a hash or a
metric. Two runs over the same inputs produce a byte-identical report —
including `runId`, which is a pure function of `merkleRoot`. This is proven in
`src/__tests__/velocityAuditor.test.ts`.

## Self-audit closure

`scripts/velocity-auditor-etch.mjs` runs the Velocity Auditor over a real cycle
and then runs the **Impact Auditor over the Velocity Auditor's own verification
gates** (typecheck / lint / test / dependency hygiene). The self-audit is etched
as a *child* ledger entry whose payload carries the velocity report's Merkle
root — a full, bounded Merkle chain from session → velocity proof → self-audit.

```bash
pnpm audit:velocity --dry-run   # compute + print, no writes
pnpm audit:velocity             # compute + append to the audit ledgers
```

> The live etch records `merged: true`, so it should be run **after** a cycle
> lands. Pre-merge, use `--dry-run`.

## Honest scoping

The Velocity Auditor measures velocity with the framework's own primitives; it
does **not** independently verify the supplied human baseline (an estimate by
construction) or the observed wall-clock cost. Those are declared inputs, and
the report labels them as such. What the kernel guarantees is that every
*derived* figure — resonance, multiplier, divergence, and the Merkle roots that
seal them — is reproducibly computed, not hand-written.
