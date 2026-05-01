/**
 * Full film production pipeline case study.
 *
 * A runnable, credential-free end-to-end example that routes one feature-film
 * brief through the Universal Adapter Protocol: Utopai writes script scenes,
 * Magnific renders hero frames and shots, a generic adapter produces score
 * stems, and another generic adapter packages the deliverable manifest. Each
 * stage shares one MCOP triad, so continuity and provenance accumulate across
 * the whole production rather than inside isolated vendor calls.
 *
 * Run:
 *   pnpm dlx tsx --tsconfig tsconfig.json examples/full_film_production_pipeline.ts
 */

import { createHash, randomUUID } from 'node:crypto';

import type { ContextTensor } from '../src/core';
import {
  type AdapterResponse,
  type BaseAdapterDeps,
  GenericProductionAdapter,
  type MagnificClient,
  MagnificMCOPAdapter,
  type MagnificGenerationResult,
  type UtopaiSegmentResult,
  type UtopaiClient,
  UtopaiMCOPAdapter,
} from '../src/adapters';

type Department = 'writing' | 'visual' | 'editorial' | 'sound' | 'delivery';

interface ScenePlan {
  readonly sceneId: string;
  readonly slug: string;
  readonly prompt: string;
  readonly pacing: 'slow' | 'medium' | 'fast';
  readonly cameraLanguage: string;
  readonly scoreCue: string;
}

interface ScoreStem {
  readonly stemId: string;
  readonly trackUrl: string;
  readonly bpm: number;
}

interface EditDecisionList {
  readonly edlId: string;
  readonly reelUrl: string;
  readonly shots: readonly string[];
}

interface DeliveryManifest {
  readonly manifestId: string;
  readonly title: string;
  readonly departments: readonly Department[];
  readonly merkleRoots: readonly string[];
  readonly auditReady: boolean;
}

const scenes: readonly ScenePlan[] = [
  {
    sceneId: 'scene-001',
    slug: 'cold-open',
    prompt:
      'Cold open: a glacial archive awakens under aurora light while a lone archivist hears the ocean beneath the ice.',
    pacing: 'slow',
    cameraLanguage: 'wide aerial, low-angle macro inserts, blue-green palette',
    scoreCue: 'sub-bass pulse, glass harmonics, distant whale-song texture',
  },
  {
    sceneId: 'scene-014',
    slug: 'memory-market',
    prompt:
      'Act two: a neon memory market trades crystallized dreams; the archivist follows a corrupted childhood echo.',
    pacing: 'medium',
    cameraLanguage: 'handheld tracking, lens flares, dense rain reflections',
    scoreCue: 'broken synth arpeggio, soft taiko, rising granular choir',
  },
  {
    sceneId: 'scene-031',
    slug: 'tidal-synthesis',
    prompt:
      'Finale: the archive doors open into a moonlit tidal chamber where human memory and machine inference reconcile.',
    pacing: 'slow',
    cameraLanguage: 'crane descent, symmetrical tableau, silver volumetric light',
    scoreCue: 'full strings, restrained brass, resolved harmonic shimmer',
  },
];

const magnificClient: MagnificClient = {
  async textToImage({ prompt, options }) {
    return {
      kind: 'image',
      assetUrl: `case-study://frames/${stableSlug(prompt)}.png`,
      jobId: `frame-${stableSlug(`${prompt}-${options.model ?? 'default'}`)}`,
      raw: { options },
    };
  },
  async textToVideo({ prompt, options }) {
    return {
      kind: 'video',
      assetUrl: `case-study://shots/${stableSlug(prompt)}.mp4`,
      jobId: `shot-${stableSlug(`${prompt}-${options.durationSeconds ?? 8}`)}`,
      estimatedCostEur:
        Math.round((options.durationSeconds ?? 8) * 0.3 * 100) / 100,
      raw: { options },
    };
  },
  async upscale({ sourceAssetUrl, options }) {
    return {
      kind: 'upscale',
      assetUrl: `${sourceAssetUrl ?? 'case-study://missing'}?upscale=${options.scale ?? 2}`,
      raw: { options },
    };
  },
  async videoUpscale({ sourceAssetUrl }) {
    return {
      kind: 'video-upscale',
      assetUrl: `${sourceAssetUrl ?? 'case-study://missing'}?video-upscale=1`,
      raw: {},
    };
  },
};

const utopaiClient: UtopaiClient = {
  async composeSegment({ prompt, options }) {
    const sceneId = options.sceneId ?? `scene-${stableSlug(prompt)}`;
    return {
      segmentId: `script-${sceneId}`,
      script: `[${sceneId}] ${prompt}\nVoice: ${options.voiceStyle ?? 'intimate, precise'}\nPacing: ${options.pacing ?? 'medium'}`,
      storyboardUrl: `case-study://storyboards/${sceneId}.pdf`,
      needsHumanReview: false,
      raw: { options },
    };
  },
};

async function main(): Promise<void> {
  const encoder = new DemoEncoder(96);
  const stigmergy = new DemoStigmergy();
  const etch = new DemoEtch();
  const triad = { encoder, stigmergy, etch } as unknown as BaseAdapterDeps;

  const magnific = new MagnificMCOPAdapter({
    ...triad,
    client: magnificClient,
    maxUpscaleOutputArea: 33_177_600,
    maxCallCostEur: 5,
  });
  const utopai = new UtopaiMCOPAdapter({
    ...triad,
    client: utopaiClient,
    defaultContinuityFloor: 0.25,
  });
  const soundscape = new GenericProductionAdapter<ScoreStem>({
    ...triad,
    platform: 'soundscape',
    capabilities: {
      version: 'case-study-1',
      models: ['score-stem-v1'],
      features: ['cue-sheet', 'stem-generation', 'continuity-aware-audio'],
    },
    async dispatch({ refinedPrompt, request }) {
      return {
        stemId: `stem-${stableSlug(`${request.metadata?.sceneId ?? 'scene'}-${refinedPrompt}`)}`,
        trackUrl: `case-study://audio/${stableSlug(refinedPrompt)}.wav`,
        bpm: request.domain === 'audio' ? 84 : 72,
      };
    },
  });
  const editorial = new GenericProductionAdapter<EditDecisionList>({
    ...triad,
    platform: 'editorial-edl',
    capabilities: {
      version: 'case-study-1',
      models: ['edl-assembler-v1'],
      features: ['rough-cut', 'shot-ordering', 'manifest-export'],
    },
    async dispatch({ refinedPrompt, request }) {
      const shotUrls = toStringList(request.metadata?.shotUrls);
      return {
        edlId: `edl-${stableSlug(refinedPrompt)}`,
        reelUrl: `case-study://edl/${stableSlug(refinedPrompt)}.xml`,
        shots: shotUrls,
      };
    },
  });
  const delivery = new GenericProductionAdapter<DeliveryManifest>({
    ...triad,
    platform: 'festival-delivery',
    capabilities: {
      version: 'case-study-1',
      models: ['delivery-manifest-v1'],
      features: ['audit-package', 'sbom-linked-manifest'],
    },
    async dispatch({ request }) {
      const merkleRoots = toStringList(request.metadata?.merkleRoots);
      return {
        manifestId: `manifest-${stableSlug(request.prompt)}`,
        title: 'The Ice That Remembered Us',
        departments: ['writing', 'visual', 'editorial', 'sound', 'delivery'],
        merkleRoots,
        auditReady: merkleRoots.length >= scenes.length * 4,
      };
    },
  });

  let styleContext: ContextTensor | undefined;
  const scripts: UtopaiSegmentResult[] = [];
  const heroFrames: MagnificGenerationResult[] = [];
  const shots: MagnificGenerationResult[] = [];
  const stems: ScoreStem[] = [];
  const merkleRoots: string[] = [];

  for (const scene of scenes) {
    const script = await utopai.generate({
      prompt: scene.prompt,
      domain: 'narrative',
      styleContext,
      payload: {
        options: {
          sceneId: scene.sceneId,
          pacing: scene.pacing,
          voiceStyle: 'restrained poetic sci-fi',
        },
        continuityFloor: 0.25,
      },
      metadata: metadata('writing', scene),
    });
    scripts.push(script.result);
    merkleRoots.push(script.merkleRoot);

    const frame = await magnific.generateOptimizedImage(
      `${script.result.script}\nVisual language: ${scene.cameraLanguage}`,
      { model: 'mystic-2.5-fluid', resolution: '4k', aspectRatio: '2.39:1' },
      { styleContext, metadata: metadata('visual', scene) },
    );
    heroFrames.push(frame.result);
    merkleRoots.push(frame.merkleRoot);

    const shot = await magnific.generateOptimizedVideo(
      `${scene.cameraLanguage}. Continue from ${frame.result.assetUrl}. ${scene.prompt}`,
      { model: 'seeddance-2.0', durationSeconds: 8, fps: 24 },
      { styleContext, metadata: metadata('visual', scene) },
    );
    shots.push(shot.result);
    merkleRoots.push(shot.merkleRoot);

    const score = await soundscape.generate({
      prompt: `${scene.scoreCue}. Underscore ${script.result.segmentId} and preserve the film motif.`,
      domain: 'audio',
      styleContext,
      metadata: metadata('sound', scene),
    });
    stems.push(score.result);
    merkleRoots.push(score.merkleRoot);

    styleContext = encoder.encode(
      `${script.result.script}\n${frame.result.assetUrl}\n${shot.result.assetUrl}\n${score.result.trackUrl}`,
    );
  }

  const roughCut: AdapterResponse<EditDecisionList> = await editorial.generate({
    prompt:
      'Assemble a three-scene festival rough cut with scene cards, audio stems, and continuity-preserving transitions.',
    domain: 'cinematic',
    styleContext,
    metadata: {
      department: 'editorial',
      shotUrls: shots.map((shot) => shot.assetUrl),
      stemUrls: stems.map((stem) => stem.trackUrl),
    },
  });
  merkleRoots.push(roughCut.merkleRoot);

  const manifest = await delivery.generate({
    prompt:
      'Package The Ice That Remembered Us for buyer screening with complete MCOP provenance.',
    domain: 'generic',
    styleContext,
    metadata: {
      department: 'delivery',
      merkleRoots,
      roughCut: roughCut.result.reelUrl,
    },
  });

  console.log('MCOP full film production case study');
  console.table(
    scenes.map((scene, index) => ({
      scene: scene.sceneId,
      script: scripts[index].segmentId,
      frame: heroFrames[index].assetUrl,
      shot: shots[index].assetUrl,
      score: stems[index].trackUrl,
    })),
  );
  console.log('rough cut:', roughCut.result.reelUrl);
  console.log('delivery manifest:', manifest.result.manifestId);
  console.log('audit ready:', manifest.result.auditReady);
  console.log('final merkle root:', manifest.merkleRoot);
  console.log('stigmergy root:', stigmergy.getMerkleRoot());
}

function metadata(
  department: Exclude<Department, 'delivery' | 'editorial'>,
  scene: ScenePlan,
): Record<string, unknown> {
  return {
    department,
    sceneId: scene.sceneId,
    slug: scene.slug,
    caseStudy: 'full-film-production',
  };
}

function stableSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

class DemoEncoder {
  constructor(private readonly dimensions: number) {}

  encode(text: string): ContextTensor {
    const values = new Array<number>(this.dimensions);
    for (let i = 0; i < this.dimensions; i++) {
      const digest = createHash('sha256')
        .update(`${i}:${text}`)
        .digest();
      values[i] = (digest[0] / 255) * 2 - 1;
    }
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    return norm > 0 ? values.map((value) => value / norm) : values;
  }
}

class DemoStigmergy {
  private readonly traces: Array<{
    id: string;
    hash: string;
    context: ContextTensor;
    synthesisVector: ContextTensor;
    weight: number;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }> = [];

  getResonance(context: ContextTensor) {
    const best = this.traces
      .map((trace) => ({ trace, score: cosine(context, trace.context) }))
      .sort((a, b) => b.score - a.score)[0];
    return best && best.score >= 0.25
      ? { score: best.score, trace: best.trace }
      : { score: 0 };
  }

  recordTrace(
    context: ContextTensor,
    synthesisVector: ContextTensor,
    metadata?: Record<string, unknown>,
  ) {
    const parentHash = this.getMerkleRoot();
    const id = randomUUID();
    const trace = {
      id,
      hash: digest({ id, context, synthesisVector, metadata, parentHash }),
      parentHash,
      context,
      synthesisVector,
      weight: cosine(context, synthesisVector),
      timestamp: new Date().toISOString(),
      metadata,
    };
    this.traces.push(trace);
    return trace;
  }

  getMerkleRoot(): string | undefined {
    return this.traces.at(-1)?.hash;
  }
}

class DemoEtch {
  applyEtch(context: ContextTensor, synthesisVector: ContextTensor, note?: string) {
    const deltaWeight = cosine(context, synthesisVector);
    return {
      hash: digest({ context, synthesisVector, note, deltaWeight }),
      deltaWeight,
      note,
      timestamp: new Date().toISOString(),
    };
  }
}

function cosine(a: ContextTensor, b: ContextTensor): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
  return denom > 0 ? dot / denom : 0;
}

function digest(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
