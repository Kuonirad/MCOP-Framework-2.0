import { getUniversalCryptoRuntime, sha256Bytes, sha256Hex } from './universalCrypto';
import { ContextTensor, NovaNeoConfig } from './types';
import logger from '../utils/logger';
import { variance as vecVariance } from './vectorMath';
import {
  defaultEmbeddingBackend,
  healDimensions,
  type IAsyncEmbeddingBackend,
  type IEmbeddingBackend,
} from './embeddingEngine';
import {
  failTriadSpan,
  finishTriadSpan,
  isTriadTelemetryEnabled,
  startTriadSpan,
} from './observability';

export class NovaNeoEncoder {
  private readonly _dimensions: number;
  private readonly _normalize: boolean;
  private readonly entropyFloor: number;
  private readonly _backend: 'hash' | 'embedding' | 'novaNeoWeb';
  private readonly embedder: IEmbeddingBackend | IAsyncEmbeddingBackend;

  /**
   * Public, read-only access to the configured tensor dimensionality.
   */
  public get dimensions(): number {
    return this._dimensions;
  }

  /**
   * Whether this encoder applies L2 normalization to output tensors.
   */
  public get normalize(): boolean {
    return this._normalize;
  }

  /**
   * The encoding backend in use ('hash', 'embedding', or 'novaNeoWeb').
   */
  public get backend(): 'hash' | 'embedding' | 'novaNeoWeb' {
    return this._backend;
  }

  constructor(config: NovaNeoConfig) {
    this._dimensions = config.selfHealDimensions === true
      ? healDimensions(config.dimensions)
      : config.dimensions;
    if (this._dimensions <= 0 || !Number.isInteger(this._dimensions)) {
      throw new Error('dimensions must be a positive integer');
    }
    this._normalize = config.normalize ?? false;
    this.entropyFloor = config.entropyFloor ?? 0.0;
    this._backend = config.backend ?? 'hash';
    this.embedder = config.embeddingBackend ?? defaultEmbeddingBackend;
  }

  encode(text: string): ContextTensor {
    const span = startTriadSpan('mcop.triad.encode', {
      'mcop.encoder.backend': this._backend,
      'mcop.encoder.runtime': getUniversalCryptoRuntime(),
      'mcop.encoder.dimensions': this._dimensions,
      'mcop.encoder.normalize': this._normalize,
      'mcop.input.length': text.length,
    });
    try {
      const values = this._backend === 'embedding'
        ? this.encodeEmbeddingSync(text)
        : this.encodeHash(text);

      this.logDebugProvenance(text, values);

      finishTriadSpan(span, {
        'mcop.tensor.dimensions': values.length,
        'mcop.tensor.entropy': isTriadTelemetryEnabled()
          ? this.estimateEntropy(values)
          : undefined,
      });
      return values;
    } catch (error) {
      failTriadSpan(span, error);
      throw error;
    }
  }

  async encodeAsync(text: string): Promise<ContextTensor> {
    if (this._backend !== 'embedding') return this.encode(text);
    const span = startTriadSpan('mcop.triad.encode', {
      'mcop.encoder.backend': this._backend,
      'mcop.encoder.runtime': getUniversalCryptoRuntime(),
      'mcop.encoder.dimensions': this._dimensions,
      'mcop.encoder.normalize': this._normalize,
      'mcop.input.length': text.length,
    });
    try {
      const values = hasEncodeAsync(this.embedder)
        ? await this.embedder.encodeAsync(text, this._dimensions, this._normalize)
        : this.embedder.encode(text, this._dimensions, this._normalize);
      this.logDebugProvenance(text, values);
      finishTriadSpan(span, {
        'mcop.tensor.dimensions': values.length,
        'mcop.tensor.entropy': isTriadTelemetryEnabled()
          ? this.estimateEntropy(values)
          : undefined,
      });
      return values;
    } catch (error) {
      failTriadSpan(span, error);
      throw error;
    }
  }

  private encodeEmbeddingSync(text: string): ContextTensor {
    if (hasEncodeAsync(this.embedder) && !hasEncode(this.embedder)) {
      throw new Error('Configured embedding backend is asynchronous; use NovaNeoEncoder.encodeAsync().');
    }
    return this.embedder.encode(text, this._dimensions, this._normalize);
  }

  private logDebugProvenance(text: string, values: ContextTensor): void {
    if (typeof logger.isLevelEnabled !== 'function' || !logger.isLevelEnabled('debug')) return;
    logger.debug({
      msg: 'NOVA-NEO Encoding complete',
      provenance: {
        inputLength: text.length,
        dimensions: this._dimensions,
        backend: this._backend,
        runtime: getUniversalCryptoRuntime(),
        entropy: this.estimateEntropy(values),
        tensorHash: sha256Hex(new Float64Array(values)).substring(0, 8)
      }
    });
  }

  /**
   * Legacy SHA-256 deterministic encoding.
   * Extracted as a private method so the `backend` switch is explicit
   * and the hash path remains byte-identical to v1.x.
   */
  private encodeHash(text: string): ContextTensor {
    const hash = sha256Bytes(text);

    const signedHash = new Float64Array(hash.length);
    for (let i = 0; i < hash.length; i++) {
      signedHash[i] = (hash[i] / 255) * 2 - 1;
    }

    const values = new Array(this._dimensions);
    const hashLen = hash.length;

    let sumSquares = 0;
    if (this._normalize) {
      let hashSumSquares = 0;
      for (let i = 0; i < hashLen; i++) {
        const v = signedHash[i];
        hashSumSquares += v * v;
      }

      const fullCycles = Math.floor(this._dimensions / hashLen);
      const remainder = this._dimensions % hashLen;

      sumSquares = hashSumSquares * fullCycles;
      for (let i = 0; i < remainder; i++) {
        const v = signedHash[i];
        sumSquares += v * v;
      }
    }

    if (hashLen === 32) {
      for (let i = 0; i < this._dimensions; i++) {
        values[i] = signedHash[i & 31];
      }
    } /* istanbul ignore next -- defensive: SHA-256 always emits 32 bytes;
         branch retained for future hash-algorithm swaps */ else {
      for (let i = 0; i < this._dimensions; i++) {
        values[i] = signedHash[i % hashLen];
      }
    }

    if (this._normalize) {
      const norm = Math.sqrt(sumSquares) || 1;
      for (let i = 0; i < this._dimensions; i++) {
        values[i] /= norm;
      }
    }

    return values;
  }

  estimateEntropy(tensor: ContextTensor): number {
    if (!tensor.length) return 0;
    // Delegates to VectorMath.variance for zero-duplication math.
    const entropy = Math.min(1, vecVariance(tensor));
    return Math.max(entropy, this.entropyFloor);
  }
}
/**
 * UniversalEncoder — first-class edge/browser facade.
 *
 * `NovaNeoWeb` is intentionally byte-identical to the legacy hash backend but
 * routes through the portable SHA-256 substrate, so browser, edge, and Node
 * clients can share deterministic tensors without Node-only globals.
 */
export class UniversalEncoder extends NovaNeoEncoder {
  constructor(config: Omit<NovaNeoConfig, 'backend'>) {
    super({ ...config, backend: 'novaNeoWeb' });
  }
}

export const NovaNeoWeb = UniversalEncoder;

function hasEncodeAsync(
  backend: IEmbeddingBackend | IAsyncEmbeddingBackend,
): backend is IAsyncEmbeddingBackend {
  return typeof (backend as IAsyncEmbeddingBackend).encodeAsync === 'function';
}

function hasEncode(
  backend: IEmbeddingBackend | IAsyncEmbeddingBackend,
): backend is IEmbeddingBackend {
  return typeof (backend as IEmbeddingBackend).encode === 'function';
}
