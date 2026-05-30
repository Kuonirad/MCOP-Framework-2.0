// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Approved-changeset CI gate (env-gated, like `positive:attest`).
 *
 * Runs only when `MCOP_GATE=1` (the dedicated workflow sets it); otherwise the
 * whole describe is skipped so the normal `pnpm test` run is unaffected. The
 * gate reconstructs the PR's changeset from the real git diff, resolves the
 * required owners from `.github/CODEOWNERS`, ingests the PR's review approvals
 * (only those bound to the current head commit count — GitHub's own staleness
 * notion, mirrored by the lib's content-binding), and fails unless the change
 * is a provably-approved, content-bound changeset.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  approveChangeset,
  buildChangeset,
  parseCodeowners,
  requiredOwnersFor,
  validateApprovedChangeset,
  type ChangeStatus,
} from '../conformance';

interface ReviewApproval {
  approver: string;
  commitId: string;
}

const GATE_ENABLED = process.env.MCOP_GATE === '1';

function gitNameStatus(base: string, head: string): Array<{ path: string; status: ChangeStatus }> {
  const raw = execFileSync('git', ['diff', '--name-status', `${base}...${head}`], { encoding: 'utf8' }).trim();
  if (raw.length === 0) return [];
  return raw.split(/\r?\n/).map((line) => {
    const parts = line.split(/\t/);
    const code = parts[0] ?? '';
    const path = parts[parts.length - 1];
    const status: ChangeStatus = code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : 'modified';
    return { path, status };
  });
}

(GATE_ENABLED ? describe : describe.skip)('approved-changeset CI gate', () => {
  it('the PR head is a provably-approved, content-bound changeset', () => {
    const base = process.env.GATE_BASE_SHA ?? 'origin/main';
    const head = process.env.GATE_HEAD_SHA ?? 'HEAD';
    const author = process.env.GATE_PR_AUTHOR ?? 'unknown';
    const prNumber = process.env.GATE_PR_NUMBER ?? '0';
    const reviewApprovals = JSON.parse(process.env.GATE_APPROVALS ?? '[]') as ReviewApproval[];

    const files = gitNameStatus(base, head).map(({ path, status }) => ({
      path,
      status,
      content: status === 'deleted' || !existsSync(path) ? undefined : readFileSync(path, 'utf8'),
    }));

    const changeset = buildChangeset({ id: prNumber, baseRef: base, headRef: head, author, files });

    const codeowners = existsSync('.github/CODEOWNERS') ? readFileSync('.github/CODEOWNERS', 'utf8') : '';
    const requiredOwners = requiredOwnersFor(
      changeset.files.map((f) => f.path),
      parseCodeowners(codeowners),
    );

    // Only approvals submitted against the current head commit bind to the
    // current content; approvals on an earlier commit are not carried forward.
    const boundApprovals = reviewApprovals
      .filter((a) => a.commitId === head && requiredOwners.includes(a.approver))
      .map((a) => approveChangeset(changeset, a.approver));

    const result = validateApprovedChangeset(changeset, boundApprovals, {
      requiredOwners,
      minApprovals: 1,
      forbidSelfApproval: true,
    });

    if (result.verdict !== 'approved') {
      throw new Error(
        `Approved-changeset gate failed: ${result.verdict} — ${result.rationale} ` +
          `(required owners: ${requiredOwners.join(', ') || 'none'}; changeset ${changeset.changesetHash.slice(0, 12)}…)`,
      );
    }
    expect(result.verdict).toBe('approved');
  });
});
