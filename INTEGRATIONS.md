# MCOP External Integrations Tracker

Each row below is a **complete, documented, working** integration that
satisfies the rubric:

> Uses the `IMCOPAdapter` contract (or extends it cleanly), produces a
> `ProvenanceMetadata` bundle with Merkle root, ships a runnable example
> + 1-paragraph human-authored case study under `examples/` and
> `docs/integrations/`, and is merged to `main`.

The table is the canonical view of progress against the **3+ external
integrations** success metric.

| # | Name              | Type              | Status      | Adapter / Example                                                                                                        | Case Study                                                                                                  | Merkle Root Example |
|---|-------------------|-------------------|-------------|--------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|---------------------|
| 1 | **xAI / Grok**    | LLM Adapter       | Live        | [`src/adapters/grokAdapter.ts`](src/adapters/grokAdapter.ts) · [`examples/grok_orchestrated_completion.ts`](examples/grok_orchestrated_completion.ts) | [`docs/integrations/grok.md`](docs/integrations/grok.md)                                                    | `3f897771…bf7a50`   |
| 2 | **Devin Sub-Agents** | Orchestration Case Study | Planned | _PR C — `examples/devin_sub_agent_orchestration/`_                                                                       | _`docs/integrations/devin_sub_agents.md` (planned)_                                                         | _captured per run_  |
| 3 | **Linear + Slack via MCP** | Orchestration Case Study | Planned | _PR D — `examples/linear_slack_mcp_orchestrator.ts`_                                                                    | _`docs/integrations/linear_slack_mcp.md` (planned)_                                                         | _captured per run_  |
| 4 | **OpenAI-compatible (fallback)** | LLM Adapter (bonus) | Backup       | _PR D backup branch — `src/adapters/openaiAdapter.ts`_                                                                  | _`docs/integrations/openai.md` (planned)_                                                                   | _captured per run_  |

**Status legend:** `Planned` → `In Progress` → `Merged` → `Live`. An
integration is only considered to count toward the success metric once
its row reads **Merged** *and* the linked example runs end-to-end with a
real (non-stub) Merkle root captured in the case-study doc.

## Success metric checklist

- [ ] At least 3 rows at status **Merged** with linked PRs.
- [ ] Each merged row has a real Merkle-rooted Provenance bundle quoted
      in its case-study doc.
- [ ] README "Integrations" table mirrors this file (no drift).
- [ ] Public announcement (blog post / GitHub Discussion).
- [ ] **Bonus:** a 4th integration pushes the framework into "exemplar"
      territory.

## Adding a new integration

1. Create `src/adapters/<name>Adapter.ts` (or its Python sibling under
   `mcop_package/mcop/adapters/`) extending the appropriate base
   adapter. Export from the adapter package barrel.
2. Add a runnable example under `examples/` that exercises the full
   pipeline against either a real client or a deterministic stub.
3. Author a 1-paragraph case study under `docs/integrations/<name>.md`
   covering: problem statement, MCOP role, observed metrics (tokens
   saved / iterations reduced / audit-trail size), and at least one
   real Merkle root captured from a successful run.
4. Append a row to the table above, link the README "Integrations"
   table, and open a PR. Once merged on green CI, flip status to
   **Merged**.
