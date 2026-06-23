// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/** @fileoverview DOM tests for the reader-as-verifier receipts page. */

import React from "react";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ReceiptVerifier } from "../app/verify/_components/ReceiptVerifier";
import VerifyPage from "../app/verify/page";

const BUNDLE_PATH = path.resolve(__dirname, "..", "..", "public", "receipts", "d1-calibration.json");
const BUNDLE = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));

function mockFetchOnce(body: unknown, ok = true): void {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
}

describe("VerifyPage", () => {
  beforeEach(() => mockFetchOnce(BUNDLE));

  it("renders the page heading and the trust-boundary caveat", () => {
    render(<VerifyPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /Verifiable Reasoning Receipts/i,
    );
    // The page must say plainly what a receipt does NOT prove.
    expect(screen.getByText(/prove the claim is\s+true/i)).toBeInTheDocument();
  });
});

describe("ReceiptVerifier", () => {
  beforeEach(() => mockFetchOnce(BUNDLE));

  it("verifies every published receipt locally and reports all-valid", async () => {
    render(<ReceiptVerifier bundleUrl="/receipts/d1-calibration.json" />);
    await waitFor(() =>
      expect(screen.getByText(/ALL RECEIPTS VERIFIED/i)).toBeInTheDocument(),
    );
    // One editable claim box per leaf.
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(BUNDLE.size);
  });

  it("breaks the proof when the reader edits a claim (tamper-evident in-browser)", async () => {
    render(<ReceiptVerifier bundleUrl="/receipts/d1-calibration.json" />);
    await waitFor(() => expect(screen.getByText(/ALL RECEIPTS VERIFIED/i)).toBeInTheDocument());

    fireEvent.change(screen.getAllByRole("textbox")[0], {
      target: { value: "forged claim text the root never witnessed" },
    });

    await waitFor(() => expect(screen.getByText(/VERIFICATION FAILED/i)).toBeInTheDocument());
    expect(screen.getByText(/broken: claim-leaf-mismatch/i)).toBeInTheDocument();

    // Restoring the original re-verifies — the proof folds again.
    fireEvent.click(screen.getByRole("button", { name: /restore original/i }));
    await waitFor(() => expect(screen.getByText(/ALL RECEIPTS VERIFIED/i)).toBeInTheDocument());
  });

  it("surfaces a load error instead of crashing", async () => {
    mockFetchOnce({}, false);
    render(<ReceiptVerifier bundleUrl="/receipts/missing.json" />);
    await waitFor(() =>
      expect(screen.getByText(/Could not load the session bundle/i)).toBeInTheDocument(),
    );
  });

  // Regression for the bundle-level analog of #828: a forger publishing the
  // real receipts but inflating `bundle.size` would have shown
  // "ALL RECEIPTS VERIFIED" + "Claims: 999" because the page only iterated
  // bundle.receipts and never validated the displayed count. The page must
  // now run verifyBundle and fail the badge on size-lie / unsealed-claim
  // / orphan-receipt / claim-bundle-mismatch — the same contract the SDK
  // verifier exposes.
  it("rejects an inflated bundle.size even when every receipt is internally valid", async () => {
    const forged = { ...BUNDLE, size: BUNDLE.receipts.length + 999 };
    mockFetchOnce(forged);
    render(<ReceiptVerifier bundleUrl="/receipts/d1-calibration.json" />);
    await waitFor(() =>
      expect(screen.getByText(/VERIFICATION FAILED/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/declared size .* disagrees with the .* sealed receipts/i),
    ).toBeInTheDocument();
  });

  it("rejects unsealed claims appended to bundle.claims past the receipt list", async () => {
    const forged = {
      ...BUNDLE,
      claims: [
        ...BUNDLE.claims,
        { id: 999, kind: "forged", text: "unsealed claim — never went into the MMR" },
      ],
    };
    mockFetchOnce(forged);
    render(<ReceiptVerifier bundleUrl="/receipts/d1-calibration.json" />);
    await waitFor(() =>
      expect(screen.getByText(/VERIFICATION FAILED/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/unsealed-claim/i)).toBeInTheDocument();
  });

  it("rejects an orphan-receipt forgery that truncates bundle.claims", async () => {
    const forged = {
      ...BUNDLE,
      claims: BUNDLE.claims.slice(0, BUNDLE.claims.length - 1),
    };
    mockFetchOnce(forged);
    render(<ReceiptVerifier bundleUrl="/receipts/d1-calibration.json" />);
    await waitFor(() =>
      expect(screen.getByText(/VERIFICATION FAILED/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/orphan-receipt/i)).toBeInTheDocument();
  });
});
