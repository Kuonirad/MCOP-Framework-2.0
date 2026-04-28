/**
 * Devin Sub-Agent Orchestration — Researcher → Coder → Reviewer loop.
 *
 * Demonstrates Integration #2 of the MCOP ecosystem-expansion track:
 * MCOP itself acts as the governance layer for an autonomous coding
 * pipeline. Each leg (research, code, review) is dispatched through a
 * sub-agent client (Devin's MCP server in production, the bundled mock
 * client in CI / offline environments) and the orchestrator records a
 * Merkle-rooted ProvenanceMetadata bundle for every leg.
 *
 * What the example shows:
 *
 *   1. Construct the triad (encoder + stigmergy + etch).
 *   2. Build a `DevinOrchestratorAdapter` against a `SubAgentClient`.
 *   3. Drive the full Researcher → Coder → Reviewer loop via
 *      `runResearcherCoderReviewer`.
 *   4. Print the per-leg artefacts, Merkle chain, total token usage,
 *      cache-hit count, and human-veto count.
 *
 * Run with:
 *
 *   npx ts-node examples/devin_sub_agent_orchestration/orchestrator.ts \
 *     "wire a feature flag into the visualiser landing page"
 *
 * The mock sub-agent client makes the script reproducible in CI; swap in
 * a real Devin MCP-backed client by passing `--client=devin-mcp` once the
 * MCP integration ships.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../../src/core';
import {
  DevinOrchestratorAdapter,
  mockSubAgentClient,
  runResearcherCoderReviewer,
  SubAgentClient,
} from '../../src/adapters';

const DEFAULT_TASK =
  'Add a /benchmarks route that surfaces the Human-vs-Pure-AI prompting study.';

// ---------------------------------------------------------------- client
//
// In production this is a real Devin MCP-backed client. For the offline
// example we use the deterministic mock so the loop is reproducible in
// CI and the case-study artefacts match between runs.
function buildClient(): SubAgentClient {
  if (process.env.DEVIN_SUB_AGENT_BACKEND === 'devin-mcp') {
    throw new Error(
      'devin-mcp backend is provisioned by the MCP integration that ' +
        'lands in PR D — supply your own SubAgentClient implementation.',
    );
  }
  return mockSubAgentClient();
}

async function main(): Promise<void> {
  const task = process.argv[2] ?? DEFAULT_TASK;

  // ---------------------------------------------------------------- triad
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

  const adapter = new DevinOrchestratorAdapter({
    encoder,
    stigmergy,
    etch,
    client: buildClient(),
  });

  const capabilities = await adapter.getCapabilities();
  console.log('--- DEVIN SUB-AGENT ORCHESTRATOR ---');
  console.log('Platform:        ', capabilities.platform);
  console.log('Roles:           ', capabilities.models.join(', '));
  console.log('Cache threshold: ', 0.85);
  console.log('Task:            ', task);
  console.log('');

  // ------------------------------------------------------------- run loop
  const report = await runResearcherCoderReviewer(adapter, {
    task,
    cacheResonanceThreshold: 0.85,
    options: {
      researcher: { maxTokens: 1024, tags: ['mcop', 'researcher'] },
      coder: { maxTokens: 2048, tags: ['mcop', 'coder'] },
      reviewer: { maxTokens: 768, tags: ['mcop', 'reviewer'] },
    },
    humanReview: (leg) => {
      // Hook for an operator to veto / rewrite a leg. The example keeps
      // it permissive but the production entry point can plug into
      // Slack, Linear, or the Visual Dialectical Studio.
      if (leg === 'reviewer') {
        return { notes: 'verify Merkle chain matches docs/integrations/' };
      }
      return undefined;
    },
  });

  // ---------------------------------------------------------- pretty print
  for (const leg of report.legs) {
    console.log(`--- LEG: ${leg.role.toUpperCase()} ---`);
    if (leg.vetoed) {
      console.log('Status: VETOED by operator');
      continue;
    }
    if (leg.cacheHit) {
      console.log('Status: CACHE HIT (resonance ≥ 0.85, no sub-agent call)');
    }
    if (!leg.response) {
      console.log('Status: no response');
      continue;
    }
    const { result, merkleRoot, provenance } = leg.response;
    console.log('Output (excerpt):');
    console.log(result.output.split('\n').slice(0, 6).join('\n'));
    console.log('Merkle root:    ', merkleRoot);
    console.log('Trace ID:       ', provenance.traceId);
    console.log('Resonance:      ', provenance.resonanceScore.toFixed(4));
    if (result.usage) {
      console.log(
        `Tokens (in/out/total): ${result.usage.tokensIn}/${result.usage.tokensOut}/${result.usage.tokensTotal}` +
          (result.usage.durationMs !== undefined
            ? ` · ${result.usage.durationMs}ms`
            : ''),
      );
    }
    console.log('');
  }

  console.log('--- SUMMARY ---');
  console.log('Merkle chain:');
  for (const root of report.merkleChain) console.log('  ' + root);
  console.log('Total tokens:    ', report.totalUsage.tokensTotal);
  console.log('Total wall time: ', `${report.totalUsage.durationMs ?? 0}ms`);
  console.log('Cache hits:      ', report.cacheHits);
  console.log('Human vetoes:    ', report.humanVetoes);
  console.log('');
  console.log(
    'Every leg is reproducible from the Merkle root above — paste any ' +
      'root into docs/integrations/devin_sub_agents.md as the audit ' +
      'reference for that run.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
