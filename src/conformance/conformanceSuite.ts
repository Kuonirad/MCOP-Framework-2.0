// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview The conformance suite runner.
 *
 * Runs every {@link ConformanceContract} and seals the outcome into a
 * Merkle-rooted {@link ConformanceReport}. A green report is the single,
 * checkable answer to "does this implementation conform?" — the artifact that
 * lets a second maintainer or a reimplementation be trusted without the
 * original author in the loop.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import { BUILTIN_CONTRACTS } from './contracts';
import type {
  ConformanceContract,
  ConformanceReport,
  ConformanceVerdict,
  ContractResult,
} from './types';

export interface RunConformanceOptions {
  /** Contract set to run. Defaults to {@link BUILTIN_CONTRACTS}. */
  contracts?: ConformanceContract[];
  /** Clock override for deterministic provenance in tests. */
  now?: () => Date;
}

export async function runConformanceSuite(options: RunConformanceOptions = {}): Promise<ConformanceReport> {
  const contracts = options.contracts ?? BUILTIN_CONTRACTS;
  const now = options.now ?? (() => new Date());

  const results: ContractResult[] = [];
  for (const contract of contracts) {
    try {
      results.push(await contract.check());
    } catch (error) {
      results.push({
        id: contract.id,
        description: contract.description,
        passed: false,
        detail: `contract threw: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const verdict: ConformanceVerdict = passed === results.length ? 'conformant' : 'non-conformant';
  const body = {
    kind: 'mcop-conformance-report' as const,
    schemaVersion: 1 as const,
    verdict,
    passed,
    total: results.length,
    contracts: results,
    generatedAt: now().toISOString(),
  };
  const merkleRoot = canonicalDigest({ ...body, generatedAt: undefined });
  return { ...body, merkleRoot };
}
