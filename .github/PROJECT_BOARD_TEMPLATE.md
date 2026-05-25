# Trust Substrate Roadmap Project Board

Use this seed for the public GitHub Projects board named
`Trust Substrate Roadmap`. The board tracks `docs/TRUST_SUBSTRATE_ROADMAP.md`
gates and keeps positive-impact evidence visible beside engineering work.

## Status columns

| Column | Purpose |
| --- | --- |
| Positive Impact | Adoption wins, impact stories, falsified claims that improve honesty, and proof that a gate creates real user value. |
| Intake | New issues, discussion follow-ups, and unsized roadmap ideas. |
| Track A - CUDA and hardware substrate | A0-A5 work from `docs/TRUST_SUBSTRATE_ROADMAP.md`. |
| Track B - Distributed cluster mode | B0-B4 work from `docs/TRUST_SUBSTRATE_ROADMAP.md`. |
| Track C - Hosted provenance ledger | C0-C4 work from `docs/TRUST_SUBSTRATE_ROADMAP.md`. |
| Review / Merge Gate | Work that has an owner, validation evidence, and a ready PR or review artifact. |
| Done / Verified | Closed work with replayable verification linked from the item. |

## Fields

| Field | Type | Options |
| --- | --- | --- |
| Status | Single select | Positive Impact, Intake, Track A - CUDA and hardware substrate, Track B - Distributed cluster mode, Track C - Hosted provenance ledger, Review / Merge Gate, Done / Verified |
| Gate | Single select | A0 audit, A1 kernel artifacts, A2 provider unification, A3 Python server, A4 CI hardening, A5 docs and examples, B0 design, B1 primitives, B2 membership, B3 replay, B4 production, C0 design, C1 self-host, C2 hosted, C3 trust layer, C4 MCOP integration, Cross-cutting invariant |
| Evidence | Text | Link commands, traces, benchmark manifests, PRs, discussions, or docs. |
| Impact axis | Single select | Reproducible trust, Adoptable cognition, Contributor onboarding, Integration leverage, Human-AI flourishing, Negative result |

## Seed items

| Title | Status | Gate | Evidence |
| --- | --- | --- | --- |
| Capture adoption wins and impact stories | Positive Impact | Cross-cutting invariant | `.github/ISSUE_TEMPLATE/impact_story.yml` |
| Reproduce or challenge public benchmark claims | Positive Impact | Cross-cutting invariant | `.github/ISSUE_TEMPLATE/reproducibility_audit_question.yml` |
| Track integration requests against trust-substrate gates | Intake | Cross-cutting invariant | `.github/ISSUE_TEMPLATE/integration_request.yml` |
| A0 audit: current smoke benchmark and verified-device canary | Track A - CUDA and hardware substrate | A0 audit | `docs/TRUST_SUBSTRATE_ROADMAP.md` |
| A1 kernel artifacts: deterministic ONNX export pipeline | Track A - CUDA and hardware substrate | A1 kernel artifacts | `docs/TRUST_SUBSTRATE_ROADMAP.md` |
| B0 design: packet schemas, root merge, trust scopes, veto semantics | Track B - Distributed cluster mode | B0 design | `docs/TRUST_SUBSTRATE_ROADMAP.md` |
| B1 primitives: cluster stigmergy and pub/sub adapter | Track B - Distributed cluster mode | B1 primitives | `docs/TRUST_SUBSTRATE_ROADMAP.md` |
| C0 design: REST/gRPC schemas and tenant-scoped Merkle forests | Track C - Hosted provenance ledger | C0 design | `docs/TRUST_SUBSTRATE_ROADMAP.md` |
| C1 self-host: ledger service, storage backend, Docker Compose, Helm | Track C - Hosted provenance ledger | C1 self-host | `docs/TRUST_SUBSTRATE_ROADMAP.md` |
