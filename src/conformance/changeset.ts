// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Building and sealing a changeset.
 *
 * A changeset is the unit the approval gate binds to: an ordered, content-hashed
 * manifest of every file the change touches, rolled into a single
 * `changesetHash`. Because the hash is a canonical (RFC 8785) digest over the
 * sorted file entries, it is order-independent and byte-stable across runtimes —
 * and any edit to any file changes it, which is exactly what makes a prior
 * approval detectably stale.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import type { ChangeStatus, Changeset, FileChange } from './types';

export interface FileChangeInput {
  path: string;
  status: ChangeStatus;
  /** File content; omit/ignored for deleted files. */
  content?: string;
}

export interface BuildChangesetInput {
  id: string;
  baseRef: string;
  headRef: string;
  author: string;
  files: FileChangeInput[];
  now?: () => Date;
}

/** Canonical content hash for one file (null for deletions). */
export function hashFileContent(path: string, status: ChangeStatus, content: string | undefined): string | null {
  if (status === 'deleted') return null;
  return canonicalDigest({ kind: 'mcop-file-content', path, content: content ?? '' });
}

/** The authoritative changeset hash, computed purely from its fields + files. */
export function computeChangesetHash(input: {
  id: string;
  baseRef: string;
  headRef: string;
  author: string;
  files: readonly FileChange[];
}): string {
  const files = [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return canonicalDigest({
    kind: 'mcop-changeset',
    id: input.id,
    baseRef: input.baseRef,
    headRef: input.headRef,
    author: input.author,
    files,
  });
}

/** Builds a sealed {@link Changeset} from raw file inputs. */
export function buildChangeset(input: BuildChangesetInput): Changeset {
  const now = input.now ?? (() => new Date());
  const files: FileChange[] = input.files
    .map((f) => ({ path: f.path, status: f.status, contentHash: hashFileContent(f.path, f.status, f.content) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const changesetHash = computeChangesetHash({
    id: input.id,
    baseRef: input.baseRef,
    headRef: input.headRef,
    author: input.author,
    files,
  });

  return {
    id: input.id,
    baseRef: input.baseRef,
    headRef: input.headRef,
    author: input.author,
    files,
    createdAt: now().toISOString(),
    changesetHash,
  };
}

/** The list of paths a changeset touches (for CODEOWNERS resolution). */
export function changedPaths(changeset: Changeset): string[] {
  return changeset.files.map((f) => f.path);
}
