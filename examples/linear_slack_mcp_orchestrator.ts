/**
 * Linear + Slack MCP Orchestrator example.
 *
 * Demonstrates Integration #3: MCOP routes inbound prompts (incident
 * reports, on-call alerts, automation triggers) to Linear and/or Slack
 * via their MCP servers, choosing between four actions based on the
 * triad's own entropy + resonance signals:
 *
 *   - 'slack-only'  → high resonance + low entropy
 *   - 'linear-only' → novel + high entropy
 *   - 'both'        → novel + medium entropy (default fan-out)
 *   - 'none'        → operator vetoed
 *
 * Each leg returns a Merkle-rooted ProvenanceMetadata bundle, and each
 * Linear issue gets an automatic audit-anchor comment containing the
 * Merkle root + entropy + resonance — so the issue is replayable from
 * its own metadata.
 *
 * Run with:
 *
 *   pnpm exec tsx examples/linear_slack_mcp_orchestrator.ts
 *
 * The mock clients keep the example reproducible offline; swap them out
 * for real linear / slack-remote MCP-backed clients in production.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  chooseLinearSlackAction,
  LinearSlackOrchestratorAdapter,
  mockLinearClient,
  mockSlackClient,
} from '../src/adapters';

interface DemoEvent {
  readonly label: string;
  readonly prompt: string;
}

const EVENTS: ReadonlyArray<DemoEvent> = [
  {
    label: 'fresh-incident',
    prompt:
      'Postgres replication lag spiked to 47s on cluster-prod-east-1 at 14:22 UTC; ' +
      'reads on shard-3 are returning stale data. Need triage now.',
  },
  {
    label: 'duplicate-incident',
    prompt:
      'Postgres replication lag spiked to 47s on cluster-prod-east-1 at 14:22 UTC; ' +
      'reads on shard-3 are returning stale data. Need triage now.',
  },
  {
    label: 'novel-feature-request',
    prompt:
      'Customer requesting RFC-9421 HTTP message signatures support across the ' +
      'public REST surface; depends on header-canonicalisation work currently in flight.',
  },
];

async function main(): Promise<void> {
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

  const adapter = new LinearSlackOrchestratorAdapter({
    encoder,
    stigmergy,
    etch,
    linear: mockLinearClient({ teamKeyPrefix: 'MCOP' }),
    slack: mockSlackClient(),
    defaultLinearTeamKey: 'MCOP',
    defaultSlackChannel: '#mcop-oncall',
  });

  const caps = await adapter.getCapabilities();
  console.log('--- LINEAR + SLACK MCP ORCHESTRATOR ---');
  console.log('Platform:           ', caps.platform);
  console.log('Default Linear team:', 'MCOP');
  console.log('Default Slack room: ', '#mcop-oncall');
  console.log('Router thresholds:  ', {
    slackOnlyResonanceFloor: 0.8,
    linearOnlyEntropyFloor: 0.4,
    noveltyResonanceCeiling: 0.4,
  });
  console.log('');

  for (const event of EVENTS) {
    console.log(`--- EVENT: ${event.label} ---`);
    const response = await adapter.dispatchOptimizedAlert(event.prompt);
    const { action, slack, linear, comment, signals } = response.result;
    console.log('Action:        ', action);
    console.log('Entropy:       ', signals.entropy.toFixed(4));
    console.log('Resonance:     ', signals.resonance.toFixed(4));
    console.log('Merkle root:   ', response.merkleRoot);
    if (slack) {
      console.log(`Slack:          posted to ${slack.channel} ts=${slack.ts}`);
    } else {
      console.log('Slack:          (not posted)');
    }
    if (linear) {
      console.log(`Linear:         ${linear.identifier} (${linear.state}) ${linear.url}`);
      if (comment) {
        console.log(`Audit anchor:   comment ${comment.id} (Merkle root + signals)`);
      }
    } else {
      console.log('Linear:         (not filed)');
    }
    console.log('');
  }

  // Surface the pure routing function so the docs can quote a
  // deterministic preview without a full triad pass.
  console.log('--- ROUTER PROBE ---');
  const probe = chooseLinearSlackAction({ entropy: 0.55, resonance: 0.1 });
  console.log(
    `chooseLinearSlackAction({ entropy: 0.55, resonance: 0.1 }) → ${probe}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
