/**
 * Local Veil Grok + MCOP Integration Example
 *
 * This demonstrates connecting your PRIMARY local Grok build
 * (the one powered by grok-veil + veil-bridge + your real ~/.grok installation)
 * to the full MCOP adapter + triad machinery.
 *
 * Prerequisites (primary build):
 *   1. Your local Grok installation is present (~/.grok/bin/grok.exe + sessions).
 *   2. grok-veil / veil-bridge is running (default: http://127.0.0.1:57321).
 *      - Usually started via one of your launch scripts (Launch-Real.ps1, launch-with-bridge.ps1, etc.).
 *   3. The bridge can successfully run `grok -p "..."` against your local build.
 *
 * Why this matters:
 *   - All MCOP orchestration (encoder → stigmergy resonance → dialectical synthesis →
 *     holographic etch + Merkle provenance) now drives YOUR local Grok build.
 *   - You can enable organelleMode so the local Grok itself runs parts of the MCOP triad internally.
 *   - Full compatibility with the rest of the MCOP ecosystem (chained adapters, long video pipelines,
 *     ARC agents, etc.).
 *
 * Run:
 *   cd MCOP-Framework-2.0-fresh
 *   npx ts-node examples/local_veil_grok_completion.ts "your task here"
 *
 * Or with organelle mode:
 *   ORGANELLE=1 npx ts-node examples/local_veil_grok_completion.ts "reason step by step about X"
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';

import {
  GrokMCOPAdapter,
  VeilBridgeGrokClient,           // the new adapter for your primary local build
  createVeilBridgeGrokClient,
} from '../src/adapters';

async function main() {
  const task = process.argv.slice(2).join(' ') || 'Explain the current state of the MCOP-Grok symbiosis in one crisp paragraph.';

  console.log('=== Local Veil Grok + MCOP Integration ===\n');
  console.log('Target bridge : http://127.0.0.1:57321 (veil-bridge for your primary local Grok build)');
  console.log('Task          :', task);
  console.log('');

  // 1. Create the client that talks to your local Grok build via the existing bridge.
  //    This is the key integration point.
  const localClient = new VeilBridgeGrokClient({
    bridgeUrl: process.env.VEIL_BRIDGE_URL || 'http://127.0.0.1:57321',
    timeoutMs: 300_000,
  });

  // Alternative one-liner:
  // const localClient = createVeilBridgeGrokClient({ bridgeUrl: 'http://127.0.0.1:57321' });

  // 2. Build a normal MCOP triad (same as you would for the cloud Grok adapter).
  const encoder = new NovaNeoEncoder({ dimensions: 8192, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.55, maxTraces: 2048 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

  // 3. Wire the LOCAL client into the official GrokMCOPAdapter.
  //    From this point on, every MCOP feature (resonance, etch, provenance, chaining, etc.)
  //    will execute against your local Grok build.
  const adapter = new GrokMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: localClient,
    defaultModel: 'grok-4.3', // or whatever your local build reports
  });

  // 4. Optional: enable organelle mode (bidirectional MCOP execution inside the local Grok).
  //    Set ORGANELLE=1 (or any truthy value) in the environment to activate.
  const useOrganelle = !!process.env.ORGANELLE;

  const requestOptions: any = {
    temperature: 0.6,
    maxTokens: 1200,
    topP: 0.95,
    // Local Grok build specific controls (forwarded through the adapter to the veil-bridge → grok.exe)
    effort: 'high',                    // --effort low|medium|high|xhigh|max
    outputFormat: 'streaming-json',    // --output-format plain|json|streaming-json (great for structured/organelle responses)
    reasoningEffort: 'high',           // --reasoning-effort (for reasoning models)
    // stigmergyHistory: true, // you can also inject recent MCOP traces as memory
  };

  if (useOrganelle) {
    requestOptions.organelleMode = {
      enabled: true,
      profile: 'low-memory',
      mergeTraces: true,
      mergeEtches: true,
      strictParsing: false, // set true once your local Grok reliably emits the artifact JSON
    };
    console.log('[organelle] organelleMode enabled — the local Grok will be instructed to host MCOP internally.\n');
  }

  // 5. Execute through the full MCOP pipeline.
  //    The adapter will:
  //      - encode the prompt
  //      - query stigmergy for resonance
  //      - (optionally) run dialectical synthesis / human review
  //      - call YOUR LOCAL Grok build via the veil-bridge
  //      - record provenance via holographic etch
  //      - (if organelleMode) attempt to parse + merge artifacts emitted by the local Grok
  const result = await adapter.generateOptimizedCompletion(task, requestOptions);

  console.log('=== Result from your local Grok build ===\n');
  console.log(result.result.content);
  console.log('\n--- MCOP Provenance ---');
  console.log('merkleRoot     :', result.merkleRoot);
  console.log('resonanceScore :', result.provenance.resonanceScore);
  console.log('traceId        :', result.provenance.traceId);
  console.log('refinedPrompt  :', result.provenance.refinedPrompt?.slice(0, 160) + '...');

  if ((result.result as any).organelle) {
    console.log('\n--- Organelle Artifacts (from local Grok) ---');
    console.log(JSON.stringify((result.result as any).organelle, null, 2));
  }

  console.log('\n=== Done. Your local Grok build is now a full MCOP participant. ===');
}

main().catch((err) => {
  console.error('\n[error]', err);
  console.error('\nTroubleshooting:');
  console.error('  - Is grok-veil + veil-bridge running on the expected port?');
  console.error('  - Can the bridge execute "grok -p" successfully against your local installation?');
  console.error('  - Try running the bridge health/status endpoint first: curl http://127.0.0.1:57321/api/status');
  process.exit(1);
});
