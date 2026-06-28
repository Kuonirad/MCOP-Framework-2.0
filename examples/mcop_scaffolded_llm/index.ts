/**
 * MCOP-Scaffolded LLM — First Merkle-Rooted Response
 *
 * The literal starting point for building an LLM application on MCOP's
 * systems design. It wraps an existing LLM's inference loop with the MCOP
 * triad so that every response carries cryptographic provenance:
 *
 *   NOVA-NEO Encoder  →  deterministic SHA-256 text-to-tensor encoding
 *   Stigmergy V5      →  Merkle-chained pheromone memory with cosine recall
 *   Holographic Etch  →  adaptive confidence scoring with audit ledger
 *
 * Every response from this script carries:
 *   - A trace hash   (SHA-256 of the prompt→response relationship, chained)
 *   - A parent hash  (linking to the previous reasoning step, if any)
 *   - A confidence   (the Etch's four-factor adaptive assessment)
 *   - A Merkle root  (the cryptographic root of the entire reasoning chain)
 *
 * # Imports — repo-internal vs. external
 *
 * This file lives inside the framework repository, so it imports the triad
 * from the in-tree source (`../../src/core`). When you copy this example
 * into your own project, install the published package and swap the import
 * for the package name instead:
 *
 *   pnpm add @kullailabs/mcop-core openai
 *   // import { NovaNeoEncoder, StigmergyV5, HolographicEtch } from '@kullailabs/mcop-core';
 *
 * Both surfaces export the same three classes with identical signatures.
 *
 * # Usage
 *
 *   npx tsx examples/mcop_scaffolded_llm/index.ts "What is the capital of France?"
 *   npx tsx examples/mcop_scaffolded_llm/index.ts --recall "European geography"
 *   npx tsx examples/mcop_scaffolded_llm/index.ts --demo
 *
 * Point it at any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM,
 * OpenAI, …):
 *
 *   LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.2 \
 *     npx tsx examples/mcop_scaffolded_llm/index.ts "prompt"
 *
 * When no endpoint is reachable, the script falls back to a deterministic
 * offline stub so it doubles as executable documentation in restricted
 * environments (set MCOP_LLM_OFFLINE=1 to force the stub).
 */

import { NovaNeoEncoder, StigmergyV5, HolographicEtch } from '../../src/core';
import OpenAI from 'openai';

// ─── Configuration ───────────────────────────────────────────────────
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1';
const LLM_MODEL = process.env.LLM_MODEL ?? 'llama3.2';
const LLM_API_KEY = process.env.LLM_API_KEY ?? 'ollama';
const ENCODER_DIMENSIONS = 64;
const OFFLINE = process.env.MCOP_LLM_OFFLINE === '1';

// ─── MCOP Triad Initialization ───────────────────────────────────────
// These three kernels form the deterministic reasoning substrate. They
// persist for the lifetime of the process — each reason() call extends the
// same trace chain and etch ledger.

const encoder = new NovaNeoEncoder({
  dimensions: ENCODER_DIMENSIONS,
  normalize: true,
  // backend defaults to 'hash' — the SHA-256 hashing trick.
  // For browser/edge: backend: 'novaNeoWeb'
});

const memory = new StigmergyV5({
  // The resonance threshold determines what counts as a "match" when
  // recalling past reasoning. Below this cosine similarity, traces don't
  // resonate. Omit it entirely to let StigmergyV5 derive an analytic floor
  // from the encoder's null model; 0.55 is a pragmatic explicit override
  // for a small trace buffer.
  resonanceThreshold: 0.55,
  maxTraces: 2048,
});

const ledger = new HolographicEtch({
  // The confidence floor determines what gets committed to the main etch
  // ring vs. the audit ring (rejection log). Below this score, the etch is
  // skipped but still recorded — "we saw this and rejected it" is a
  // first-class audit event.
  confidenceFloor: 0.3,
  growthLedger: true,
  maxEtches: 4096,
});

// ─── LLM Client ──────────────────────────────────────────────────────
// OpenAI-compatible — works with Ollama, LM Studio, vLLM, OpenAI, etc.
const llm = new OpenAI({
  baseURL: LLM_BASE_URL,
  apiKey: LLM_API_KEY,
});

// Deterministic offline stub so the example runs without a live endpoint.
function offlineCompletion(prompt: string): string {
  return `[offline stub] You asked: "${prompt.slice(0, 180)}". `
    + 'Set LLM_BASE_URL/LLM_MODEL to wire a real OpenAI-compatible endpoint.';
}

async function complete(prompt: string): Promise<string> {
  if (OFFLINE) return offlineCompletion(prompt);
  try {
    const completion = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content ?? '';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `  [mcop-llm] LLM endpoint unreachable (${msg}); using offline stub.`,
    );
    return offlineCompletion(prompt);
  }
}

// ─── Types ────────────────────────────────────────────────────────────
interface ReasoningResult {
  prompt: string;
  response: string;
  model: string;
  traceId: string;
  traceHash: string;
  parentHash: string | null;
  etchHash: string;
  etchDelta: number;
  etchAccepted: boolean;
  confidence: {
    score: number;
    alignment: number;
    magnitudeHealth: number;
    recencyStability: number;
    accepted: boolean;
  };
  merkleRoot: string;
}

// ─── Core: Reason with Provenance ─────────────────────────────────────
async function reason(prompt: string): Promise<ReasoningResult> {
  //
  // STAGE 1: ENCODE
  //
  // The prompt is transformed into a deterministic context tensor via:
  //   SHA-256(text) → 32 bytes → map to [-1, 1] → tile to N dims → L2 norm
  //
  // Same prompt always produces the same tensor. This is what makes the
  // provenance chain reproducible — the encoder is the anchor.
  //
  const contextTensor = encoder.encode(prompt);

  //
  // STAGE 2: GENERATE
  //
  // The LLM generates a response. This is the non-deterministic step — the
  // one part of the chain that MCOP does not control. MCOP's job is to make
  // this step auditable, not deterministic.
  //
  const response = await complete(prompt);

  //
  // STAGE 3: ENCODE RESPONSE
  //
  // The response is encoded into a synthesis tensor using the same
  // deterministic encoder. The cosine similarity between context and
  // synthesis tensors determines the confidence score in Stage 5.
  //
  const synthesisTensor = encoder.encode(response);

  //
  // STAGE 4: TRACE
  //
  // The reasoning trace is recorded in stigmergic memory as a
  // Merkle-chained entry: the trace's hash is the canonical digest of its
  // payload plus the previous trace's hash. Modifying any past trace breaks
  // every subsequent hash — the chain is tamper-evident by construction.
  //
  const trace = memory.recordTrace(contextTensor, synthesisTensor, {
    prompt,
    response,
    model: LLM_MODEL,
    timestamp: new Date().toISOString(),
  });

  //
  // STAGE 5: SCORE CONFIDENCE
  //
  // The Holographic Etch's Adaptive Confidence Engine blends four factors
  // into a single [0, 1] score: alignment (cosine of prompt/response
  // tensors), magnitudeHealth (penalizes vanishing vectors), the static
  // floor margin, and recencyStability (inverse of recent deltaWeight
  // variance).
  //
  const confidence = ledger.scoreConfidence(contextTensor, synthesisTensor);

  //
  // STAGE 6: ETCH
  //
  // The reasoning is committed to the confidence ledger:
  //   - confidence ≥ floor → committed to main etch ring (hash is real)
  //   - confidence < floor → logged to audit ring (hash is '',
  //                          note 'skipped-low-confidence')
  //
  const etch = ledger.applyEtch(
    contextTensor,
    synthesisTensor,
    `reason-${trace.id}`,
  );

  //
  // STAGE 7: MERKLE ROOT
  //
  // The Merkle root is the cryptographic summary of the entire trace chain.
  // Because each trace incorporates its parent's hash, the latest trace's
  // hash implicitly commits all prior traces. (For the genesis trace the
  // root simply equals that trace's hash.)
  //
  const merkleRoot = memory.getMerkleRoot() ?? trace.hash;

  return {
    prompt,
    response,
    model: LLM_MODEL,
    traceId: trace.id,
    traceHash: trace.hash,
    parentHash: trace.parentHash ?? null,
    etchHash: etch.hash,
    etchDelta: etch.deltaWeight,
    etchAccepted: etch.hash !== '',
    confidence: {
      score: confidence.score,
      alignment: confidence.alignment,
      magnitudeHealth: confidence.magnitudeHealth,
      recencyStability: confidence.recencyStability,
      accepted: confidence.accepted,
    },
    merkleRoot,
  };
}

// ─── Recall: Retrieve Past Reasoning by Semantic Resonance ────────────
//
// Stigmergy's getResonance() scans the trace buffer using cosine
// similarity. Traces whose context tensor is close to the query tensor
// "resonate" — they're recalled. This is not keyword search; it's semantic
// similarity in the encoder's SHA-256-derived space.
//
function recall(query: string): void {
  const queryTensor = encoder.encode(query);
  const result = memory.getResonance(queryTensor);

  console.log(`\n${'━'.repeat(61)}`);
  console.log('  MCOP RECALL — Stigmergic Resonance Query');
  console.log(`${'━'.repeat(61)}`);

  if (!result.trace) {
    console.log('\n  No resonant traces found.');
    console.log('  (Run reason() first to populate the trace buffer.)');
    console.log(`\n${'━'.repeat(61)}\n`);
    return;
  }

  const meta = result.trace.metadata as Record<string, unknown> | undefined;

  console.log(`\n  Query:        ${query}`);
  console.log(`  Resonance:    ${result.score.toFixed(4)}`);
  console.log(`  Threshold:    ${result.thresholdUsed?.toFixed(4) ?? 'N/A'}`);
  console.log(`  Trace ID:     ${result.trace.id}`);
  console.log(`  Trace Hash:   ${result.trace.hash}`);
  if (meta?.prompt) {
    console.log(`  Original Q:   ${String(meta.prompt).slice(0, 57)}`);
  }
  if (meta?.response) {
    const resp = String(meta.response);
    console.log(`  Original A:   ${resp.slice(0, 57)}${resp.length > 57 ? '...' : ''}`);
  }
  console.log(`\n${'━'.repeat(61)}\n`);
}

// ─── Output Formatter ─────────────────────────────────────────────────
function displayResult(r: ReasoningResult): void {
  const line = '━'.repeat(61);
  const half = '━'.repeat(24);

  console.log(`\n${line}`);
  console.log('  MCOP-Scaffolded LLM — Provenance-Sealed Response');
  console.log(line);

  // Prompt
  console.log('\n  PROMPT:');
  console.log(`  ${r.prompt}`);

  // Response (wrapped at 57 chars)
  console.log(`\n  RESPONSE (${r.model}):`);
  const wrapped = r.response.match(/.{1,57}(\s|$)/g) ?? [r.response];
  for (const l of wrapped) {
    console.log(`  ${l.trimEnd()}`);
  }

  // Provenance section
  console.log(`\n  ${half} PROVENANCE ${half}`);

  // Trace
  console.log('\n  TRACE — Stigmergy V5 (Merkle-chained pheromone memory)');
  console.log(`    ID:          ${r.traceId}`);
  console.log(`    Hash:        ${r.traceHash}`);
  console.log(`    Parent:      ${r.parentHash ?? '(genesis — first trace)'}`);

  // Etch
  console.log('\n  ETCH — Holographic Etch (adaptive confidence ledger)');
  console.log(`    Hash:        ${r.etchHash || '(skipped — below confidence floor)'}`);
  console.log(`    Delta:       ${r.etchDelta.toFixed(4)}`);
  console.log(`    Committed:   ${r.etchAccepted ? 'main ring' : 'audit ring (rejected)'}`);

  // Confidence breakdown
  console.log('\n  CONFIDENCE — Adaptive Confidence Engine');
  const status = r.confidence.accepted ? 'ACCEPTED' : 'REJECTED';
  console.log(`    Score:       ${r.confidence.score.toFixed(4)}   ${status}`);
  console.log(`    Alignment:   ${r.confidence.alignment.toFixed(4)}`);
  console.log(`    Magnitude:   ${r.confidence.magnitudeHealth.toFixed(4)}`);
  console.log(`    Recency:     ${r.confidence.recencyStability.toFixed(4)}`);

  // Merkle root
  console.log('\n  MERKLE ROOT — cryptographic summary of entire reasoning chain');
  console.log(`    ${r.merkleRoot}`);

  // Next steps
  console.log(`\n${line}`);
  console.log('\n  Next:');
  console.log('    npx tsx examples/mcop_scaffolded_llm/index.ts "Another prompt"   ← extends the chain');
  console.log('    npx tsx examples/mcop_scaffolded_llm/index.ts --recall "query"   ← recalls by resonance');
  console.log(`\n${line}\n`);
}

// ─── Multi-Turn Demo: Show Chain Extension ────────────────────────────
//
// Running three prompts in sequence demonstrates:
//   1. Each response gets its own trace + etch + Merkle root
//   2. The Merkle root advances (changes) with each new trace
//   3. Recall finds past reasoning by semantic similarity
//   4. The parent hash links each trace to the previous one
//
async function multiTurnDemo(): Promise<void> {
  const prompts = [
    'What is a Merkle tree?',
    'How does SHA-256 work?',
    'Explain why deterministic encoding matters for AI provenance.',
  ];

  const roots: string[] = [];

  for (const prompt of prompts) {
    console.log(`\n  → Reasoning: "${prompt}"`);
    const result = await reason(prompt);
    displayResult(result);
    roots.push(result.merkleRoot);
  }

  // Show that roots advanced
  console.log(`${'━'.repeat(61)}`);
  console.log('  CHAIN EXTENSION — Merkle roots across 3 reasoning steps');
  console.log(`${'━'.repeat(61)}\n`);
  for (let i = 0; i < roots.length; i++) {
    console.log(`  Step ${i + 1}: ${roots[i]}`);
  }
  const allDifferent = new Set(roots).size === roots.length;
  console.log(`\n  All roots distinct: ${allDifferent ? 'yes' : 'no'}`);
  console.log(`  Chain is extending: ${allDifferent ? 'yes — each trace commits the prior' : 'no'}\n`);

  // Recall
  console.log(`${'━'.repeat(61)}`);
  console.log('  RECALL — querying past reasoning by resonance');
  console.log(`${'━'.repeat(61)}`);
  recall('cryptographic hashing');
  console.log(`${'━'.repeat(61)}\n`);
}

// ─── Error Handler ────────────────────────────────────────────────────
function handleError(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`\n  ✗ ERROR: ${msg}\n`);

  if (msg.includes('Cannot find module') || msg.includes('Failed to resolve')) {
    console.error('  Dependencies not installed. From the repo root run:');
    console.error('    pnpm install\n');
  }
  process.exitCode = 1;
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --demo flag: run the multi-turn chain extension demo
  if (args[0] === '--demo') {
    console.log('\n  MCOP Multi-Turn Demo — Chain Extension + Recall');
    console.log('  Three prompts, three traces, advancing Merkle root.\n');
    await multiTurnDemo();
    return;
  }

  // --recall flag: retrieve past reasoning by semantic resonance
  if (args[0] === '--recall') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('  Usage: npx tsx examples/mcop_scaffolded_llm/index.ts --recall "search query"');
      process.exitCode = 1;
      return;
    }
    recall(query);
    return;
  }

  // Default: single prompt → provenance-sealed response
  const prompt = args.join(' ') || 'Explain what a Merkle tree is in one sentence.';

  console.log('\n  Encoding prompt through NOVA-NEO...');
  console.log(`  Generating LLM response via ${LLM_MODEL}...`);
  console.log('  Recording trace in Stigmergy V5...');
  console.log('  Scoring confidence via Holographic Etch...\n');

  const result = await reason(prompt);
  displayResult(result);
}

if (require.main === module) {
  main().catch(handleError);
}
