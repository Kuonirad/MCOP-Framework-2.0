# Linear + Slack via MCP — Integration #3

> Status: **Live** · Adapter:
> [`src/adapters/linearSlackOrchestratorAdapter.ts`](../../src/adapters/linearSlackOrchestratorAdapter.ts)
> · Router: `chooseLinearSlackAction` · Example:
> [`examples/linear_slack_mcp_orchestrator.ts`](../../examples/linear_slack_mcp_orchestrator.ts)
> · Tracker row: `INTEGRATIONS.md#3`.
>
> Reference run (mock clients, three-event fixture from the example,
> captured by `src/__tests__/linear_slack.smoke.test.ts` with
> `LINEAR_SLACK_SMOKE=1`):
>
> ```text
> fresh-incident         action=both       merkle=9325b794…1fb29cacd linear=MCOP-1 slack=✓
> duplicate-incident     action=slack-only merkle=9325b794…1fb29cacd linear=—       slack=✓
> novel-feature-request  action=both       merkle=95c76550…200f8ffa8 linear=MCOP-2 slack=✓
> ```
>
> The duplicate-incident leg keys onto the fresh-incident's pheromone
> trace (resonance = 1.0), so the router downgrades dispatch to a
> Slack-only thread reply — no Linear noise. The novel feature request
> gets its own Merkle root and fans out to both surfaces. Every Linear
> issue carries an automatic audit-anchor comment containing the Merkle
> root + entropy + resonance.

On-call automation has the same problem creative pipelines have: dispatch is loud and provenance is silent. A pager bot fires a Slack message; an SRE files a Linear ticket; six retries later nobody can reconstruct *which* signal triggered the page or *who* approved the rollback. The Linear + Slack MCP orchestrator ports MCOP's deterministic triad onto that workflow. Each inbound prompt — incident report, automation trigger, customer escalation — is encoded by `NovaNeoEncoder`, scored against prior pheromone traces by `StigmergyV5`, refined through the dialectical synthesizer (with the operator's optional veto / rewrite / notes), and then routed by the pure `chooseLinearSlackAction(entropy, resonance)` function: high resonance becomes a Slack-only status ping, novel high-entropy events become a Linear triage ticket, the in-between cases fan out to both, and operator vetoes drop straight through with no calls but full provenance still recorded. Every Linear issue the orchestrator files gets an automatic audit-anchor comment containing the Merkle root, entropy, and resonance score, so the on-call timeline is replayable from the issue's own metadata — no separate observability stack required. The adapter is wire-compatible with the `linear` and `slack-remote` MCP servers but accepts any `LinearClient` / `SlackClient` interface, so the same surface drops onto Jira, PagerDuty, Discord, or whatever else replaces them in 2027.
