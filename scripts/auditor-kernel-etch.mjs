#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Auditor Kernel live etch.
 *
 * Runs the deterministic Auditor Kernel (`src/audit/auditorKernel.ts`) over a
 * real, merged MCOP cycle and appends a genuine entry to:
 *   - audit/ledger.jsonl                  (one canonical JSON line)
 *   - audit/positive-resonance-ledger.md  (a human-readable section)
 *
 * Every number written is either a declared, conservative human-hour estimate
 * (clearly labelled) or a value produced by the framework's own kernels
 * (resonance, multiplier, adjusted value, Merkle roots). Nothing is invented.
 *
 * Usage:
 *   node scripts/auditor-kernel-etch.mjs --dry-run   # compute + print, no writes
 *   node scripts/auditor-kernel-etch.mjs             # compute + append etches
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const dryRun = process.argv.includes('--dry-run');

const { auditCycle } = loadAuditorKernel();

/**
 * The cycle under audit: PR #786 (squash-merged as commit
 * c8f058031bf98bd0a218938adf6e9321dd297b47). Work items are the *unspecified*
 * value-bearing work, each with a conservative reference estimate of the hours
 * an expert engineer already familiar with the codebase would take — excluding
 * AI co-author loops and self-audit overhead.
 */
const WORK_ITEMS = [
  { label: 'Bidirectional MCOP-2.0 organelle host re-fusion wiring', estimatedHumanHours: 8, landed: true },
  { label: 'Conductor auto-route on organelle/mcop/full power phrases', estimatedHumanHours: 4, landed: true },
  { label: 'Integration guide + fusion recording documentation', estimatedHumanHours: 2.7, landed: true },
];

const FACTS = {
  sessionId: 'grok-build-tui-fusion-pr-recording',
  tenant: 'grok-build-tui-fusion-pr-recording',
  merged: true,
  guardianVerdict: 'PASS',
  commitHash: 'c8f058031bf98bd0a218938adf6e9321dd297b47',
  // thermoFreeEnergyDelta intentionally omitted: ThermoTruth was not re-run
  // here, so no thermo value is asserted (the kernel records null).
};

const report = auditCycle(WORK_ITEMS, FACTS);

if (!report) {
  process.stdout.write(
    'Auditor Kernel classified this cycle as NOT productive ' +
      '(merge / guardian / landed-work / resonance-floor not all satisfied). No etch written.\n',
  );
  process.exit(1);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (dryRun) {
  process.stdout.write('\n[dry-run] No files written.\n');
  process.exit(0);
}

// --- Append to audit/ledger.jsonl (one canonical line) -----------------------
const ledgerPath = join(root, 'audit', 'ledger.jsonl');
const ledgerEntry = {
  id: `auditor-kernel-${report.merkleRoot.slice(0, 12)}`,
  type: 'auditor-kernel-etch',
  tenant: report.tenant,
  sessionId: report.sessionId,
  auditorKernelVersion: report.auditorKernelVersion,
  productiveHours: report.productiveHours,
  adjustedValue: report.adjustedValue,
  resonance: report.resonance,
  resonanceMultiplier: report.resonanceMultiplier,
  thermoFreeEnergyDelta: report.thermoFreeEnergyDelta,
  guardianVerdict: report.guardianVerdict,
  merged: report.merged,
  commitHash: report.commitHash,
  growthMerkleRoot: report.growthMerkleRoot,
  merkleRoot: report.merkleRoot,
  summary:
    `Auditor Kernel v${report.auditorKernelVersion} etch for PR #786 (${report.commitHash.slice(0, 7)}): ` +
    `${report.productiveHours}h conservative human-path → ${report.adjustedValue} adjusted ` +
    `(resonance ${report.resonance}, ×${report.resonanceMultiplier}). Kernel-derived; no invented metrics.`,
  provenanceProof: report.provenanceProof,
  timestamp: report.timestamp,
};
appendFileSync(ledgerPath, `${JSON.stringify(ledgerEntry)}\n`);

// --- Append to audit/positive-resonance-ledger.md (readable section) ---------
const mdPath = join(root, 'audit', 'positive-resonance-ledger.md');
const existing = readFileSync(mdPath, 'utf8').trimEnd();
const workRows = report.workItems
  .map(
    (w) =>
      `| ${w.label} | ${w.estimatedHumanHours} | ${w.landed ? 'yes' : 'no'} | ${w.domain} | \`${(w.etchHash ?? '—').slice(0, 12)}\` |`,
  )
  .join('\n');

const section = `

## ${report.timestamp} — Auditor Kernel Etch (PR #786)

**Auditor Kernel:** v${report.auditorKernelVersion} (deterministic, primitive-backed)
**Resonance (kernel-derived):** ${report.resonance}
**Resonance multiplier:** ×${report.resonanceMultiplier}
**Conservative human-path:** ${report.productiveHours} h
**Adjusted value:** ${report.adjustedValue} (hours × multiplier)
**Thermo free-energy delta:** ${report.thermoFreeEnergyDelta === null ? 'not recorded' : report.thermoFreeEnergyDelta}
**Guardian:** ${report.guardianVerdict} · **Merged:** ${report.merged} · **Commit:** \`${report.commitHash}\`

Every figure above is either a declared conservative estimate (per-item hours) or a value produced by the framework's own kernels (resonance via NovaNeoEncoder → HolographicEtch → PositiveResonanceAmplifier; Merkle roots via canonical SHA-256). No metric was hand-written.

| Work item | Est. human h | Landed | Domain | Etch hash |
|:---|---:|:---:|:---|:---|
${workRows}

- **Growth Merkle root:** \`${report.growthMerkleRoot}\`
- **Provenance Merkle root:** \`${report.merkleRoot}\`
- **Provenance:** ${report.provenanceProof}

\`\`\`json
${JSON.stringify(
  {
    auditorKernelVersion: report.auditorKernelVersion,
    sessionId: report.sessionId,
    productiveHours: report.productiveHours,
    adjustedValue: report.adjustedValue,
    resonance: report.resonance,
    resonanceMultiplier: report.resonanceMultiplier,
    thermoFreeEnergyDelta: report.thermoFreeEnergyDelta,
    guardianVerdict: report.guardianVerdict,
    merged: report.merged,
    commitHash: report.commitHash,
    growthMerkleRoot: report.growthMerkleRoot,
    merkleRoot: report.merkleRoot,
  },
  null,
  2,
)}
\`\`\`

---`;

writeFileSync(mdPath, `${existing}\n${section}\n`);

process.stdout.write(`\nEtched to:\n  ${ledgerPath}\n  ${mdPath}\n`);

function loadAuditorKernel() {
  registerTypeScriptLoader();
  return require(join(root, 'src', 'audit', 'auditorKernel.ts'));
}

function registerTypeScriptLoader() {
  if (require.extensions['.ts']) return;
  redirectCanonicalizeToShim();
  const ts = require('typescript');
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        esModuleInterop: true,
        isolatedModules: false,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    module._compile(output, filename);
  };
}

/**
 * `canonicalize` is ESM-only (v3+), which a synchronous CommonJS require cannot
 * consume. Tests route it through `tests/shims/canonicalize.cjs` via Jest's
 * moduleNameMapper; this script does the same by redirecting the bare specifier
 * to the byte-identical CJS shim at resolve time.
 */
function redirectCanonicalizeToShim() {
  const Module = require('node:module');
  const shim = join(root, 'tests', 'shims', 'canonicalize.cjs');
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function resolve(request, ...rest) {
    if (request === 'canonicalize') return shim;
    return originalResolve.call(this, request, ...rest);
  };
}
