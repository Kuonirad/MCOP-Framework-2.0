// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Approved-changeset CI gate (env-gated, like `positive:attest`).
 *
 * Runs only when `MCOP_GATE=1` (the dedicated workflow sets it); otherwise the
 * whole describe is skipped so the normal `pnpm test` run is unaffected.
 *
 * Division of labour: GitHub branch protection's `require_code_owner_reviews`
 * already blocks a *merge* until a CODEOWNER approves, so this gate does NOT
 * re-implement "needs approval" as a red X on every in-progress PR. Its unique
 * job is the **content-binding** check GitHub misses when "dismiss stale
 * reviews" is off: an approval is bound to the head commit it was submitted
 * against, so if the diff changes after approval the approval is *stale* and the
 * gate fails. The gate therefore:
 *
 *   - PASSES when a CODEOWNER approval is bound to the current head, OR when the
 *     PR is simply awaiting review (no owner approval yet — merge stays gated by
 *     branch protection);
 *   - FAILS only on an integrity violation: a stale approval (owner approved an
 *     earlier commit, then the diff moved) or a tampered changeset manifest.
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
  it('the PR head carries no stale or tampered owner approval', () => {
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

    // Owner approvals, excluding the author's own (self-approval never counts).
    const ownerApprovals = reviewApprovals.filter(
      (a) => requiredOwners.includes(a.approver) && a.approver !== author,
    );
    const boundApprovals = ownerApprovals.filter((a) => a.commitId === head);
    const staleApprovers = [...new Set(ownerApprovals.filter((a) => a.commitId !== head).map((a) => a.approver))];

    // Case 1 — a CODEOWNER approval is bound to the current head: validate it
    // through the lib (content-binding + self-approval + tamper checks).
    if (boundApprovals.length > 0) {
      const result = validateApprovedChangeset(
        changeset,
        boundApprovals.map((a) => approveChangeset(changeset, a.approver)),
        { requiredOwners, minApprovals: 1, forbidSelfApproval: true },
      );
      if (result.verdict !== 'approved') {
        throw new Error(`Approved-changeset gate failed: ${result.verdict} — ${result.rationale}`);
      }
      expect(result.verdict).toBe('approved');
      return;
    }

    // Case 2 — an owner approved, but only on an earlier commit: the diff moved
    // under them. This is the content-binding violation the gate exists to catch.
    if (staleApprovers.length > 0) {
      throw new Error(
        `Approved-changeset gate failed: stale-approval — ${staleApprovers.join(', ')} approved an ` +
          `earlier commit, but the head is now ${head.slice(0, 12)} (changeset ` +
          `${changeset.changesetHash.slice(0, 12)}…). Re-approve at the current head.`,
      );
    }

    // Case 3 — no owner approval yet: not a violation. The merge is still gated
    // by branch protection's required code-owner review; the gate stays green.
    console.log(
      `approved-changeset: awaiting code-owner review (required owners: ${requiredOwners.join(', ') || 'none'}). ` +
        `Merge remains gated by branch protection.`,
    );
    expect(staleApprovers).toHaveLength(0);
  });
});
