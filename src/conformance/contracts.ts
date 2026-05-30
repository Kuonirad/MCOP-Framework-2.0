// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview The built-in conformance contracts.
 *
 * Each contract is a small, self-checking statement of an invariant a
 * conforming MCOP implementation must satisfy. They are deliberately runnable
 * with no network and no GPU, so a second maintainer — or a clean-room
 * reimplementation — validates by running the suite, not by reading the author's
 * mind. The set spans the three load-bearing guarantees: canonical-digest
 * determinism, the unified hot-path boundary, and the approved-changeset gate.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import {
  HotPathRouter,
  cosineRecallKernel,
  encodeKernel,
  evolveScoreKernel,
  holographicUpdateKernel,
  homeostasisKernel,
} from '../hardware';
import golden from '../../tests/parity/hotPathKernels.golden.json';
import { approveChangeset, validateApprovedChangeset } from './approval';
import { buildChangeset } from './changeset';
import type { ConformanceContract, ContractResult } from './types';

function pass(id: string, description: string, detail: string): ContractResult {
  return { id, description, passed: true, detail };
}
function fail(id: string, description: string, detail: string): ContractResult {
  return { id, description, passed: false, detail };
}

const KERNELS: Record<string, (input: never) => unknown> = {
  encode: encodeKernel as never,
  cosineRecall: cosineRecallKernel as never,
  holographicUpdate: holographicUpdateKernel as never,
  evolveScore: evolveScoreKernel as never,
  homeostasis: homeostasisKernel as never,
};

function closeEnough(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') {
    return typeof actual === 'number' && Math.abs(actual - expected) <= 1e-9;
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((v, i) => closeEnough((actual as unknown[])[i], v))
    );
  }
  if (expected && typeof expected === 'object') {
    return Object.keys(expected).every((k) =>
      closeEnough((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k]),
    );
  }
  return actual === expected;
}

export const CANONICAL_DETERMINISM: ConformanceContract = {
  id: 'canonical-digest-determinism',
  description: 'canonicalDigest is order-independent over object keys and byte-stable.',
  check() {
    const a = canonicalDigest({ a: 1, b: 2, c: [3, 4] });
    const b = canonicalDigest({ c: [3, 4], b: 2, a: 1 });
    const distinct = canonicalDigest({ a: 1 }) !== canonicalDigest({ a: 2 });
    if (a !== b) return fail(this.id, this.description, 'key order changed the digest');
    if (a.length !== 64) return fail(this.id, this.description, `digest length ${a.length} ≠ 64`);
    if (!distinct) return fail(this.id, this.description, 'distinct payloads collided');
    return pass(this.id, this.description, `stable digest ${a.slice(0, 12)}…, order-independent, collision-free`);
  },
};

export const HOT_PATH_PARITY: ConformanceContract = {
  id: 'hot-path-parity',
  description: 'CPU reference kernels reproduce the Python golden fixture for all hot-path ops.',
  check() {
    const cases = (golden as { cases: Array<{ kernel: string; input: unknown; expected: unknown }> }).cases;
    for (const c of cases) {
      const kernel = KERNELS[c.kernel];
      if (!kernel) return fail(this.id, this.description, `no TS kernel for ${c.kernel}`);
      const actual = kernel(c.input as never);
      if (!closeEnough(actual, c.expected)) {
        return fail(this.id, this.description, `kernel ${c.kernel} diverged from the golden output`);
      }
    }
    return pass(this.id, this.description, `${cases.length} golden cases reproduced within 1e-9`);
  },
};

export const HOT_PATH_PROVENANCE: ConformanceContract = {
  id: 'hot-path-provenance',
  description: 'Every hot-path op carries uniform provenance and a deterministic, replayable chain root.',
  async check() {
    const run = async () => {
      const router = new HotPathRouter();
      await router.encode({ tensor: [0, 1, -1], bias: 0.1 });
      await router.recall({ query: [1, 0], library: [[1, 0]] });
      await router.etch({ context: [1, 2], synthesis: [3, 4] });
      await router.evolve({ candidates: [{ score: 1 }] });
      await router.homeostasis({ state: [2, -2] });
      return router;
    };
    const a = await run();
    const b = await run();
    const log = a.getProvenanceLog();
    if (log.length !== 5) return fail(this.id, this.description, `expected 5 logged ops, got ${log.length}`);
    const shapeOk = log.every((e) => e.kernel && e.device && (e.mode === 'cpu' || e.mode === 'cuda') && e.hash.length === 64);
    if (!shapeOk) return fail(this.id, this.description, 'a hot-path entry was missing required provenance fields');
    if (a.getHotPathRoot() !== b.getHotPathRoot()) {
      return fail(this.id, this.description, 'hot-path root was not deterministic across runs');
    }
    return pass(this.id, this.description, `5 ops, uniform provenance, deterministic root ${a.getHotPathRoot()?.slice(0, 12)}…`);
  },
};

export const APPROVED_CHANGESET_GATE: ConformanceContract = {
  id: 'approved-changeset-gate',
  description: 'Approvals are content-bound: a genuine owner approval passes; tamper and stale approvals fail.',
  check() {
    const now = () => new Date('2026-05-29T00:00:00.000Z');
    const policy = { requiredOwners: ['@owner'], minApprovals: 1, forbidSelfApproval: true };

    const cs = buildChangeset({
      id: 'cs-1',
      baseRef: 'main',
      headRef: 'feature',
      author: '@dev',
      files: [{ path: 'src/x.ts', status: 'modified', content: 'export const x = 1;' }],
      now,
    });

    // 1. Genuine owner approval → approved.
    const approval = approveChangeset(cs, '@owner', { now });
    if (validateApprovedChangeset(cs, [approval], policy).verdict !== 'approved') {
      return fail(this.id, this.description, 'a genuine owner approval was not accepted');
    }

    // 2. Self-approval only → rejected.
    const selfApproval = approveChangeset(cs, '@dev', { now });
    if (validateApprovedChangeset(cs, [selfApproval], { ...policy, requiredOwners: ['@dev'] }).verdict !== 'self-approval-rejected') {
      return fail(this.id, this.description, 'self-approval was not rejected');
    }

    // 3. Tampered manifest → tampered.
    const tampered = { ...cs, changesetHash: cs.changesetHash.replace(/^./, (c) => (c === '0' ? '1' : '0')) };
    if (validateApprovedChangeset(tampered, [approval], policy).verdict !== 'tampered') {
      return fail(this.id, this.description, 'manifest tampering was not detected');
    }

    // 4. Edit a file after approval → stale-approval.
    const edited = buildChangeset({
      id: 'cs-1',
      baseRef: 'main',
      headRef: 'feature',
      author: '@dev',
      files: [{ path: 'src/x.ts', status: 'modified', content: 'export const x = 2;' }],
      now,
    });
    if (validateApprovedChangeset(edited, [approval], policy).verdict !== 'stale-approval') {
      return fail(this.id, this.description, 'editing after approval did not invalidate it');
    }

    return pass(this.id, this.description, 'approved / self-approval-rejected / tampered / stale-approval all enforced');
  },
};

/** The default conformance contract set. */
export const BUILTIN_CONTRACTS: ConformanceContract[] = [
  CANONICAL_DETERMINISM,
  HOT_PATH_PARITY,
  HOT_PATH_PROVENANCE,
  APPROVED_CHANGESET_GATE,
];
