/**
 * @jest-environment node
 *
 * Stateless verify CLI smoke test.
 *
 * Exports a real bundle from the in-process LedgerService, writes it
 * to a tmpdir, runs `scripts/mcop-ledger-verify.mjs` against it, and
 * asserts the CLI exits 0 with an `OK` line. A second case mutates
 * the bundle's leafHash list and asserts a non-zero exit.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { LedgerService, InMemoryStorageAdapter } from '../ledger';

async function exportBundle(): Promise<string> {
  const svc = new LedgerService({ storage: new InMemoryStorageAdapter() });
  await svc.etch({ tenantId: 't', context: [1, 0], score: 0.4 });
  await svc.etch({ tenantId: 't', context: [0, 1], score: 0.6 });
  const bundle = await svc.exportFullLedger('t');
  return JSON.stringify(bundle);
}

const CLI = path.join(__dirname, '..', '..', 'scripts', 'mcop-ledger-verify.mjs');

describe('scripts/mcop-ledger-verify.mjs', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mcop-ledger-verify-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('verifies a freshly-exported bundle', async () => {
    const file = path.join(dir, 'good.json');
    writeFileSync(file, await exportBundle());
    const result = spawnSync('node', [CLI, '--bundle', file], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK/);
  });

  it('rejects a tampered bundle (forest root mismatch)', async () => {
    const file = path.join(dir, 'bad.json');
    const json = JSON.parse(await exportBundle());
    json.forestRoot = '0'.repeat(64);
    writeFileSync(file, JSON.stringify(json));
    const result = spawnSync('node', [CLI, '--bundle', file], { encoding: 'utf-8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/forest root mismatch/);
  });

  it('rejects a bundle with broken parent chain', async () => {
    const file = path.join(dir, 'chain.json');
    const json = JSON.parse(await exportBundle());
    json.leaves[1].parentHash = '1'.repeat(64);
    // Recompute the forest root so the mismatch is *only* the chain.
    // We deliberately do NOT do that — the chain check is the failure point.
    writeFileSync(file, JSON.stringify(json));
    const result = spawnSync('node', [CLI, '--bundle', file], { encoding: 'utf-8' });
    expect(result.status).toBe(1);
  });

  // Regression: previously the CLI only re-verified the *list of leaf hashes*,
  // so an attacker could mutate any leaf's content (score, context, note,
  // metadata) while leaving the embedded `leafHash` byte-identical and the
  // CLI would still print "OK". This defeats the whole point of using the
  // CLI for air-gapped audits.
  it('rejects a bundle whose leaf content has been forged while leafHash is preserved', async () => {
    const file = path.join(dir, 'forged.json');
    const json = JSON.parse(await exportBundle());
    json.leaves[1].score = 0.99;
    json.leaves[1].note = 'forged-second';
    json.leaves[1].context = [9, 9, 9, 9, 9];
    writeFileSync(file, JSON.stringify(json));
    const result = spawnSync('node', [CLI, '--bundle', file], { encoding: 'utf-8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/leaf hash mismatch|content has been tampered/);
  });

  it('rejects forged audit fields while leafHash is preserved', async () => {
    const file = path.join(dir, 'forged-audit-fields.json');
    const json = JSON.parse(await exportBundle());
    json.leaves[1].sealedAt = '2030-01-01T00:00:00.000Z';
    json.leaves[1].signature = 'attacker-signature';
    writeFileSync(file, JSON.stringify(json));
    const result = spawnSync('node', [CLI, '--bundle', file], { encoding: 'utf-8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/leaf hash mismatch|content has been tampered/);
  });

  it('exits 2 on usage error', () => {
    const result = spawnSync('node', [CLI], { encoding: 'utf-8' });
    expect(result.status).toBe(2);
  });
});
