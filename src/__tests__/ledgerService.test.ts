/**
 * Hosted Provenance Ledger — end-to-end coverage.
 *
 * Asserts the four documented audit invariants:
 *   1. Etches produce self-verifying receipts.
 *   2. The forest root is byte-stable for an identical leaf sequence
 *      (different timestamps notwithstanding) when caller-supplied
 *      `now`/`uuid` hooks are pinned.
 *   3. `verifyBundle()` is stateless — it works against any
 *      caller-supplied export without trusting the operator.
 *   4. Tenant isolation: leaves under one tenant never appear in
 *      another tenant's forest.
 */

import {
  InMemoryStorageAdapter,
  LedgerService,
  LedgerClientFactory,
  createLedgerClient,
} from '../ledger';
import type { EtchReceipt, LedgerExportBundle } from '../ledger';

function deterministic() {
  let n = 0;
  return new LedgerService({
    storage: new InMemoryStorageAdapter(),
    now: () => new Date(Date.UTC(2026, 4, 18, 5, 48, n++)),
    uuid: () => `uuid-${n++}`,
  });
}

describe('LedgerService — core invariants', () => {
  it('etch returns a self-verifying receipt with inclusion proof', async () => {
    const svc = deterministic();
    const r1 = await svc.etch({ tenantId: 't1', context: [1, 0, 0], score: 0.8, note: 'first' });
    expect(r1.tenantId).toBe('t1');
    expect(r1.leafHash).toHaveLength(64);
    expect(r1.parentHash).toBeUndefined();
    expect(r1.inclusionProof).toEqual([]);
    expect(typeof r1.forestRoot).toBe('string');

    const r2 = await svc.etch({ tenantId: 't1', context: [0, 1, 0], score: 0.9, note: 'second' });
    expect(r2.parentHash).toBe(r1.leafHash);
    expect(r2.inclusionProof).toEqual([r1.leafHash]);
  });

  it('verifyReceipt returns valid for an honestly-issued receipt', async () => {
    const svc = deterministic();
    const r = await svc.etch({ tenantId: 't1', context: [1, 2, 3], score: 0.5 });
    const result = await svc.verifyReceipt(r);
    expect(result.valid).toBe(true);
  });

  it('verifyReceipt detects a tampered forest root', async () => {
    const svc = deterministic();
    const r = await svc.etch({ tenantId: 't1', context: [1, 2, 3], score: 0.5 });
    const tampered: EtchReceipt = { ...r, forestRoot: '0'.repeat(64) };
    const result = await svc.verifyReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/forest root/);
  });

  it('verifyReceipt detects a tampered leaf hash', async () => {
    const svc = deterministic();
    const r = await svc.etch({ tenantId: 't1', context: [1, 2, 3], score: 0.5 });
    const tampered: EtchReceipt = { ...r, leafHash: '1'.repeat(64) };
    const result = await svc.verifyReceipt(tampered);
    expect(result.valid).toBe(false);
  });

  it('verifyBundle is stateless and detects chain breaks', async () => {
    const svc = deterministic();
    await svc.etch({ tenantId: 't1', context: [1, 0], score: 0.5 });
    await svc.etch({ tenantId: 't1', context: [0, 1], score: 0.6 });
    const bundle = await svc.exportFullLedger('t1');
    expect(LedgerService.verifyBundle(bundle).valid).toBe(true);

    // Tamper by reordering leaves.
    const reordered: LedgerExportBundle = {
      ...bundle,
      leaves: Object.freeze([bundle.leaves[1], bundle.leaves[0]]),
    };
    expect(LedgerService.verifyBundle(reordered).valid).toBe(false);
  });

  // Regression: previously, `verifyBundle` only re-verified the *list of leaf
  // hashes* — the forest root was a digest of `leaves.map(l => l.leafHash)` and
  // the parent-chain walk also used the embedded `leafHash`. An attacker could
  // therefore mutate any leaf's `score`, `context`, `note`, or `metadata`
  // (precisely the fields the ledger claims to attest to) while leaving the
  // embedded `leafHash` value untouched, and the bundle would still verify.
  // That defeats the whole audit purpose of the hosted ledger, so the fix
  // recomputes each leaf hash from its content.
  it('verifyBundle rejects a bundle whose leaf content has been forged while leafHash is preserved', async () => {
    const svc = deterministic();
    await svc.etch({ tenantId: 't1', context: [1, 0], score: 0.1, note: 'first' });
    await svc.etch({ tenantId: 't1', context: [0, 1], score: 0.5, note: 'second' });
    const bundle = await svc.exportFullLedger('t1');
    expect(LedgerService.verifyBundle(bundle).valid).toBe(true);

    // Forge: change the second leaf's score + note + context while keeping
    // every hash field (`leafHash`, `parentHash`) byte-identical to the
    // genuine export. Pre-fix, this passed verification; post-fix it must not.
    const scoreForged: LedgerExportBundle = {
      ...bundle,
      leaves: Object.freeze([
        bundle.leaves[0],
        { ...bundle.leaves[1], score: 0.99, note: 'forged-second', context: [9, 9, 9, 9, 9] },
      ]),
    };
    const result = LedgerService.verifyBundle(scoreForged);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/leaf hash mismatch|content has been tampered/);

    // Also rejects a mutated metadata payload, even when score/context are
    // left alone (covers the supply-chain-style forge: add a fake "audited
    // by" tag to a real leaf).
    const metadataForged: LedgerExportBundle = {
      ...bundle,
      leaves: Object.freeze([
        bundle.leaves[0],
        { ...bundle.leaves[1], metadata: { auditedBy: 'attacker' } },
      ]),
    };
    expect(LedgerService.verifyBundle(metadataForged).valid).toBe(false);
  });

  it('verifyBundle rejects a leaf whose tenantId does not match the bundle tenant', async () => {
    const svc = deterministic();
    await svc.etch({ tenantId: 't1', context: [1, 0], score: 0.5 });
    const bundle = await svc.exportFullLedger('t1');

    const spliced: LedgerExportBundle = {
      ...bundle,
      leaves: Object.freeze([{ ...bundle.leaves[0], tenantId: 't2' }]),
    };
    const result = LedgerService.verifyBundle(spliced);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/tenant/);
  });

  it('tenants are isolated — t1 leaves never appear in t2', async () => {
    const svc = deterministic();
    await svc.etch({ tenantId: 't1', context: [1, 0], score: 0.5 });
    await svc.etch({ tenantId: 't2', context: [0, 1], score: 0.5 });
    const q1 = await svc.query({ tenantId: 't1' });
    const q2 = await svc.query({ tenantId: 't2' });
    expect(q1.leaves).toHaveLength(1);
    expect(q2.leaves).toHaveLength(1);
    expect(q1.forestRoot).not.toBe(q2.forestRoot);
  });

  it('query filters by score and time window', async () => {
    let i = 0;
    const svc = new LedgerService({
      storage: new InMemoryStorageAdapter(),
      now: () => new Date(Date.UTC(2026, 4, 18, 0, 0, i++)),
      uuid: () => `u-${i}`,
    });
    await svc.etch({ tenantId: 't1', context: [1], score: 0.1 });
    await svc.etch({ tenantId: 't1', context: [1], score: 0.5 });
    await svc.etch({ tenantId: 't1', context: [1], score: 0.9 });
    const q = await svc.query({ tenantId: 't1', minScore: 0.4 });
    expect(q.leaves.map((l) => l.score)).toEqual([0.5, 0.9]);
    const q2 = await svc.query({ tenantId: 't1', limit: 1 });
    expect(q2.leaves).toHaveLength(1);
  });

  it('currentForestRoot is byte-stable across two empty tenants', async () => {
    const svc = deterministic();
    const a = await svc.currentForestRoot('empty-a');
    const b = await svc.currentForestRoot('empty-b');
    // Different tenantId → different root.
    expect(a).not.toBe(b);
    // Same tenantId → same root.
    const a2 = await svc.currentForestRoot('empty-a');
    expect(a).toBe(a2);
  });
});

describe('LedgerClient — transport, fallback, embedded modes', () => {
  it('embedded mode delegates to a pre-built LedgerService', async () => {
    const embedded = new LedgerService({ storage: new InMemoryStorageAdapter() });
    const client = createLedgerClient({ type: 'embedded', embedded });
    expect(client.source).toBe('embedded');
    const r = await client.etch({ tenantId: 't', context: [1], score: 0.5 });
    expect(r.tenantId).toBe('t');
  });

  it('hosted mode hits the configured endpoint over fetch', async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      calls.push(url);
      const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}');
      const responseBody = body.tenantId
        ? {
            id: 'fake', tenantId: body.tenantId, leafHash: 'a'.repeat(64),
            forestRoot: 'b'.repeat(64), inclusionProof: [], sealedAt: 'now',
          }
        : { ok: true };
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const client = createLedgerClient({
      type: 'hosted', endpoint: 'https://ledger.test', apiKey: 'k', fetchImpl: fakeFetch,
    });
    await client.etch({ tenantId: 't', context: [1, 2], score: 0.5 });
    expect(calls).toContain('https://ledger.test/etch');
  });

  it("hosted mode falls back to local on network failure when fallback is on (default)", async () => {
    const failingFetch: typeof fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const client = LedgerClientFactory.fromConfig({
      type: 'hosted', endpoint: 'https://nope.invalid', fetchImpl: failingFetch,
    });
    const receipt = await client.etch({ tenantId: 't', context: [1], score: 0.5 });
    expect(receipt.tenantId).toBe('t');
    // The local fallback annotated the metadata with source='local-fallback' —
    // the receipt is shaped identically to a hosted receipt so callers don't
    // need to special-case fallbacks downstream.
  });

  it('hosted mode without fallback rethrows network errors', async () => {
    const failingFetch: typeof fetch = (async () => {
      throw new Error('boom');
    }) as typeof fetch;
    const client = LedgerClientFactory.fromConfig({
      type: 'hosted', endpoint: 'https://nope.invalid', fallback: false, fetchImpl: failingFetch,
    });
    await expect(client.etch({ tenantId: 't', context: [1], score: 0.5 })).rejects.toThrow(/boom/);
  });

  it('throws when hosted/self-host is configured without an endpoint', () => {
    expect(() => createLedgerClient({ type: 'hosted' })).toThrow(/endpoint is required/);
  });
});
