import { canonicalDigest } from '../core/canonicalEncoding';

export type AcceleratorMode = 'cpu' | 'cuda';

export type AcceleratedOperation =
  | 'nova-neo-encode'
  | 'proteome-graph-step'
  | 'holographic-write'
  | 'meta-dry-run'
  | 'nova-evolve-score';

export type AcceleratorProviderKind = 'cpu' | 'microservice' | 'onnx' | 'native';

export interface AcceleratorCapabilities {
  cudaAvailable: boolean;
  webGPUAvailable: boolean;
  deviceName: string;
  computeCapability: string;
  mode: AcceleratorMode;
  device: string;
  provider: AcceleratorProviderKind;
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

export interface CUDAProbeResult {
  available: boolean;
  deviceName?: string;
  computeCapability?: string;
  device?: string;
}

export interface DetectCUDAOptions {
  useCUDA?: boolean;
  device?: string;
  provider?: AcceleratorProviderKind;
  probe?: () => Promise<CUDAProbeResult | null | undefined>;
}

export interface CUDAProviderOptions {
  endpoint?: string;
  device?: string;
  provider?: Exclude<AcceleratorProviderKind, 'cpu'>;
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
      webGPUAvailable: detectWebGPU(),
      deviceName: 'CPU fallback',
      computeCapability: 'n/a',
      mode: this.mode,
      device: this.device,
      provider: 'cpu',
    };
  }
}

export class CUDAProvider implements Accelerator {
  readonly mode = 'cuda' as const;
  readonly device: string;
  private readonly endpoint: string;
  private readonly provider: Exclude<AcceleratorProviderKind, 'cpu'>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly fallback: Accelerator;

  constructor(options: CUDAProviderOptions = {}) {
    this.device = options.device ?? process.env.MCOP_CUDA_DEVICE ?? 'cuda:0';
    this.endpoint = (options.endpoint ?? process.env.MCOP_CUDA_ENDPOINT ?? 'http://localhost:8765').replace(/\/$/, '');
    this.provider = options.provider ?? 'microservice';
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
        body: JSON.stringify({ input, device: this.device, provider: this.provider }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`CUDA provider returned HTTP ${response.status}`);
      const payload = await response.json() as T;
      return attachAcceleratorProvenance<T>(payload, {
        op,
        mode: this.mode,
        device: this.device,
        provider: `CUDAProvider:${this.provider}`,
        cudaGraphCaptured: true,
      });
    } catch (error) {
      const fallback = await this.fallback.accelerate<T>(op, input);
      return attachAcceleratorProvenance<T>(stripAcceleratorFields(fallback) as T, {
        op,
        mode: this.fallback.mode,
        device: this.fallback.device,
        provider: `CUDAProvider:${this.provider}→CPUFallback`,
        fallback: true,
        fallbackReason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async getCapabilities(): Promise<AcceleratorCapabilities> {
    return detectCUDA({ device: this.device, provider: this.provider });
  }
}

export async function detectCUDA(options: DetectCUDAOptions = {}): Promise<AcceleratorCapabilities> {
  const device = options.device ?? process.env.MCOP_CUDA_DEVICE ?? 'cuda:0';
  const provider = options.provider ?? 'microservice';
  if (options.useCUDA === false || process.env.MCOP_ACCELERATOR === 'cpu' || process.env.MCOP_USE_CUDA === '0') {
    return cpuCapabilities('CPU forced by accelerator configuration');
  }

  const probed = options.probe ? await options.probe() : undefined;
  if (probed?.available === true) {
    return {
      cudaAvailable: true,
      webGPUAvailable: detectWebGPU(),
      deviceName: probed.deviceName ?? 'CUDA device',
      computeCapability: probed.computeCapability ?? 'unknown',
      mode: 'cuda',
      device: probed.device ?? device,
      provider,
    };
  }

  const visibleDevices = process.env.CUDA_VISIBLE_DEVICES;
  const envClaimsCUDA = process.env.MCOP_CUDA_AVAILABLE === '1'
    || (visibleDevices !== undefined && visibleDevices !== '' && visibleDevices !== '-1');
  if (envClaimsCUDA || options.useCUDA === true) {
    return {
      cudaAvailable: true,
      webGPUAvailable: detectWebGPU(),
      deviceName: process.env.MCOP_CUDA_DEVICE_NAME ?? 'CUDA device',
      computeCapability: process.env.MCOP_CUDA_COMPUTE_CAPABILITY ?? 'unknown',
      mode: 'cuda',
      device,
      provider,
    };
  }

  return cpuCapabilities(detectWebGPU() ? 'CPU fallback (WebGPU available)' : 'CPU fallback');
}

export async function createDefaultAccelerator(options: DetectCUDAOptions & CUDAProviderOptions = {}): Promise<Accelerator> {
  const capabilities = await detectCUDA(options);
  if (capabilities.cudaAvailable) {
    return new CUDAProvider({
      endpoint: options.endpoint,
      device: capabilities.device,
      provider: capabilities.provider === 'cpu' ? 'microservice' : capabilities.provider,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      fallback: options.fallback,
    });
  }
  return options.fallback ?? new CPUFallback();
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

function cpuCapabilities(deviceName: string): AcceleratorCapabilities {
  return {
    cudaAvailable: false,
    webGPUAvailable: detectWebGPU(),
    deviceName,
    computeCapability: 'n/a',
    mode: 'cpu',
    device: 'cpu',
    provider: 'cpu',
  };
}

function detectWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
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
