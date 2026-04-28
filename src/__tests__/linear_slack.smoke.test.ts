/**
 * Linear + Slack MCP orchestrator smoke spec.
 *
 * Gated by `LINEAR_SLACK_SMOKE=1` so it only runs when explicitly asked.
 * Drives the same three-event fixture as the runnable example and prints
 * the resulting Merkle roots + routing actions, which are quoted in the
 * case-study doc.
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import {
  LinearSlackOrchestratorAdapter,
  mockLinearClient,
  mockSlackClient,
} from '../adapters';

const FIXTURE = [
  {
    label: 'fresh-incident',
    prompt:
      'Postgres replication lag spiked to 47s on cluster-prod-east-1; reads on shard-3 stale.',
  },
  {
    label: 'duplicate-incident',
    prompt:
      'Postgres replication lag spiked to 47s on cluster-prod-east-1; reads on shard-3 stale.',
  },
  {
    label: 'novel-feature-request',
    prompt:
      'Customer requesting RFC-9421 HTTP message signatures support across the public REST surface.',
  },
];

const enabled = process.env.LINEAR_SLACK_SMOKE === '1';
(enabled ? describe : describe.skip)('linear-slack smoke', () => {
  it('routes the canonical fixture and prints the audit chain', async () => {
    const adapter = new LinearSlackOrchestratorAdapter({
      encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
      stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
      etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
      linear: mockLinearClient({ teamKeyPrefix: 'MCOP' }),
      slack: mockSlackClient(),
      defaultLinearTeamKey: 'MCOP',
      defaultSlackChannel: '#mcop-oncall',
    });

    const audit: Array<Record<string, unknown>> = [];
    for (const event of FIXTURE) {
      const response = await adapter.dispatchOptimizedAlert(event.prompt);
      audit.push({
        event: event.label,
        action: response.result.action,
        merkleRoot: response.merkleRoot,
        slackTs: response.result.slack?.ts ?? null,
        linearIdentifier: response.result.linear?.identifier ?? null,
        commentId: response.result.comment?.id ?? null,
        signals: response.result.signals,
      });
    }
    console.log(JSON.stringify({ audit }, null, 2));
    expect(audit).toHaveLength(FIXTURE.length);
  });
});
