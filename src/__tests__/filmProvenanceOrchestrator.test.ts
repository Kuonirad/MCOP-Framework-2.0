// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Orchestrator → provenanced film, end to end, with a deterministic stub
 * adapter. Also emits the publishable lunar-documentary sidecar artifact
 * `public/films/lunar-documentary.provenance.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import {
  HolographicEtch,
  LongFormVideoOrchestrator,
  NovaNeoEncoder,
  StigmergyV5,
  SynthesisProvenanceTracer,
  verifyFilmSidecar,
  type VideoClipAdapter,
  type VideoClipInput,
  type VideoClipOutput,
} from '../core';

/**
 * Deterministic adapter: the "generated" fingerprint is a pure function of the
 * prompt, so the whole film — and its credit root — is reproducible. A real
 * Vidu/Kling/Wan adapter would return its own latent here.
 */
class DeterministicLunarAdapter implements VideoClipAdapter {
  async generateClip(input: VideoClipInput): Promise<VideoClipOutput> {
    const fingerprint = Array.from({ length: 8 }, (_, d) => {
      let acc = 0;
      for (let k = 0; k < input.prompt.length; k += 1) {
        acc += input.prompt.charCodeAt(k) * (d + 1) * (k + 1);
      }
      return ((acc % 2000) / 1000) - 1; // ∈ [-1, 1)
    });
    return { assetUrl: `https://reel.local/lunar/clip-${input.clipIndex}.mp4`, fingerprint };
  }
}

function buildOrchestrator(): LongFormVideoOrchestrator {
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.05 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });
  const tracer = new SynthesisProvenanceTracer(encoder, stigmergy, etch);
  return new LongFormVideoOrchestrator({
    adapter: new DeterministicLunarAdapter(),
    tracer,
    stigmergy,
    etch,
  });
}

const LUNAR_NARRATIVE =
  'A documentary in earthlight: a solitary rover crosses the lunar south pole, ' +
  'mapping shadowed craters where water ice may hide.';

describe('Provenanced film via the orchestrator', () => {
  it('produces a verifiable sidecar with one credit root over every shot', async () => {
    const orchestrator = buildOrchestrator();
    const result = await orchestrator.generate(LUNAR_NARRATIVE, {
      totalDurationSec: 30,
      clipDurationSec: 5,
      recordFilmProvenance: true,
      filmTitle: 'Earthlight: A Lunar Traverse',
      modelId: 'wan-2.1',
      adapterName: 'deterministic-stub',
      adapterOptions: { seed: 4242 },
    });

    expect(result.filmSidecar).toBeDefined();
    const sidecar = result.filmSidecar!;
    expect(sidecar.shotCount).toBe(result.clips.length);
    expect(sidecar.creditRoot).toMatch(/^[0-9a-f]{64}$/);

    const verification = verifyFilmSidecar(sidecar);
    expect(verification.valid).toBe(true);
    expect(verification.results).toHaveLength(sidecar.shotCount);

    // The Direct Forcing edge is real: each shot's recorded seed/model is sealed.
    expect(sidecar.shots[0].model).toBe('wan-2.1');
    expect(sidecar.shots[0].seed).toBe(4242);
    expect(sidecar.shots[0].adapter).toBe('deterministic-stub');
  });

  it('omits the sidecar when provenance recording is off (non-breaking)', async () => {
    const result = await buildOrchestrator().generate(LUNAR_NARRATIVE, {
      totalDurationSec: 10,
      clipDurationSec: 5,
    });
    expect(result.filmSidecar).toBeUndefined();
  });

  it('emits the lunar-documentary provenance sidecar artifact', async () => {
    const orchestrator = buildOrchestrator();
    const result = await orchestrator.generate(LUNAR_NARRATIVE, {
      totalDurationSec: 40,
      clipDurationSec: 5,
      recordFilmProvenance: true,
      filmTitle: 'Earthlight: A Lunar Traverse',
      modelId: 'wan-2.1',
      adapterName: 'deterministic-stub',
      adapterOptions: { seed: 4242 },
    });
    const sidecar = result.filmSidecar!;
    expect(verifyFilmSidecar(sidecar).valid).toBe(true);

    const outDir = path.resolve(__dirname, '..', '..', 'public', 'films');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      path.join(outDir, 'lunar-documentary.provenance.json'),
      `${JSON.stringify(sidecar, null, 2)}\n`,
    );
    expect(sidecar.shotCount).toBe(8);
  });
});
