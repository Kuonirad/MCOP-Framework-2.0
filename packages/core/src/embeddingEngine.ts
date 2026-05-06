import { readUInt32LE, sha256Bytes } from './universalCrypto';
import type { ContextTensor } from './types';

/**
 * EmbeddingEngine — deterministic, dependency-free semantic vectorisation
 * via the hashing trick (feature hashing with signed n-gram projections).
 *
 * Why this instead of a neural embedding model:
 *   - Zero runtime dependencies (no ONNX, no download, no GPU).
 *   - Fully deterministic: same text → same vector, across platforms.
 *   - Semantic-ish: shared words/phrases produce correlated activations.
 *   - Cheap: O(tokens) with simple integer hashing.
 *
 * How it works:
 *   1. Tokenise text into word-unigrams and character n-grams (n = 2..4).
 *   2. Each n-gram is hashed (portable SHA-256) → two bucket indices + signed weight.
 *   3. Accumulate weights into a dense Float64 vector of `dimensions` length.
 *   4. L2-normalise if requested.
 *
 * This is the same technique used in Vowpal Wabbit, sklearn's HashingVectorizer,
 * and Facebook's original fastText prototype. It trades some representational
 * fidelity for determinism, speed, and zero external weight files.
 *
 * Future backends (onnx, sentence-transformers) can implement the same
 * `IEmbeddingBackend` interface and be swapped in via NovaNeoConfig.
 */

export interface DimensionHealingEvent {
  requestedDimensions: number;
  healedDimensions: number;
  reason: 'non-positive' | 'non-integer' | 'unsafe';
  timestamp: string;
}

export interface IEmbeddingBackend {
  encode(text: string, dimensions: number, normalize: boolean): ContextTensor;
  getLastDimensionHealing?(): DimensionHealingEvent | undefined;
}

/** Tokenisation constants — tuned for short prompts typical in MCOP flows. */
const MIN_NGRAM_N = 2;
const MAX_NGRAM_N = 4;

/**
 * Extract word tokens and character n-grams from `text`.
 *
 * Word tokens capture vocabulary overlap.
 * Character n-grams capture morphology and typo resilience.
 */
function extractFeatures(text: string): string[] {
  const normalised = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')   // strip punctuation, keep letters+nums
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalised) return [];

  const words = normalised.split(' ').filter(Boolean);
  const features: string[] = [...words];

  // Character n-grams for each word (captures prefixes, suffixes, stems)
  for (const word of words) {
    if (word.length < MIN_NGRAM_N) continue;
    const limit = Math.min(word.length, MAX_NGRAM_N);
    for (let n = MIN_NGRAM_N; n <= limit; n++) {
      for (let i = 0; i <= word.length - n; i++) {
        features.push(word.slice(i, i + n));
      }
    }
  }

  return features;
}

/**
 * Deterministic n-gram feature hashing with dual-projection signing.
 *
 * Each feature hashes to:
 *   - primary bucket:   hash[0..3] mod dimensions
 *   - secondary bucket: hash[4..7] mod dimensions
 *   - weight magnitude: (hash[8] / 255) * 2 - 1 (signed, in [-1, 1])
 *
 * Two buckets per feature reduces collision noise (variance ~ 1/dimensions
 * instead of 1/√dimensions). Signed weights preserve directional meaning.
 */
export class HashingTrickBackend implements IEmbeddingBackend {
  private lastHealing: DimensionHealingEvent | undefined;

  encode(text: string, dimensions: number, normalize: boolean): ContextTensor {
    const safeDimensions = healDimensions(dimensions);
    this.lastHealing = safeDimensions === dimensions
      ? undefined
      : {
        requestedDimensions: dimensions,
        healedDimensions: safeDimensions,
        reason: Number.isInteger(dimensions) ? 'non-positive' : 'non-integer',
        timestamp: new Date().toISOString(),
      };
    const features = extractFeatures(text);
    const vec = new Float64Array(safeDimensions);

    for (const feature of features) {
      const hash = sha256Bytes(feature);

      const primary = readUInt32LE(hash, 0) % safeDimensions;
      const secondary = readUInt32LE(hash, 4) % safeDimensions;
      const weight = (hash[8] / 255) * 2 - 1;

      // Distribute weight across two buckets to reduce single-bucket collisions
      vec[primary] += weight;
      vec[secondary] += weight * 0.3; // attenuated secondary hit
    }

    const values = Array.from(vec);

    if (normalize) {
      const norm = Math.sqrt(values.reduce((acc, v) => acc + v * v, 0)) || 1;
      for (let i = 0; i < safeDimensions; i++) {
        values[i] /= norm;
      }
    }

    return values;
  }

  getLastDimensionHealing(): DimensionHealingEvent | undefined {
    return this.lastHealing;
  }
}

export function healDimensions(dimensions: number): number {
  if (Number.isInteger(dimensions) && dimensions > 0) return dimensions;
  const base = Number.isFinite(dimensions) && dimensions > 0
    ? Math.ceil(dimensions)
    : 1;
  return nearestSafePowerOfTwo(base);
}

function nearestSafePowerOfTwo(value: number): number {
  let power = 1;
  while (power < value && power < 2 ** 30) power *= 2;
  return power;
}

/** Singleton instance — stateless, safe to reuse. */
export const defaultEmbeddingBackend = new HashingTrickBackend();
