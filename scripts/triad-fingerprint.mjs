#!/usr/bin/env node
// Cross-Language Parity Guardian — npm package fingerprint CLI.
//
// This intentionally imports the built @kullailabs/mcop-core entry point.
// The previous implementation duplicated the encoder algorithm here, which
// allowed this helper and the Python helper to agree while the public npm
// class had already drifted. `pnpm parity:check` builds the package first, so
// every value below now comes from the same ESM artifact consumers install.

import { createHash } from 'node:crypto';

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
  TRIAD_PROTOCOL_VERSION,
} from '../packages/core/dist/index.js';

const TRACE_ID = '123e4567-e89b-42d3-a456-426614174000';
const OPTIONAL_TRACE_ID = '223e4567-e89b-42d3-a456-426614174000';
const TRIAD_CONTEXT = [0.25, -0.5, 0.75, 1.0];
const TRIAD_SYNTHESIS = [0.5, -0.25, 0.75, 0.5];
const TRIAD_METADATA = { stage: 'cross-language-parity', sequence: 1 };
const TRIAD_NOTE = 'cross-language-parity';

function tensorSha256(tensor) {
  const bytes = Buffer.allocUnsafe(tensor.length * 8);
  for (let i = 0; i < tensor.length; i++) bytes.writeDoubleLE(tensor[i], i * 8);
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArgs(argv) {
  const args = { dimensions: 32, normalize: false, text: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dimensions') args.dimensions = Number(argv[++i]);
    else if (arg === '--normalize') args.normalize = true;
    else if (args.text === undefined) args.text = arg;
  }
  if (args.text === undefined) {
    process.stderr.write('Usage: triad-fingerprint.mjs <text> [--dimensions N] [--normalize]\n');
    process.exit(2);
  }
  return args;
}

function flagshipTriadFingerprint() {
  const memory = new StigmergyV5({
    resonanceThreshold: 0.25,
    adaptiveThreshold: false,
    maxTraces: 8,
  });
  const trace = memory.recordTrace(
    TRIAD_CONTEXT,
    TRIAD_SYNTHESIS,
    TRIAD_METADATA,
    { traceId: TRACE_ID },
  );
  const resonance = memory.getResonance(TRIAD_CONTEXT);

  const ledger = new HolographicEtch({
    confidenceFloor: 0,
    auditLog: true,
    maxEtches: 8,
    staticFloorWeight: 0.4,
    curiosityBonus: 0.15,
    flourishingAmplifier: 0.2,
  });
  const etch = ledger.applyEtch(TRIAD_CONTEXT, TRIAD_SYNTHESIS, TRIAD_NOTE);

  const optionalMemory = new StigmergyV5({
    resonanceThreshold: 0.25,
    adaptiveThreshold: false,
    maxTraces: 8,
  });
  const optionalTrace = optionalMemory.recordTrace(
    TRIAD_CONTEXT,
    TRIAD_SYNTHESIS,
    undefined,
    { traceId: OPTIONAL_TRACE_ID },
  );
  const optionalEtch = new HolographicEtch({ confidenceFloor: 0, maxEtches: 8 })
    .applyEtch(TRIAD_CONTEXT, TRIAD_SYNTHESIS);
  const embeddingTensor = new NovaNeoEncoder({
    dimensions: 16,
    normalize: true,
    backend: 'embedding',
  }).encode('Semantic café 😀');
  const unicodeTensor = new NovaNeoEncoder({ dimensions: 8 }).encode('\ud800');
  const growthLedger = new HolographicEtch({
    confidenceFloor: 0,
    maxEtches: 8,
    growthLedger: true,
    maxGrowthEvents: 8,
  });
  const growthEvent = growthLedger.recordPositiveGrowthEvent({
    domain: 'determinism',
    title: 'Parity',
    positiveBuilding: 'Shared contract',
    resonanceDelta: 0.5,
  });
  const growthMetrics = growthLedger.getPositiveImpactMetrics();

  return {
    stigmergy: {
      trace_id: trace.id,
      trace_hash: trace.hash,
      weight: trace.weight,
      merkle_root: memory.getMerkleRoot(),
      resonance_score: resonance.score,
      threshold_used: resonance.thresholdUsed,
      positive_feedback_score: resonance.positiveFeedbackScore,
    },
    holographic_etch: {
      hash: etch.hash,
      delta_weight: etch.deltaWeight,
      flourishing_score: etch.flourishingScore,
      propagation_hint: etch.propagationHint,
    },
    optional_fields: {
      trace_hash: optionalTrace.hash,
      etch_hash: optionalEtch.hash,
    },
    embedding: { tensor_sha256: tensorSha256(embeddingTensor) },
    unicode_policy: { tensor_sha256: tensorSha256(unicodeTensor) },
    noise_floor: {
      candidate_1: new StigmergyV5({
        maxTraces: 2048,
        noiseFloor: { candidates: 1 },
        adaptiveThreshold: false,
      }).getResonance([0]).thresholdUsed,
      candidate_8: new StigmergyV5({
        maxTraces: 2048,
        noiseFloor: { candidates: 8 },
        adaptiveThreshold: false,
      }).getResonance([0]).thresholdUsed,
    },
    growth_ledger: {
      hash: growthEvent?.hash,
      contributor_joy: growthMetrics?.contributorJoy,
      growth_events: growthMetrics?.growthEvents,
      merkle_root: growthMetrics?.merkleRoot,
    },
  };
}

const { text, dimensions, normalize } = parseArgs(process.argv.slice(2));
const encoder = new NovaNeoEncoder({ dimensions, normalize, backend: 'hash' });
const tensor = encoder.encode(text);
const triad = flagshipTriadFingerprint();
const result = {
  input: text,
  dimensions,
  normalized: normalize,
  entropy: encoder.estimateEntropy(tensor),
  tensor_sha256: tensorSha256(tensor),
  triad_protocol_version: TRIAD_PROTOCOL_VERSION,
  ...triad,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
