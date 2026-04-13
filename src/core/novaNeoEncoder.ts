import crypto from 'crypto';
import { ContextTensor, NovaNeoConfig } from './types';
import logger from '../utils/logger';

export class NovaNeoEncoder {
  private readonly dimensions: number;
  private readonly normalize: boolean;
  private readonly entropyFloor: number;

  constructor(config: NovaNeoConfig) {
    if (config.dimensions <= 0) {
      throw new Error('dimensions must be positive');
    }
    this.dimensions = config.dimensions;
    this.normalize = config.normalize ?? false;
    this.entropyFloor = config.entropyFloor ?? 0.0;
  }

  encode(text: string): ContextTensor {
    const hash = crypto.createHash('sha256').update(text).digest();

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
    } else {
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

    // Observability: Log provenance data for auditability
    // Optimization: Only compute expensive provenance data if debug logging is enabled
    if (logger.isLevelEnabled('debug')) {
      logger.debug({
        msg: 'NOVA-NEO Encoding complete',
        provenance: {
          inputLength: text.length,
          dimensions: this.dimensions,
          entropy: this.estimateEntropy(values),
          tensorHash: crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex').substring(0, 8)
        }
      });
    }

    return values;
  }

  estimateEntropy(tensor: ContextTensor): number {
    // Simple entropy-like measure: variance of absolute values
    if (!tensor.length) return 0;
    const mean = tensor.reduce((acc, v) => acc + Math.abs(v), 0) / tensor.length;
    const variance =
      tensor.reduce((acc, v) => acc + Math.pow(Math.abs(v) - mean, 2), 0) /
      tensor.length;
    const entropy = Math.min(1, variance);
    return Math.max(entropy, this.entropyFloor);
  }
}
