/**
 * Long-form video pipeline — end-to-end demo.
 *
 * Wires {@link LongFormVideoOrchestrator} around a stub adapter that
 * simulates a Magnific/Veo/Wan-style clip generator. Run with:
 *
 *   npx ts-node examples/long_form_video_pipeline.ts
 *
 * The MemoryPack/Direct Forcing analogue lives in
 * `examples/memorypack_direct_forcing.py`; here we demonstrate how its
 * memory-chain semantics surface at the orchestration layer.
 */

import {
  HolographicEtch,
  LongFormVideoOrchestrator,
  NovaNeoEncoder,
  StigmergyV5,
  SynthesisProvenanceTracer,
  type VideoClipAdapter,
  type VideoClipInput,
  type VideoClipOutput,
} from '../src/core';

class DemoAdapter implements VideoClipAdapter {
  async generateClip(input: VideoClipInput): Promise<VideoClipOutput> {
    // Production: swap for MagnificMCOPAdapter.generateOptimizedVideo(...)
    return {
      assetUrl: `https://demo.local/clip-${input.clipIndex}.mp4`,
    };
  }
}

async function main(): Promise<void> {
  const encoder = new NovaNeoEncoder({ dimensions: 128, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.05, maxTraces: 256 });
  const etch = new HolographicEtch({ confidenceFloor: 0 });
  const tracer = new SynthesisProvenanceTracer(encoder, stigmergy, etch);

  const orchestrator = new LongFormVideoOrchestrator({
    adapter: new DemoAdapter(),
    tracer,
    stigmergy,
    etch,
  });

  const result = await orchestrator.generate(
    'A woman walks through a crystalline desert at dusk; bioluminescent fauna ' +
      'emerge from beneath the sand as twin moons rise.',
    { totalDurationSec: 180, clipDurationSec: 30 },
  );

  console.log(`Generated ${result.clips.length} clips`);
  for (const clip of result.clips) {
    console.log(
      `  [${clip.clipIndex}] resonance=${clip.resonance.toFixed(3)} ` +
        `root=${clip.provenanceRoot.slice(0, 16)}…  ${clip.assetUrl}`,
    );
  }
  console.log(`final merkle root: ${result.finalRoot}`);
  console.log(`verify():`, orchestrator.verify());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
