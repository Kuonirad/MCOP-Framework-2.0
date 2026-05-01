# `.agents/` — AI Agent Configuration

This directory holds framework-specific configuration for external AI coding
agents that work on the MCOP codebase. It is **not** part of the runtime
application — these files are consumed by agent orchestration tools (e.g.
Devin, Cognition, or custom MCP sub-agents) during development and review.

## Structure

```
.agents/
└── skills/
    └── testing-frontend/
        └── SKILL.md   — Frontend testing playbook for agent environments
```

## Usage

When spawning an agent session against this repo, point the agent at the
relevant `SKILL.md` under `.agents/skills/<topic>/`. Each skill defines:

- Canonical commands (`pnpm test`, `pnpm lint`, etc.)
- Known environmental constraints (e.g. Turbopack hydration block on Devin VMs)
- Acceptance criteria for the task at hand

## Adding a new skill

1. Create `.agents/skills/<topic>/SKILL.md`
2. Follow the format of `testing-frontend/SKILL.md`
3. Reference the new skill in `CONTRIBUTING.md` under "Agent-assisted tasks"

## Security note

Never place API keys, tokens, or credentials in this directory. All agent
configs should be deterministic, public, and safe to commit.
