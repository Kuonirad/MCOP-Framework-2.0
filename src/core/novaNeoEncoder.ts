import { getUniversalCryptoRuntime, sha256Bytes, sha256Hex } from './universalCrypto';
import { ContextTensor, NovaNeoConfig } from './types';
import logger from '../utils/logger';
import { variance as vecVariance } from './vectorMath';
import { defaultEmbeddingBackend, HashingTrickBackend, healDimensions } from './embeddingEngine';
import {
  failTriadSpan,
  finishTriadSpan,
  isTriadTelemetryEnabled,
  startTriadSpan,
} from './observability';

export class NovaNeoEncoder {
  private readonly dimensions: number;
  private readonly normalize: boolean;
  private readonly entropyFloor: number;
  private readonly backend: 'hash' | 'embedding' | 'novaNeoWeb';
  private readonly embedder: HashingTrickBackend;

  constructor(config: NovaNeoConfig) {
    this.dimensions = config.selfHealDimensions === true
      ? healDimensions(config.dimensions)
      : config.dimensions;
    if (this.dimensions <= 0 || !Number.isInteger(this.dimensions)) {
      throw new Error('dimensions must be a positive integer');
    }
    this.normalize = config.normalize ?? false;
    this.entropyFloor = config.entropyFloor ?? 0.0;
    this.backend = config.backend ?? 'hash';
    this.embedder = defaultEmbeddingBackend;
  }

  encode(text: string): ContextTensor {
    const span = startTriadSpan('mcop.triad.encode', {
      'mcop.encoder.backend': this.backend,
      'mcop.encoder.runtime': getUniversalCryptoRuntime(),
      'mcop.encoder.dimensions': this.dimensions,
      'mcop.encoder.normalize': this.normalize,
      'mcop.input.length': text.length,
    });
    try {
      const values = this.backend === 'embedding'
        ? this.embedder.encode(text, this.dimensions, this.normalize)
        : this.encodeHash(text);

      // Observability: Log provenance data for auditability
      // Optimization: Only compute expensive provenance data if debug logging is enabled
      if (typeof logger.isLevelEnabled === 'function' && logger.isLevelEnabled('debug')) {
        logger.debug({
          msg: 'NOVA-NEO Encoding complete',
          provenance: {
            inputLength: text.length,
            dimensions: this.dimensions,
            backend: this.backend,
            runtime: getUniversalCryptoRuntime(),
            entropy: this.estimateEntropy(values),
            // Optimization: Use Float64Array for hashing to avoid slow JSON.stringify overhead on large arrays
            tensorHash: sha256Hex(new Float64Array(values)).substring(0, 8)
          }
        });
      }

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

  /**
   * Legacy SHA-256 deterministic encoding.
   * Extracted as a private method so the `backend` switch is explicit
   * and the hash path remains byte-identical to v1.x.
   */
  private encodeHash(text: string): ContextTensor {
    const hash = sha256Bytes(text);

    // Optimization 1: Pre-calculate signed hash values
    // This avoids recalculating (byte / 255) * 2 - 1 repeatedly in the loop
    const signedHash = new Float64Array(hash.length);
    for (let i = 0; i < hash.length; i++) {
      signedHash[i] = (hash[i] / 255) * 2 - 1;
    }

    // Optimization 2: Pre-allocate the result array
    const values = new Array(this.dimensions);
    const hashLen = hash.length;

    // Optimization 3: Calculate sum of squares analytically to avoid O(N) additions in the loop
    let sumSquares = 0;
    if (this.normalize) {
      let hashSumSquares = 0;
      for (let i = 0; i < hashLen; i++) {
        const v = signedHash[i];
        hashSumSquares += v * v;
      }

      const fullCycles = Math.floor(this.dimensions / hashLen);
      const remainder = this.dimensions % hashLen;

      sumSquares = hashSumSquares * fullCycles;
      for (let i = 0; i < remainder; i++) {
        const v = signedHash[i];
        sumSquares += v * v;
      }
    }

    // Optimization 4: Optimized filling loop
    // Check for power-of-2 length (standard SHA-256 is 32 bytes) for bitwise AND
    if (hashLen === 32) {
      for (let i = 0; i < this.dimensions; i++) {
        values[i] = signedHash[i & 31];
      }
    } /* istanbul ignore next -- defensive: SHA-256 always emits 32 bytes;
         branch retained for future hash-algorithm swaps */ else {
      for (let i = 0; i < this.dimensions; i++) {
        values[i] = signedHash[i % hashLen];
      }
    }

    if (this.normalize) {
      const norm = Math.sqrt(sumSquares) || 1;
      // Optimization 4: In-place normalization to avoid second array allocation from map()
      for (let i = 0; i < this.dimensions; i++) {
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
