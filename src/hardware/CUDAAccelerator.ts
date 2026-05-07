import {
  type AcceleratedResult,
  type Accelerator,
  type AcceleratorProviderKind,
  CPUFallback,
  CUDAProvider,
} from './Accelerator';

export interface SparseGraphLike {
  nodes?: number;
  edges?: unknown;
  nodeFeatures?: unknown;
  toSparseTensor?: () => unknown;
}

export interface CUDAAcceleratorConfig {
  /** Single creator-controlled switch: true = prefer CUDA bridge, false = force CPU. */
  useCUDA?: boolean;
  /** Deployment implementation behind the same logical contract. */
  provider?: Exclude<AcceleratorProviderKind, 'cpu'>;
  endpoint?: string;
  device?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  fallback?: Accelerator;
}

export interface MutationCandidate {
  id?: string;
  vector?: ArrayLike<number>;
  score?: number;
  [key: string]: unknown;
}

export class CUDAAccelerator {
  readonly useCUDA: boolean;
  readonly accelerator: Accelerator;

  constructor(config: CUDAAcceleratorConfig = {}) {
    this.useCUDA = config.useCUDA ?? process.env.MCOP_USE_CUDA === '1';
    this.accelerator = this.useCUDA
      ? new CUDAProvider({
        endpoint: config.endpoint,
        device: config.device,
        provider: config.provider,
        fetchImpl: config.fetchImpl,
        timeoutMs: config.timeoutMs,
        fallback: config.fallback,
      })
      : config.fallback ?? new CPUFallback();
  }

  async encodeWithCUDA(tensor: ArrayLike<number>): Promise<AcceleratedResult<{ output: Float32Array }>> {
    const fallback = Float32Array.from(tensor);
    const accelerated = await this.accelerator.accelerate<{ output?: ArrayLike<number>; tensor?: ArrayLike<number> }>(
      'nova-neo-encode',
      { tensor: Array.from(fallback), dtype: 'float32' },
    );
    return {
      output: toFloat32Array(accelerated.output ?? accelerated.tensor ?? fallback),
      _device: accelerated._device,
      _provenance: accelerated._provenance,
    };
  }

  async propagateProteomeGraphCUDA(
    graph: SparseGraphLike,
    input: ArrayLike<number>,
  ): Promise<AcceleratedResult<{ output: Float32Array }>> {
    const fallback = Float32Array.from(input);
    const accelerated = await this.accelerator.accelerate<{ output?: ArrayLike<number>; input?: ArrayLike<number> }>(
      'proteome-graph-step',
      {
        graph: graph.toSparseTensor ? graph.toSparseTensor() : graph,
        input: Array.from(fallback),
        dtype: 'float32',
      },
    );
    return {
      output: toFloat32Array(accelerated.output ?? accelerated.input ?? fallback),
      _device: accelerated._device,
      _provenance: accelerated._provenance,
    };
  }

  async holographicBatchUpdate(
    context: ArrayLike<number>,
    synthesisVector: ArrayLike<number>,
  ): Promise<AcceleratedResult<{ output: Float32Array }>> {
    const fallback = rankOneProduct(context, synthesisVector);
    const accelerated = await this.accelerator.accelerate<{ output?: ArrayLike<number> }>(
      'holographic-write',
      { context: Array.from(context), synthesisVector: Array.from(synthesisVector), dtype: 'float32' },
    );
    return {
      output: toFloat32Array(accelerated.output ?? fallback),
      _device: accelerated._device,
      _provenance: accelerated._provenance,
    };
  }

  async scoreEvolveMutations(candidates: ReadonlyArray<MutationCandidate>): Promise<AcceleratedResult<{ scores: number[] }>> {
    const fallback = candidates.map((candidate) => Number(candidate.score ?? 0));
    const accelerated = await this.accelerator.accelerate<{ scores?: number[]; candidates?: MutationCandidate[] }>(
      'nova-evolve-score',
      { candidates },
    );
    return {
      scores: accelerated.scores ?? fallback,
      _device: accelerated._device,
      _provenance: accelerated._provenance,
    };
  }

  async metaProject(input: Record<string, unknown>, localProjection: () => number): Promise<AcceleratedResult<{ projectedGain: number }>> {
    if (!this.useCUDA) {
      return this.accelerator.accelerate('meta-dry-run', { projectedGain: localProjection() });
    }
    const accelerated = await this.accelerator.accelerate<{ projectedGain?: number }>('meta-dry-run', input);
    return {
      projectedGain: typeof accelerated.projectedGain === 'number' ? accelerated.projectedGain : localProjection(),
      _device: accelerated._device,
      _provenance: accelerated._provenance,
    };
  }
}

function toFloat32Array(value: ArrayLike<number>): Float32Array {
  return value instanceof Float32Array ? value : Float32Array.from(value);
}

function rankOneProduct(context: ArrayLike<number>, synthesisVector: ArrayLike<number>): Float32Array {
  const rows = context.length;
  const cols = synthesisVector.length;
  const out = new Float32Array(rows * cols);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out[row * cols + col] = context[row] * synthesisVector[col];
    }
  }
  return out;
}
