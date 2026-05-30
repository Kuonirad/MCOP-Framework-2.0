// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  approveChangeset,
  buildChangeset,
  computeChangesetHash,
  parseCodeowners,
  requiredOwnersFor,
  validateApprovedChangeset,
  type ApprovalPolicy,
  type Changeset,
} from '../conformance';

const NOW = () => new Date('2026-05-29T00:00:00.000Z');

function makeChangeset(content = 'export const x = 1;', author = '@dev'): Changeset {
  return buildChangeset({
    id: 'cs-1',
    baseRef: 'main',
    headRef: 'feature',
    author,
    files: [
      { path: 'src/b.ts', status: 'modified', content },
      { path: 'src/a.ts', status: 'added', content: 'export const a = 0;' },
    ],
    now: NOW,
  });
}

const POLICY: ApprovalPolicy = { requiredOwners: ['@owner'], minApprovals: 1, forbidSelfApproval: true };

describe('changeset building', () => {
  it('seals a content-bound, order-independent hash', () => {
    const cs = makeChangeset();
    expect(cs.changesetHash).toHaveLength(64);
    // Files are sorted, so the hash recomputes identically.
    expect(computeChangesetHash(cs)).toBe(cs.changesetHash);
    // Deleted files have a null content hash.
    const withDelete = buildChangeset({
      id: 'd', baseRef: 'main', headRef: 'f', author: '@dev',
      files: [{ path: 'old.ts', status: 'deleted' }], now: NOW,
    });
    expect(withDelete.files[0].contentHash).toBeNull();
  });

  it('different content ⇒ different hash', () => {
    expect(makeChangeset('a').changesetHash).not.toBe(makeChangeset('b').changesetHash);
  });
});

describe('approved-changeset gate', () => {
  it('accepts a genuine owner approval bound to the content', () => {
    const cs = makeChangeset();
    const approval = approveChangeset(cs, '@owner', { now: NOW });
    const result = validateApprovedChangeset(cs, [approval], POLICY);
    expect(result.verdict).toBe('approved');
    expect(result.satisfiedBy).toEqual(['@owner']);
    expect(result.validationMerkleRoot).toHaveLength(64);
  });

  it('rejects a manifest tampered after sealing', () => {
    const cs = makeChangeset();
    const approval = approveChangeset(cs, '@owner', { now: NOW });
    const tampered = { ...cs, changesetHash: cs.changesetHash.replace(/^./, (c) => (c === '0' ? '1' : '0')) };
    expect(validateApprovedChangeset(tampered, [approval], POLICY).verdict).toBe('tampered');
  });

  it('flags an approval as stale when a file changes after approval', () => {
    const original = makeChangeset('export const x = 1;');
    const approval = approveChangeset(original, '@owner', { now: NOW });
    const edited = makeChangeset('export const x = 2;'); // same id, new content ⇒ new hash
    const result = validateApprovedChangeset(edited, [approval], POLICY);
    expect(result.verdict).toBe('stale-approval');
    expect(result.staleApprovers).toEqual(['@owner']);
  });

  it('rejects self-approval by the author', () => {
    const cs = makeChangeset('export const x = 1;', '@dev');
    const selfApproval = approveChangeset(cs, '@dev', { now: NOW });
    const result = validateApprovedChangeset(cs, [selfApproval], { ...POLICY, requiredOwners: ['@dev'] });
    expect(result.verdict).toBe('self-approval-rejected');
  });

  it('rejects a forged approval record (hash does not recompute)', () => {
    const cs = makeChangeset();
    const approval = approveChangeset(cs, '@owner', { now: NOW });
    const forged = { ...approval, approver: '@attacker' }; // approvalHash no longer matches
    expect(validateApprovedChangeset(cs, [forged], { ...POLICY, requiredOwners: ['@attacker'] }).verdict)
      .toBe('insufficient-approvals');
  });

  it('requires enough approvals when minApprovals > 1', () => {
    const cs = makeChangeset();
    const a1 = approveChangeset(cs, '@owner', { now: NOW });
    const policy2: ApprovalPolicy = { requiredOwners: ['@owner', '@owner2'], minApprovals: 2, forbidSelfApproval: true };
    expect(validateApprovedChangeset(cs, [a1], policy2).verdict).toBe('insufficient-approvals');
    const a2 = approveChangeset(cs, '@owner2', { now: NOW });
    expect(validateApprovedChangeset(cs, [a1, a2], policy2).verdict).toBe('approved');
  });

  it('resolves the policy owners from CODEOWNERS for the changed paths', () => {
    const cs = makeChangeset();
    const rules = parseCodeowners('*  @Kuonirad\nsrc/  @Kuonirad\n');
    const requiredOwners = requiredOwnersFor(cs.files.map((f) => f.path), rules);
    const policy: ApprovalPolicy = { requiredOwners, minApprovals: 1, forbidSelfApproval: true };
    const approval = approveChangeset(cs, '@Kuonirad', { now: NOW });
    expect(validateApprovedChangeset(cs, [approval], policy).verdict).toBe('approved');
  });

  it('validation is deterministic (sealed root replays)', () => {
    const cs = makeChangeset();
    const approval = approveChangeset(cs, '@owner', { now: NOW });
    const r1 = validateApprovedChangeset(cs, [approval], POLICY);
    const r2 = validateApprovedChangeset(cs, [approval], POLICY);
    expect(r1.validationMerkleRoot).toBe(r2.validationMerkleRoot);
  });
});
