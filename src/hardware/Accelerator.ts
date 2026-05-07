import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { canonicalDigest } from '../core/canonicalEncoding';

const execFileAsync = promisify(execFile);

export type AcceleratorMode = 'cpu' | 'cuda';

export type AcceleratedOperation =
  | 'nova-neo-encode'
  | 'proteome-graph-step'
  | 'holographic-write'
  | 'meta-dry-run'
  | 'nova-evolve-score';

export interface AcceleratorCapabilities {
  cudaAvailable: boolean;
  deviceName: string;
  computeCapability: string;
  mode: AcceleratorMode;
  device: string;
}

export interface AcceleratorProvenance {
  device: string;
  mode: AcceleratorMode;
  kernel: AcceleratedOperation;
  provider: string;
  merkleRoot: string;
  timestamp: string;
  fallback?: boolean;
  fallbackReason?: string;
  cudaGraphCaptured?: boolean;
}

export type AcceleratedResult<T> = T & {
  _device: string;
  _provenance: AcceleratorProvenance;
};

export interface Accelerator {
  readonly mode: AcceleratorMode;
  readonly device: string;
  accelerate<T>(op: AcceleratedOperation, input: unknown): Promise<AcceleratedResult<T>>;
  getCapabilities(): Promise<AcceleratorCapabilities>;
}

export interface CUDAProviderOptions {
  endpoint?: string;
  device?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  fallback?: Accelerator;
}

export interface CPUFallbackOptions {
  device?: string;
}

export class CPUFallback implements Accelerator {
  readonly mode = 'cpu' as const;
  readonly device: string;

  constructor(options: CPUFallbackOptions = {}) {
    this.device = options.device ?? 'cpu';
  }

  async accelerate<T>(op: AcceleratedOperation, input: unknown): Promise<AcceleratedResult<T>> {
    return attachAcceleratorProvenance<T>(input as T, {
      op,
      mode: this.mode,
      device: this.device,
      provider: 'CPUFallback',
      fallback: true,
      fallbackReason: 'cpu-path',
    });
  }

  async getCapabilities(): Promise<AcceleratorCapabilities> {
    return {
      cudaAvailable: false,
      deviceName: 'CPU fallback',
      computeCapability: 'n/a',
      mode: this.mode,
      device: this.device,
    };
  }
}

export class CUDAProvider implements Accelerator {
  readonly mode = 'cuda' as const;
  readonly device: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly fallback: Accelerator;

  constructor(options: CUDAProviderOptions = {}) {
    this.device = options.device ?? process.env.MCOP_CUDA_DEVICE ?? 'cuda:0';
    this.endpoint = (options.endpoint ?? process.env.MCOP_CUDA_ENDPOINT ?? 'http://localhost:8765').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, options.timeoutMs ?? Number(process.env.MCOP_CUDA_TIMEOUT_MS ?? 750));
    this.fallback = options.fallback ?? new CPUFallback();
  }

  async accelerate<T>(op: AcceleratedOperation, input: unknown): Promise<AcceleratedResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.endpoint}/cuda/${op}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, device: this.device }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`CUDA provider returned HTTP ${response.status}`);
      const payload = await response.json() as T;
      return attachAcceleratorProvenance<T>(payload, {
        op,
        mode: this.mode,
        device: this.device,
        provider: 'CUDAProvider',
        cudaGraphCaptured: true,
      });
    } catch (error) {
      const fallback = await this.fallback.accelerate<T>(op, input);
      return attachAcceleratorProvenance<T>(stripAcceleratorFields(fallback) as T, {
        op,
        mode: this.fallback.mode,
        device: this.fallback.device,
        provider: 'CUDAProvider→CPUFallback',
        fallback: true,
        fallbackReason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async getCapabilities(): Promise<AcceleratorCapabilities> {
    return detectCUDA(this.device);
  }
}

export async function detectCUDA(device = process.env.MCOP_CUDA_DEVICE ?? 'cuda:0'): Promise<AcceleratorCapabilities> {
  if (process.env.MCOP_ACCELERATOR === 'cpu') {
    return {
      cudaAvailable: false,
      deviceName: 'CPU forced by MCOP_ACCELERATOR=cpu',
      computeCapability: 'n/a',
      mode: 'cpu',
      device: 'cpu',
    };
  }

  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,compute_cap',
      '--format=csv,noheader',
      '-i',
      device.replace('cuda:', ''),
    ], { timeout: 750 });
    const [name = 'CUDA device', capability = 'unknown'] = stdout.trim().split(',').map((part) => part.trim());
    return {
      cudaAvailable: true,
      deviceName: name,
      computeCapability: capability,
      mode: 'cuda',
      device,
    };
  } catch {
    return {
      cudaAvailable: false,
      deviceName: 'CPU fallback',
      computeCapability: 'n/a',
      mode: 'cpu',
      device: 'cpu',
    };
  }
}

export async function createDefaultAccelerator(): Promise<Accelerator> {
  const capabilities = await detectCUDA();
  if (capabilities.cudaAvailable) return new CUDAProvider({ device: capabilities.device });
  return new CPUFallback();
}

export function attachAcceleratorProvenance<T>(
  payload: T,
  options: {
    op: AcceleratedOperation;
    mode: AcceleratorMode;
    device: string;
    provider: string;
    fallback?: boolean;
    fallbackReason?: string;
    cudaGraphCaptured?: boolean;
  },
): AcceleratedResult<T> {
  const timestamp = new Date().toISOString();
  const provenanceWithoutRoot = {
    device: options.device,
    mode: options.mode,
    kernel: options.op,
    provider: options.provider,
    timestamp,
    fallback: options.fallback,
    fallbackReason: options.fallbackReason,
    cudaGraphCaptured: options.cudaGraphCaptured,
  };
  const merkleRoot = canonicalDigest({ type: 'MCOP_ACCELERATOR_PROVENANCE', provenance: provenanceWithoutRoot, payload });
  const provenance: AcceleratorProvenance = { ...provenanceWithoutRoot, merkleRoot };

  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), _device: options.device, _provenance: provenance } as AcceleratedResult<T>;
  }

  return { value: payload, _device: options.device, _provenance: provenance } as unknown as AcceleratedResult<T>;
}

function stripAcceleratorFields(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const { _device, _provenance, ...rest } = value as Record<string, unknown>;
    void _device;
    void _provenance;
    return rest;
  }
  return value;
}
