/**
 * Grok Organelle Live Wired Demo
 *
 * Small, focused example that exercises the *real* wired path in GrokMCOPAdapter
 * after the canonical prompt builder + richer config integration.
 *
 * What it demonstrates:
 * - Creating a ledger-aware style adapter (in-memory for the demo)
 * - Calling generate with the new richer organelleMode options
 *   (includeToolSupport, maxPriorTracesToShow, additionalInstructions)
 * - Seeing the actual system prompt that the adapter constructs (via internal trace)
 * - Supplying a realistic OrganelleArtifacts response from the "model"
 * - Running the real merge + provenance path
 *
 * This is intentionally *not* a full simulation like the older experiments.
 * It uses the production adapter code paths.
 *
 * Run:
 *   npx tsx examples/grok_organelle_live_wired_demo.ts
 */

import {
  GrokMCOPAdapter,
  type GrokClient,
  type GrokCompletionResult,
} from '../src/adapters/grokAdapter';

import {
  NovaNeoEncoder,
  StigmergyV5,
  HolographicEtch,
} from '../src/core';

async function main() {
  console.log('=== Grok Organelle Live Wired Demo ===\n');

  // 1. Real host substrate (same as production callers would have)
  const encoder = new NovaNeoEncoder({ dimensions: 32, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3, maxTraces: 256 });
  const etch = new HolographicEtch({ confidenceFloor: 0.6 });

  // Seed a couple of realistic prior traces so the adapter will inject them
  const prior1 = encoder.encode('Initial symbiosis activation and conductor decision for organelle tier');
  const prior2 = encoder.encode('Upstream shipped production organelleMode support + canonical prompt builder');
  stigmergy.recordTrace(prior1, prior1, { source: 'demo-seed', label: 'activation' });
  stigmergy.recordTrace(prior2, prior2, { source: 'demo-seed', label: 'upstream-progress' });

  // 2. Mock client that captures the messages the adapter actually sends
  let capturedSystemPrompt: string | undefined;

  const mockClient: GrokClient = {
    async createCompletion({ messages, options }) {
      // Find the organelle instructions (last system message in current wiring)
      const systemMessages = messages.filter(m => m.role === 'system');
      capturedSystemPrompt = systemMessages[systemMessages.length - 1]?.content;

      console.log('--- Adapter constructed the following organelle system prompt (truncated) ---\n');
      console.log((capturedSystemPrompt ?? '').slice(0, 1400) + '\n... [truncated]\n');

      // Return a realistic OrganelleArtifacts response as if Grok replied
      const artifacts = {
        synthesizedInsight:
          'The wired prompt builder + richer config is working cleanly. ' +
          'The model received authentic prior host traces and the canonical profile. ' +
          'Positive resonance of the integration is very high.',
        internalTraces: [
          {
            id: 'live-demo-001',
            resonance: 0.94,
            summary: 'Adapter correctly delegates to buildOrganelleSystemPrompt and injects real Stigmergy context.',
            contextTensorHint: JSON.stringify([0.81, -0.14, 0.95, 0.21, -0.37, 0.68]),
          },
        ],
        proposedEtchDelta: 0.1875,
        resonanceScores: {
          overall: 0.93,
          wiringFidelity: 0.96,
          traceInjection: 0.91,
        },
        organelleNotes: 'Live wired demo executed successfully via the updated GrokMCOPAdapter.',
        organelleProtocolVersion: 'grok-organelle-v2',
        modelInternalMerkleRoot: 'live-demo-' + Date.now().toString(16),
      };

      return {
        model: options.model ?? 'grok-4.3',
        content: JSON.stringify(artifacts),
        finishReason: 'stop',
        usage: { promptTokens: 1240, completionTokens: 180, totalTokens: 1420 },
        rateLimit: undefined,
        raw: null,
      } as GrokCompletionResult;
    },
  };

  // 3. Create adapter (in-memory, no real ledger for the demo)
  const adapter = new GrokMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: mockClient,
    defaultModel: 'grok-4.3',
  });

  // 4. Exercise the wired path with the *new* richer config options
  console.log('Calling adapter with richer organelleMode config...\n');

  const response = await adapter.generateOptimizedCompletion(
    'Demonstrate the newly wired organelle prompt builder with includeToolSupport and trace injection.',
    {
      organelleMode: {
        enabled: true,
        includeToolSupport: false,           // explicit (the interesting new knob)
        maxPriorTracesToShow: 6,
        additionalInstructions: 'Emphasize positive-resonance and provenance preservation in your synthesis.',
      },
      model: 'grok-4.3',
    }
  );

  console.log('--- Response received ---\n');
  console.log('organelleProvenance:', JSON.stringify(response.organelleProvenance, null, 2));

  const result: GrokCompletionResult = response.result;
  console.log('\nParsed artifacts from model:');
  console.dir(result?.organelle?.artifacts, { depth: 2 });

  console.log('\n=== Demo Complete ===');
  console.log('The full production path (prompt construction → model response → merge) was exercised.');
  console.log('The prompt the model saw was dynamically built by the newly wired canonical utility.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
