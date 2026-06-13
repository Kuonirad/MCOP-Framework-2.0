// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Cross-Runtime Reasoning-Receipt Parity Guardian — TypeScript side.
 *
 * The golden fixture `tests/parity/reasoningReceipts.golden.json` is GENERATED
 * by the Python runtime (`tests/parity/generate_reasoning_receipts_fixtures.py`).
 * This test rebuilds the same reasoning session in TypeScript and asserts the
 * root, every receipt id, and every inclusion proof are byte-identical — and
 * that the TS verifier accepts the Python-issued receipts. The Python
 * counterpart (`mcop_package/tests/parity/test_reasoning_receipts_parity.py`)
 * checks the mirror direction, so a divergence in either runtime's MMR math,
 * canonical encoding, or receipt framing fails the affected side.
 *
 * Regenerate after intentionally changing the fixture:
 *
 *     python3 tests/parity/generate_reasoning_receipts_fixtures.py
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";

import {
  ReasoningSession,
  verifyReceipt,
  receiptMatchesAnchor,
  type ReasoningReceipt,
  type ReasoningSessionBundle,
} from "../core/reasoningReceipts";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GOLDEN_PATH = path.join(REPO_ROOT, "tests", "parity", "reasoningReceipts.golden.json");
const PUBLIC_BUNDLE_PATH = path.join(REPO_ROOT, "public", "receipts", "d1-calibration.json");

describe("Cross-Runtime Reasoning-Receipt Parity (TS)", () => {
  const golden: ReasoningSessionBundle = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

  test("TS rebuilds the Python-generated root byte-for-byte", () => {
    const session = new ReasoningSession(golden.title);
    for (const claim of golden.claims) session.addClaim(claim);
    expect(session.size).toBe(golden.size);
    expect(session.root()).toBe(golden.root);
  });

  test("TS regenerates every Python receipt byte-for-byte", () => {
    const session = new ReasoningSession(golden.title);
    for (const claim of golden.claims) session.addClaim(claim);
    golden.receipts.forEach((goldenReceipt, i) => {
      const tsReceipt = session.receiptFor(i);
      expect(tsReceipt).toEqual(goldenReceipt);
    });
  });

  test("the TS verifier accepts every Python-issued receipt against the published root", () => {
    for (const receipt of golden.receipts as ReasoningReceipt[]) {
      expect(verifyReceipt(receipt)).toEqual({ valid: true });
      expect(receiptMatchesAnchor(receipt, golden.root)).toBe(true);
    }
  });

  test("the published web bundle is byte-identical to the parity golden", () => {
    const publicBundle = readFileSync(PUBLIC_BUNDLE_PATH, "utf8");
    const goldenRaw = readFileSync(GOLDEN_PATH, "utf8");
    expect(publicBundle).toBe(goldenRaw);
  });
});
