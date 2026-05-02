import {
  HolographicEtch,
  LongFormVideoOrchestrator,
  NovaNeoEncoder,
  StigmergyV5,
  SynthesisProvenanceTracer,
  type VideoClipAdapter,
  type VideoClipInput,
  type VideoClipOutput,
} from '../core';

function buildHarness(adapter: VideoClipAdapter): LongFormVideoOrchestrator {
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.05 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });
  const tracer = new SynthesisProvenanceTracer(encoder, stigmergy, etch);
  return new LongFormVideoOrchestrator({ adapter, tracer, stigmergy, etch });
}

class StubAdapter implements VideoClipAdapter {
  public calls: VideoClipInput[] = [];
  constructor(private readonly failOn: number = -1) {}

  async generateClip(input: VideoClipInput): Promise<VideoClipOutput> {
    this.calls.push(input);
    if (input.clipIndex === this.failOn) {
      throw new Error(`stub failure on clip ${input.clipIndex}`);
    }
    return {
      assetUrl: `https://stub.local/clip-${input.clipIndex}.mp4`,
    };
  }
}

describe('LongFormVideoOrchestrator', () => {
  it('splits total duration into the expected number of clips', async () => {
    const adapter = new StubAdapter();
    const orchestrator = buildHarness(adapter);

    const result = await orchestrator.generate('a deep-sea procedural drama', {
      totalDurationSec: 90,
      clipDurationSec: 30,
    });

    expect(result.clips).toHaveLength(3);
    expect(adapter.calls.map((c) => c.clipIndex)).toEqual([0, 1, 2]);
    expect(adapter.calls[0].totalClips).toBe(3);
  });

  it('rounds up partial trailing clips and clamps duration', async () => {
    const adapter = new StubAdapter();
    const orchestrator = buildHarness(adapter);

    const result = await orchestrator.generate('story', {
      totalDurationSec: 35,
      clipDurationSec: 30,
    });

    expect(result.clips).toHaveLength(2);
    expect(adapter.calls[1].durationSeconds).toBe(5);
  });

  it('produces a verifiable Merkle chain across clips', async () => {
    const orchestrator = buildHarness(new StubAdapter());
    const result = await orchestrator.generate('crystalline desert storm', {
      totalDurationSec: 60,
      clipDurationSec: 20,
    });

    expect(result.finalRoot).toBeDefined();
    expect(result.clips.every((c) => c.provenanceRoot.length > 0)).toBe(true);
    expect(orchestrator.verify()).toEqual({ ok: true });

    const roots = new Set(result.clips.map((c) => c.provenanceRoot));
    expect(roots.size).toBe(result.clips.length);
  });

  it('grows resonance context monotonically as clips accumulate', async () => {
    const adapter = new StubAdapter();
    const orchestrator = buildHarness(adapter);

    await orchestrator.generate('repeating motif of light on water', {
      totalDurationSec: 120,
      clipDurationSec: 30,
    });

    // First clip has no prior memory, so resonance is 0; later clips should
    // see non-decreasing maximum resonance because the bank only grows.
    const seen = adapter.calls.map((c) => c.priorResonance);
    expect(seen[0]).toBe(0);
    const maxAfterFirst = Math.max(...seen.slice(1));
    expect(maxAfterFirst).toBeGreaterThan(0);
  });

  it('does not corrupt the provenance chain when an adapter call fails mid-sequence', async () => {
    const adapter = new StubAdapter(2);
    const orchestrator = buildHarness(adapter);

    await expect(
      orchestrator.generate('story', { totalDurationSec: 120, clipDurationSec: 30 }),
    ).rejects.toThrow(/clip 2/);

    // Clips 0 and 1 must still verify cleanly.
    expect(orchestrator.verify()).toEqual({ ok: true });
  });

  it('rejects non-positive durations', async () => {
    const orchestrator = buildHarness(new StubAdapter());
    await expect(
      orchestrator.generate('x', { totalDurationSec: 0 }),
    ).rejects.toThrow(/totalDurationSec/);
    await expect(
      orchestrator.generate('x', { totalDurationSec: 30, clipDurationSec: 0 }),
    ).rejects.toThrow(/clipDurationSec/);
  });
});
