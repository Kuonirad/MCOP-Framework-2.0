/**
 * Devin Sub-Agent Orchestrator — deterministic smoke test that prints
 * the Merkle chain so the case-study doc can quote real audit IDs.
 *
 * Marked `it.skip` by default so it doesn't pollute the CI summary; flip
 * the gate to `1` and re-run to capture a fresh Merkle chain:
 *
 *   DEVIN_SMOKE=1 pnpm test -- devin_orchestrator.smoke
 */

import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import {
  DevinOrchestratorAdapter,
  mockSubAgentClient,
  runResearcherCoderReviewer,
} from '../adapters';

const SMOKE_ENABLED = process.env.DEVIN_SMOKE === '1';
const maybe = SMOKE_ENABLED ? it : it.skip;

describe('Devin orchestrator smoke', () => {
  maybe('captures a real Merkle chain from the mock backend', async () => {
    const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
    const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3 });
    const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });
    const adapter = new DevinOrchestratorAdapter({
      encoder,
      stigmergy,
      etch,
      client: mockSubAgentClient(),
    });

    const report = await runResearcherCoderReviewer(adapter, {
      task: 'Add a /benchmarks route that surfaces the Human-vs-Pure-AI study.',
    });

    console.log(
      JSON.stringify(
        {
          task: report.task,
          merkleChain: report.merkleChain,
          totalUsage: report.totalUsage,
          cacheHits: report.cacheHits,
          humanVetoes: report.humanVetoes,
          legSummaries: report.legs.map((l) => ({
            role: l.role,
            cacheHit: l.cacheHit,
            vetoed: l.vetoed,
            merkleRoot: l.response?.merkleRoot ?? null,
            traceId: l.response?.provenance.traceId ?? null,
            tokensTotal: l.response?.result.usage?.tokensTotal ?? 0,
          })),
        },
        null,
        2,
      ),
    );
    expect(report.merkleChain).toHaveLength(3);
  });
});
