#!/usr/bin/env node
/**
 * `mcop-pouw verify` — stateless verification of a Proof-of-Useful-Work
 * receipt against an on-chain anchored model-manifest root.
 *
 * Usage:
 *
 *     node scripts/mcop-pouw-verify.mjs --receipt ./receipt.json --root <hex>
 *     node scripts/mcop-pouw-verify.mjs --receipt ./receipt.json --anchor models/anchored_root.json
 *     MCOP_MODEL_MANIFEST_ROOT=<hex> node scripts/mcop-pouw-verify.mjs --receipt ./receipt.json
 *
 * The trusted root is resolved with the same precedence as the
 * `OnChainRootRegistry`: `--root` > `MCOP_MODEL_MANIFEST_ROOT` > the
 * `root` field of an `--anchor` file.
 *
 * Exit status:
 *   0 — receipt verifies (receiptId intact, root anchored, Merkle proof folds)
 *   1 — receipt is invalid (human-readable reason on stderr)
 *   2 — usage error
 *
 * This script reads only local files and never calls out to any chain or
 * ledger — drop a receipt + anchor onto an air-gapped machine and you've
 * cryptographically reconfirmed that the work ran under a model belonging
 * to the canonical, anchored model set. It re-implements the tiny RFC 6962
 * fold + RFC 8785 digest inline (mirrors `mcop-ledger-verify.mjs`) so it
 * has zero dependency on the compiled TypeScript.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import canonicalize from 'canonicalize';

const POUW_RECEIPT_VERSION = 'mcop-pouw-receipt/1.0';

function canonicalDigest(payload) {
  const raw = canonicalize(payload) ?? '{}';
  return createHash('sha256').update(raw).digest('hex');
}
function isHex64(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v);
}
function hashLeaf(entry) {
  return createHash('sha256').update(Buffer.concat([Buffer.of(0x00), entry])).digest();
}
function hashNode(l, r) {
  return createHash('sha256').update(Buffer.concat([Buffer.of(0x01), l, r])).digest();
}
function foldProof(entryHex, proof) {
  let h = hashLeaf(Buffer.from(entryHex, 'hex'));
  for (const step of proof) {
    if (!isHex64(step?.sibling)) return null;
    const sib = Buffer.from(step.sibling, 'hex');
    if (step.side === 'left') h = hashNode(sib, h);
    else if (step.side === 'right') h = hashNode(h, sib);
    else return null;
  }
  return h.toString('hex');
}

function fail(reason, code = 1) {
  process.stderr.write(`mcop-pouw verify: ${reason}\n`);
  process.exit(code);
}

const args = process.argv.slice(2);
let receiptPath = '';
let rootArg = '';
let anchorPath = '';
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--receipt' || a === '-r') receiptPath = args[(i += 1)] ?? '';
  else if (a === '--root') rootArg = args[(i += 1)] ?? '';
  else if (a === '--anchor' || a === '-a') anchorPath = args[(i += 1)] ?? '';
  else if (a === '-h' || a === '--help') {
    process.stdout.write(
      'Usage: mcop-pouw-verify --receipt <receipt.json> [--root <hex> | --anchor <anchored_root.json>]\n',
    );
    process.exit(0);
  } else fail(`unknown argument: ${a}`, 2);
}

if (!receiptPath) fail('missing --receipt <path>', 2);

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf-8'));
} catch (err) {
  fail(`could not read receipt: ${err.message ?? err}`, 2);
}

// Resolve the trusted on-chain root: --root > env > --anchor file.
let onChainRoot = '';
if (isHex64(rootArg)) onChainRoot = rootArg;
else if (isHex64((process.env.MCOP_MODEL_MANIFEST_ROOT ?? '').trim())) {
  onChainRoot = process.env.MCOP_MODEL_MANIFEST_ROOT.trim();
} else if (anchorPath) {
  try {
    const anchor = JSON.parse(readFileSync(anchorPath, 'utf-8'));
    if (isHex64(anchor?.root)) onChainRoot = anchor.root;
    else fail(`anchor file ${anchorPath} has no valid 'root'`, 2);
  } catch (err) {
    fail(`could not read anchor file: ${err.message ?? err}`, 2);
  }
}
if (!onChainRoot) fail('no on-chain root available (pass --root, --anchor, or set MCOP_MODEL_MANIFEST_ROOT)', 2);

if (!receipt || typeof receipt !== 'object') fail('receipt is not a JSON object');
if (receipt.version !== POUW_RECEIPT_VERSION) fail(`unsupported receipt version: ${receipt.version}`);
const proof = receipt.inclusionProof;
if (!Array.isArray(proof)) fail('receipt.inclusionProof is not an array');

// 1. receiptId integrity — recompute the canonical body digest.
const body = {
  type: 'MCOP_POUW_RECEIPT',
  version: POUW_RECEIPT_VERSION,
  kernel: receipt.kernel,
  canonicalOp: receipt.canonicalOp,
  modelId: receipt.modelId,
  manifestRoot: receipt.manifestRoot,
  inclusionProof: proof.map((s) => ({ sibling: s.sibling, side: s.side })),
  workMerkleRoot: receipt.workMerkleRoot,
  verifiedDevice: receipt.verifiedDevice,
  device: receipt.device,
  durationMs: receipt.durationMs,
  timestamp: receipt.timestamp,
};
const recomputedId = canonicalDigest(body);
if (recomputedId !== receipt.receiptId) {
  fail(`receiptId mismatch — recomputed ${recomputedId} but receipt claims ${receipt.receiptId} (tampered)`);
}

// 2. anchor equality.
if (!isHex64(receipt.manifestRoot)) fail('receipt.manifestRoot is not a valid SHA-256');
if (receipt.manifestRoot.toLowerCase() !== onChainRoot.toLowerCase()) {
  fail(`manifest root ${receipt.manifestRoot} is not anchored on-chain (anchor=${onChainRoot})`);
}

// 3. Merkle inclusion proof folds model_id back to the manifest root.
if (!isHex64(receipt.modelId)) fail('receipt.modelId is not a valid SHA-256');
const folded = foldProof(receipt.modelId, proof);
if (folded === null) fail('inclusion proof has a malformed step');
if (folded.toLowerCase() !== receipt.manifestRoot.toLowerCase()) {
  fail(`inclusion proof does not reproduce the manifest root (folded ${folded})`);
}

process.stdout.write(
  `mcop-pouw verify: OK — kernel=${receipt.kernel} model_id=${receipt.modelId.slice(0, 12)}… ` +
    `root=${receipt.manifestRoot.slice(0, 12)}… anchored & proven\n`,
);
process.exit(0);
