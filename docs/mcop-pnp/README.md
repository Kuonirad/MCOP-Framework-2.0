# MCOP-PNP / Lower-Bound Forge v0

Research-control substrate for P vs NP.

This is not a proof of `P ≠ NP`. The Clay problem remains open.

## Software mission

Maintain an auditable, barrier-aware, independently replayable research state whose only legal terminal object is Cook's theorem from accepted axioms in the Clay uniform deterministic Turing-machine model.

The mathematical target is `SAT ∉ P`. The software mission is to make false escalation structurally difficult.

## Why this exists

MCOP can make search systematic, reproducible, adversarial, and formally auditable. It does not by itself establish a superpolynomial lower bound. A kernel-checked Lean or Coq artifact can be internally correct while proving a conditional or surrogate statement rather than the Clay target.

## Canonical target

- Clay statement: is `P = NP`?
- Primary target: `SAT ∉ P` in the uniform deterministic polynomial-time TM model
- Equivalence: `SAT ∈ P` if and only if `P = NP` (Cook–Levin)
- Not interchangeable without a checked model correspondence: `NP ⊄ P/poly`, circuit-family lower bounds, `VP ≠ VNP`

## Seven-state contract

| State | Meaning | Escalation |
| --- | --- | --- |
| `PROOF` | Terminal theorem in the Clay model, axiom-accounted, independently replayed | Only after lemma closure, model correspondence, barrier certificates, and replay |
| `LEMMA` | Named claim with exact assumptions and dependency hashes | May feed a route; never the Clay statement |
| `COUNTEREXAMPLE` | Explicit object killing a lemma or reduction | Freezes the parent route |
| `BARRIER` | Named theorem showing the technique cannot reach the target | Continue only with an evasion certificate |
| `DEAD_END` | Route exhausted without a surviving lemma | Archived, never deleted |
| `CONDITIONAL` | Theorem under an unproved hypothesis | Cannot be relabeled `PROOF` |
| `SURROGATE` | Kernel-checked statement that is not the Clay theorem | Automatic reject for mission claims |

No generating agent may emit `PROOF`.

## Architecture

```
CLAY STATEMENT
     │
     ▼
CANONICAL MODEL PACKET
     │
     ├─ deterministic TM
     ├─ SAT encoding
     ├─ Cook–Levin correspondence
     └─ reduction definitions
             │
             ▼
      PROOF-OBLIGATION GRAPH
             │
   ┌─────┼─────────┐
   ▼         ▼          ▼
 ROUTE     LEMMA      BARRIER
   │         │          │
   └────┬────┬─────┘
        ▼         ▼
   AXIOM AUDIT  MODEL AUDIT
        │         │
        └────┬────┘
             ▼
     FORMALIZATION
             │
             ▼
     INDEPENDENT REPLAY
             │
             ▼
        MCOP ETCH
             │
             ▼
       CLAIM STATUS
```

## Layout

- `claim-schema.json` — seven-state packets, audits, and `BarrierCertificate`
- `proof-obligation-graph.json` — machine-readable closing obligations
- `canonical-models/` — Clay TM model, SAT, Cook–Levin, reductions
- `barriers/` — relativization, natural proofs, algebrization
- `routes/` — candidate lower-bound programmes with hardness-preservation gates

## Non-negotiables

1. No untracked axioms.
2. No empirical inference promoted to theorem.
3. No complexity-model substitution without proof.
4. Every lemma has dependency provenance.
5. Every proposed route receives adversarial review.
6. Known barriers are explicitly tested before escalation.
7. A final theorem must replay independently.

## v0 scope

v0 is the obligation graph and claim schema. It does not search for a proof, does not run Lean or Coq, and does not change Clay status.
