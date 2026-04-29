import { createHash } from 'node:crypto';
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
 *   2. Each n-gram is hashed (SHA-256) → two bucket indices + signed weight.
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

export interface IEmbeddingBackend {
  encode(text: string, dimensions: number, normalize: boolean): ContextTensor;
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
 * Read a little-endian uint32 from the first `buf.length` bytes.
 * Falls back safely if buf is short.
 */
function readUInt32LE(buf: Buffer, offset: number): number {
  if (offset + 4 <= buf.length) {
    return buf.readUInt32LE(offset);
  }
  let val = 0;
  for (let i = 0; i < Math.min(4, buf.length - offset); i++) {
    val |= buf[offset + i] << (i * 8);
  }
  return val >>> 0; // force unsigned
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
  encode(text: string, dimensions: number, normalize: boolean): ContextTensor {
    const features = extractFeatures(text);
    const vec = new Float64Array(dimensions);

    for (const feature of features) {
      const hash = createHash('sha256').update(feature).digest();

      const primary = readUInt32LE(hash, 0) % dimensions;
      const secondary = readUInt32LE(hash, 4) % dimensions;
      const weight = (hash[8] / 255) * 2 - 1;

      // Distribute weight across two buckets to reduce single-bucket collisions
      vec[primary] += weight;
      vec[secondary] += weight * 0.3; // attenuated secondary hit
    }

    const values = Array.from(vec);

    if (normalize) {
      const norm = Math.sqrt(values.reduce((acc, v) => acc + v * v, 0)) || 1;
      for (let i = 0; i < dimensions; i++) {
        values[i] /= norm;
      }
    }

    return values;
  }
}

/** Singleton instance — stateless, safe to reuse. */
export const defaultEmbeddingBackend = new HashingTrickBackend();
