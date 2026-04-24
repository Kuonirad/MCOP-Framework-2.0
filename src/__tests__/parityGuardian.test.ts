/**
 * @jest-environment node
 *
 * Cross-Language Parity Guardian — TypeScript side.
 *
 * Runs the TS fingerprint CLI and asserts the outputs match locked-in
 * reference hashes that also live in ``mcop_package/tests/test_triad_parity.py``.
 * Any drift — in either language — fails this test AND the pytest
 * counterpart, making drift impossible to ship.
 */

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'scripts', 'triad-fingerprint.mjs');

function runFingerprint(text: string, dimensions: number, normalize: boolean) {
  const args = [CLI, text, '--dimensions', String(dimensions)];
  if (normalize) args.push('--normalize');
  const out = execFileSync('node', args, { encoding: 'utf8' });
  return JSON.parse(out);
}

describe('Cross-Language Parity Guardian (TS reference fingerprints)', () => {
  it('hello-triad / 16 / normalized matches the locked reference', () => {
    const result = runFingerprint('hello triad', 16, true);
    expect(result.tensor_sha256).toBe(
      '5b5443c7cfae197f7b7eb1cafa8b078f215fdc093676feab672271f7a9850c2d',
    );
  });

  it('hello-triad / 16 / raw matches the locked reference', () => {
    const result = runFingerprint('hello triad', 16, false);
    expect(result.tensor_sha256).toBe(
      '13a79080e74dc24c83abbbd68a3749d1a455d47db0436e8eb309b9ddb20aadc7',
    );
  });

  it('CLI emits all required fields', () => {
    const result = runFingerprint('mcop', 32, true);
    expect(result).toHaveProperty('input', 'mcop');
    expect(result).toHaveProperty('dimensions', 32);
    expect(result).toHaveProperty('normalized', true);
    expect(typeof result.entropy).toBe('number');
    expect(result.tensor_sha256).toHaveLength(64);
  });
});
