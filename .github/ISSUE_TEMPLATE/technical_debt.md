---
name: Technical Debt / Pre-Bug
about: Record a known weakness, shortcut, or latent defect before it becomes a bug
title: "[DEBT] "
labels: technical-debt
assignees: ''
---

## Summary
A clear, one-line description of the debt or pre-bug condition.

## Category
Select the primary category (apply the matching `debt:*` label):
- [ ] `debt:documentation` — stale, missing, or misleading docs / badges / anchors
- [ ] `debt:compliance` — security posture, licensing, or policy gaps
- [ ] `debt:dead-code` — superseded modules or unreferenced code awaiting removal
- [ ] `debt:reproducibility` — gaps in reproducible-build guarantees or CI verification

## Where
Affected files, modules, or workflows (e.g. `src/kernels/`, `.github/workflows/ci.yml`).

## Why it's debt
What shortcut, assumption, or omission created this? What breaks if left unaddressed?

## Risk / impact
- Likelihood of turning into a live bug:
- Blast radius (users, CI, security, builds):

## Proposed remediation
The smallest change that resolves it, or a link to the roadmap item it maps to.

## Acceptance criteria
- [ ] Condition that proves the debt is paid down
- [ ] Test or CI check that prevents regression (if applicable)
