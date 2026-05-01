# `.jules/` — Project Heuristics & Guardrails

This directory contains maintainer-curated **heuristic notes** ("jules") —
short, durable lessons learned from past incidents, optimizations, or
architectural decisions. Think of them as a living FAQ for "why does X behave
that way?" and "don't repeat mistake Y."

## Structure

```
.jules/
├── bolt.md     — Performance / optimisation heuristics
├── palette.md  — (reserved — UI / design-system heuristics)
└── sentinel.md — Security / operational guardrails
```

## Format

Each `.md` file uses a consistent template:

```markdown
## YYYY-MM-DD - [Short Title]
**Learning:** One-sentence insight.
**Action:** Concrete prescription for future work.
```

## Usage

- **Before** opening a PR that touches performance-sensitive code, read `bolt.md`
- **Before** adding a new dependency or CI step, read `sentinel.md`
- **After** resolving a novel incident, append a new entry to the relevant file

## Relationship to ADRs

`docs/adr/` records **architectural** decisions (why we chose Next.js 16).
`.jules/` records **operational** lessons (why `Array.prototype.reduce` is
slow in V8). Both are required reading for new maintainers; ADRs are
ceremonial, jules are tactical.

## Security note

These files are committed to the repo and must not contain credentials,
internal hostnames, or private data. If a heuristic requires a concrete
example that leaks infrastructure details, generalise the example or move it
to a private runbook.
