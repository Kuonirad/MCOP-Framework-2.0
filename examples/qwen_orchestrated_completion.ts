/**
 * Qwen / Alibaba DashScope orchestrated-completion example.
 *
 * Demonstrates the full Qwen integration flow — the same shape as the
 * Grok example (`grok_orchestrated_completion.ts`) so reviewers can
 * confirm 1:1 parity:
 *
 *   1. Construct the MCOP triad (encoder + stigmergy + etch).
 *   2. Wire the bundled `defaultQwenClient` (or any other `QwenClient`)
 *      into a `QwenMCOPAdapter`.
 *   3. Use the self-referential `chooseQwenByEntropyResonance` router
 *      to decide whether to call Qwen, fall back to a local cache, or
 *      escalate to human review — all from MCOP-derived signals.
 *   4. Print the refined prompt, the Qwen completion, the Merkle-rooted
 *      ProvenanceMetadata bundle, and the routing decision.
 *
 * Run with:
 *
 *   QWEN_API_KEY=sk-... npx ts-node examples/qwen_orchestrated_completion.ts \
 *     "your prompt here"
 *
 * Without a key, the script wires the bundled mock client instead so the
 * example doubles as executable documentation.
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../src/core';
import {
  chooseQwenByEntropyResonance,
  defaultQwenClient,
  QwenClient,
  QwenMCOPAdapter,
} from '../src/adapters';

// ---------------------------------------------------------------- client
//
// When `QWEN_API_KEY` (or `DASHSCOPE_API_KEY`) is set we hit the real
// DashScope endpoint via fetch. Otherwise we fall back to a deterministic
// offline stub so the example still runs in restricted environments.
function buildClient(): QwenClient {
  const hasKey =
    (process.env.QWEN_API_KEY && process.env.QWEN_API_KEY.trim().length > 0) ||
    (process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_API_KEY.trim().length > 0);
  if (hasKey) {
    return defaultQwenClient();
  }
  console.warn(
    '[qwen-example] QWEN_API_KEY / DASHSCOPE_API_KEY not set — using offline stub client.',
  );
  return {
    async createCompletion({ messages, options }) {
      const last = messages[messages.length - 1]?.content ?? '';
      return {
        model: options.model ?? 'qwen3.5-flash',
        content: `[offline stub] ${last.slice(0, 240)}`,
        finishReason: 'stop',
        usage: {
          promptTokens: last.length,
          completionTokens: Math.min(last.length, 240),
          totalTokens: last.length + Math.min(last.length, 240),
        },
      };
    },
  };
}

async function main() {
  const userPrompt =
    process.argv.slice(2).join(' ').trim() ||
    'Outline a research agenda for verifiable, stigmergic multi-agent coordination.';

  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.3 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });

  const adapter = new QwenMCOPAdapter({
    encoder,
    stigmergy,
    etch,
    client: buildClient(),
  });

  // ---------------------------------------------------------- self-router
  //
  // Self-referential MCOP routing: encode the prompt once with the same
  // encoder the adapter uses, then ask `chooseQwenByEntropyResonance`
  // whether the call is novel enough to warrant a remote dispatch.
  const tensor = encoder.encode(userPrompt);
  const entropy = encoder.estimateEntropy(tensor);
  const resonance = stigmergy.getResonance(tensor).score;
  const decision = chooseQwenByEntropyResonance({ entropy, resonance });

  console.log('--- MCOP self-router (Qwen) ---');
  console.log(`prompt:    ${userPrompt}`);
  console.log(`entropy:   ${entropy.toFixed(3)}`);
  console.log(`resonance: ${resonance.toFixed(3)}`);
  console.log(`decision:  ${decision}`);

  if (decision === 'human-review') {
    console.warn(
      '[qwen-example] Decision = human-review; aborting before remote dispatch.',
    );
    return;
  }
  if (decision === 'local') {
    console.log(
      '[qwen-example] Decision = local; high-resonance prompt could be served from cache.',
    );
    // In a real orchestrator a cached completion would be returned here.
  }

  // ----------------------------------------------------------- adapter call
  const response = await adapter.generateOptimizedCompletion(
    userPrompt,
    { model: 'qwen3.5-flash', temperature: 0.4, maxTokens: 512 },
    { metadata: { exampleRun: true } },
  );

  console.log('\n--- Qwen response ---');
  console.log(response.result.content);

  console.log('\n--- Provenance bundle ---');
  console.log(JSON.stringify(response.provenance, null, 2));
  console.log(`merkleRoot: ${response.merkleRoot}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
