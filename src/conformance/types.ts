// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Shared types for the conformance spec + approved-changeset gate
 * (advance #4).
 *
 * Two surfaces, one idea — make the framework checkable instead of trusted:
 *
 *   - A **conformance suite** pins the deterministic contracts any
 *     reimplementation (or second maintainer) must satisfy: canonical-digest
 *     determinism, the unified hot-path boundary's outputs + provenance shape,
 *     and the governance gate below.
 *   - An **approved-changeset provenance gate** turns "a human approved it" into
 *     a content-bound, replayable record: an approval is cryptographically
 *     bound to the exact changeset hash, so modifying the diff after approval
 *     invalidates it. This is GitHub's social review rule made machine-checkable.
 *
 * Together they directly attack the Bus-Factor-1 risk: behaviour and change
 * control both become "the suite passes", not "the author knows".
 */

export type ChangeStatus = 'added' | 'modified' | 'deleted';

export interface FileChange {
  path: string;
  status: ChangeStatus;
  /** Canonical digest of the file content; `null` for deleted files. */
  contentHash: string | null;
}

export interface Changeset {
  id: string;
  baseRef: string;
  headRef: string;
  /** The login that authored the change (used to forbid self-approval). */
  author: string;
  /** Sorted by path for a stable, order-independent hash. */
  files: FileChange[];
  createdAt: string;
  /** Merkle root binding the whole changeset; the approval anchor. */
  changesetHash: string;
}

export interface Approval {
  approver: string;
  /** e.g. `'codeowner'`. */
  role: string;
  /** The exact changeset hash this approval is bound to. */
  changesetHash: string;
  approvedAt: string;
  /** Digest over `{ changesetHash, approver, role, approvedAt }`. */
  approvalHash: string;
}

export interface ApprovalPolicy {
  /** Logins that may approve (resolved from CODEOWNERS for the changed paths). */
  requiredOwners: string[];
  /** Minimum number of distinct valid owner approvals. Default 1. */
  minApprovals: number;
  /** Reject approvals from the changeset's author. Default true. */
  forbidSelfApproval: boolean;
}

export type ChangesetVerdict =
  | 'approved'
  | 'tampered' // stored changeset hash does not match its files
  | 'stale-approval' // an owner approved, but a different (earlier) content
  | 'self-approval-rejected' // only the author approved
  | 'insufficient-approvals'; // not enough valid owner approvals

export interface ChangesetValidation {
  verdict: ChangesetVerdict;
  rationale: string;
  /** Hash recomputed from the changeset's files — the authoritative anchor. */
  recomputedHash: string;
  /** Approvers whose binding + ownership counted toward the verdict. */
  satisfiedBy: string[];
  /** Owners flagged because their approval bound to an earlier content. */
  staleApprovers: string[];
  requiredOwners: string[];
  /** Canonical digest sealing the validation (excludes this field). */
  validationMerkleRoot: string;
}

export interface ContractResult {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface ConformanceContract {
  id: string;
  description: string;
  check: () => ContractResult | Promise<ContractResult>;
}

export type ConformanceVerdict = 'conformant' | 'non-conformant';

export interface ConformanceReport {
  kind: 'mcop-conformance-report';
  schemaVersion: 1;
  verdict: ConformanceVerdict;
  passed: number;
  total: number;
  contracts: ContractResult[];
  generatedAt: string;
  /** Canonical digest sealing the report (excludes this field). */
  merkleRoot: string;
}
