// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Approvals bound to changeset content, and the validation gate.
 *
 * The whole point: an {@link Approval} carries the exact `changesetHash` it
 * signed off on. Validation recomputes the hash from the changeset's *files*
 * (never trusting the stored field) and accepts an approval only if it binds to
 * that recomputed hash and comes from a CODEOWNER who is not the author. So:
 *
 *   - tamper with the manifest after sealing → `tampered`;
 *   - edit a file after an owner approved → recomputed hash moves → that
 *     approval is `stale-approval`;
 *   - only the author approved → `self-approval-rejected`;
 *   - no qualifying owner approval → `insufficient-approvals`.
 *
 * Every validation is itself Merkle-sealed, so the verdict is replayable.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import { computeChangesetHash } from './changeset';
import type {
  Approval,
  ApprovalPolicy,
  Changeset,
  ChangesetValidation,
  ChangesetVerdict,
} from './types';

export interface ApproveOptions {
  role?: string;
  now?: () => Date;
}

/** Produces an approval cryptographically bound to `changeset.changesetHash`. */
export function approveChangeset(
  changeset: Changeset,
  approver: string,
  options: ApproveOptions = {},
): Approval {
  const role = options.role ?? 'codeowner';
  const approvedAt = (options.now ?? (() => new Date()))().toISOString();
  const changesetHash = changeset.changesetHash;
  const approvalHash = canonicalDigest({
    kind: 'mcop-approval',
    changesetHash,
    approver,
    role,
    approvedAt,
  });
  return { approver, role, changesetHash, approvedAt, approvalHash };
}

/** Recomputes an approval's hash to confirm it has not been altered. */
export function approvalIsIntact(approval: Approval): boolean {
  const recomputed = canonicalDigest({
    kind: 'mcop-approval',
    changesetHash: approval.changesetHash,
    approver: approval.approver,
    role: approval.role,
    approvedAt: approval.approvedAt,
  });
  return recomputed === approval.approvalHash;
}

const DEFAULT_POLICY: Pick<ApprovalPolicy, 'minApprovals' | 'forbidSelfApproval'> = {
  minApprovals: 1,
  forbidSelfApproval: true,
};

/**
 * Validates that a changeset is provably approved under the policy. The
 * recomputed-from-files hash is the authoritative anchor, so approvals only
 * count when they bind to the *current* content.
 */
export function validateApprovedChangeset(
  changeset: Changeset,
  approvals: readonly Approval[],
  policy: ApprovalPolicy,
): ChangesetValidation {
  const minApprovals = policy.minApprovals ?? DEFAULT_POLICY.minApprovals;
  const forbidSelfApproval = policy.forbidSelfApproval ?? DEFAULT_POLICY.forbidSelfApproval;
  const requiredOwners = [...policy.requiredOwners].sort();

  const recomputedHash = computeChangesetHash(changeset);
  const ownerSet = new Set(requiredOwners);

  const satisfiedBy: string[] = [];
  const staleApprovers: string[] = [];

  for (const approval of approvals) {
    if (!approvalIsIntact(approval)) continue; // forged/altered approval record
    if (!ownerSet.has(approval.approver)) continue; // not an authorised owner
    if (forbidSelfApproval && approval.approver === changeset.author) continue; // self-approval
    if (approval.changesetHash !== recomputedHash) {
      staleApprovers.push(approval.approver);
      continue;
    }
    if (!satisfiedBy.includes(approval.approver)) satisfiedBy.push(approval.approver);
  }

  const verdict = decideVerdict({
    storedHash: changeset.changesetHash,
    recomputedHash,
    approvals,
    changeset,
    requiredOwners,
    forbidSelfApproval,
    satisfiedBy,
    staleApprovers,
    minApprovals,
  });

  const rationale = explain(verdict, { satisfiedBy, staleApprovers, requiredOwners, minApprovals });

  const body = {
    verdict,
    rationale,
    recomputedHash,
    satisfiedBy: [...satisfiedBy].sort(),
    staleApprovers: [...new Set(staleApprovers)].sort(),
    requiredOwners,
  };
  const validationMerkleRoot = canonicalDigest({ kind: 'mcop-changeset-validation', ...body });
  return { ...body, validationMerkleRoot };
}

function decideVerdict(ctx: {
  storedHash: string;
  recomputedHash: string;
  approvals: readonly Approval[];
  changeset: Changeset;
  requiredOwners: string[];
  forbidSelfApproval: boolean;
  satisfiedBy: string[];
  staleApprovers: string[];
  minApprovals: number;
}): ChangesetVerdict {
  // Integrity first: the sealed hash must match the manifest it claims to seal.
  if (ctx.storedHash !== ctx.recomputedHash) return 'tampered';

  if (ctx.satisfiedBy.length >= ctx.minApprovals) return 'approved';

  // Did the *only* binding owner approval come from the author?
  const authorSelfApproved = ctx.approvals.some(
    (a) =>
      approvalIsIntact(a) &&
      a.approver === ctx.changeset.author &&
      ctx.requiredOwners.includes(a.approver) &&
      a.changesetHash === ctx.recomputedHash,
  );
  if (ctx.forbidSelfApproval && ctx.satisfiedBy.length === 0 && authorSelfApproved) {
    return 'self-approval-rejected';
  }

  // An owner approved, but an earlier content → the diff moved under them.
  if (ctx.satisfiedBy.length === 0 && ctx.staleApprovers.length > 0) return 'stale-approval';

  return 'insufficient-approvals';
}

function explain(
  verdict: ChangesetVerdict,
  ctx: { satisfiedBy: string[]; staleApprovers: string[]; requiredOwners: string[]; minApprovals: number },
): string {
  switch (verdict) {
    case 'approved':
      return `Provably approved by ${ctx.satisfiedBy.join(', ')} (≥ ${ctx.minApprovals} bound owner approval).`;
    case 'tampered':
      return 'Changeset hash does not match its files — the manifest was altered after sealing.';
    case 'stale-approval':
      return `Owner approval(s) from ${ctx.staleApprovers.join(', ')} bound to an earlier content; the diff changed after approval.`;
    case 'self-approval-rejected':
      return 'The only owner approval came from the changeset author; self-approval is forbidden by policy.';
    case 'insufficient-approvals':
      return `Need ≥ ${ctx.minApprovals} bound approval(s) from required owners (${ctx.requiredOwners.join(', ') || 'none resolved'}).`;
    default:
      return '';
  }
}
