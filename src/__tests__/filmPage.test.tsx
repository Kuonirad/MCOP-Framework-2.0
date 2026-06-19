// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/** @fileoverview DOM tests for the provenanced-film verifier page. */

import React from "react";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { FilmCredits } from "../app/film/_components/FilmCredits";
import FilmPage from "../app/film/page";

const SIDECAR_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "public",
  "films",
  "lunar-documentary.provenance.json",
);
const SIDECAR = JSON.parse(readFileSync(SIDECAR_PATH, "utf8"));

function sidecarWithUnsealedShot(): typeof SIDECAR {
  const lastShot = SIDECAR.shots[SIDECAR.shots.length - 1];
  return {
    ...SIDECAR,
    shots: [
      ...SIDECAR.shots,
      {
        ...lastShot,
        shotIndex: SIDECAR.shots.length,
        prompt: "forged trailer shot that the credit root never sealed",
        seed: "forged",
        assetUrl: "https://attacker.example/forged.mp4",
        fingerprintDigest: "f".repeat(64),
        priorFingerprintDigest: lastShot.fingerprintDigest,
        priorShotLeaf: "e".repeat(64),
      },
    ],
  };
}

function mockFetchOnce(body: unknown, ok = true): void {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
  });
}

describe("FilmPage", () => {
  beforeEach(() => mockFetchOnce(SIDECAR));

  it("renders the heading and the trust-boundary caveat", () => {
    render(<FilmPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /credits are a root hash/i,
    );
    expect(screen.getByText(/does\s+not\s*$|depicts anything real/i)).toBeInTheDocument();
  });
});

describe("FilmCredits", () => {
  beforeEach(() => mockFetchOnce(SIDECAR));

  it("verifies the whole film sidecar locally", async () => {
    render(<FilmCredits sidecarUrl="/films/lunar-documentary.provenance.json" />);
    await waitFor(() =>
      expect(screen.getByText(/PROVENANCE VERIFIED/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(SIDECAR.shotCount);
    expect(screen.getByText(/opening shot \(genesis/i)).toBeInTheDocument();
  });

  it("breaks the lineage when a shot prompt is edited", async () => {
    render(<FilmCredits sidecarUrl="/films/lunar-documentary.provenance.json" />);
    await waitFor(() => expect(screen.getByText(/PROVENANCE VERIFIED/i)).toBeInTheDocument());

    fireEvent.change(screen.getAllByRole("textbox")[2], {
      target: { value: "a forged shot the credit root never witnessed" },
    });

    await waitFor(() => expect(screen.getByText(/PROVENANCE BROKEN/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /restore original/i }));
    await waitFor(() => expect(screen.getByText(/PROVENANCE VERIFIED/i)).toBeInTheDocument());
  });

  it("marks an appended unsealed shot as broken in the reader", async () => {
    mockFetchOnce(sidecarWithUnsealedShot());
    render(<FilmCredits sidecarUrl="/films/lunar-documentary.provenance.json" />);

    await waitFor(() => expect(screen.getByText(/PROVENANCE BROKEN/i)).toBeInTheDocument());

    expect(screen.getAllByRole("textbox")).toHaveLength(SIDECAR.shotCount + 1);
    expect(
      screen.getByDisplayValue(/forged trailer shot that the credit root never sealed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/broken: unsealed-shot/i)).toBeInTheDocument();
    expect(screen.queryByText(/PROVENANCE VERIFIED/i)).not.toBeInTheDocument();
  });

  it("surfaces a load error instead of crashing", async () => {
    mockFetchOnce({}, false);
    render(<FilmCredits sidecarUrl="/films/missing.json" />);
    await waitFor(() =>
      expect(screen.getByText(/Could not load the sidecar/i)).toBeInTheDocument(),
    );
  });
});
