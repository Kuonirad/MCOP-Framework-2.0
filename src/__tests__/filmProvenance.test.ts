// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  FilmProvenanceRecorder,
  verifyFilmSidecar,
  type FilmProvenanceSidecar,
  type ShotProvenanceInput,
} from '../core/filmProvenance';
import { leafEntryForClaim } from '../core/reasoningReceipts';

function shot(i: number, fp: number[]): ShotProvenanceInput {
  return {
    shotIndex: i,
    prompt: `[shot ${i}] the rover crests a grey ridge under earthlight`,
    seed: 1000 + i,
    model: 'wan-2.1',
    adapter: 'stub',
    durationSeconds: 5,
    assetUrl: `https://cdn.example/lunar/clip-${i}.mp4`,
    fingerprint: fp,
  };
}

function makeFilm(n: number): FilmProvenanceRecorder {
  const film = new FilmProvenanceRecorder('Lunar Documentary');
  for (let i = 0; i < n; i += 1) {
    // Distinct, deterministic fingerprints per shot.
    film.recordShot(shot(i, [i + 1, (i + 1) * 0.5, (i + 1) * -0.25, Math.sin(i + 1)]));
  }
  return film;
}

describe('FilmProvenanceRecorder — sealing shots', () => {
  test('genesis shot has null prior edges; later shots bind the prior clip', () => {
    const film = makeFilm(4);
    const sidecar = film.sidecar();
    expect(sidecar.shots[0].priorFingerprintDigest).toBeNull();
    expect(sidecar.shots[0].priorShotLeaf).toBeNull();
    for (let i = 1; i < sidecar.shots.length; i += 1) {
      // Direct Forcing edge: shot i recorded shot i-1's actual fingerprint digest.
      expect(sidecar.shots[i].priorFingerprintDigest).toBe(sidecar.shots[i - 1].fingerprintDigest);
      // Chain edge: shot i names shot i-1's MMR leaf.
      expect(sidecar.shots[i].priorShotLeaf).toBe(leafEntryForClaim(sidecar.shots[i - 1]));
    }
  });

  test('the credits are a root hash that anchors every shot', () => {
    const film = makeFilm(5);
    const sidecar = film.sidecar();
    expect(sidecar.creditRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(sidecar.shotCount).toBe(5);
    for (const receipt of sidecar.receipts) expect(receipt.root).toBe(sidecar.creditRoot);
  });
});

describe('verifyFilmSidecar — the viewer becomes the auditor', () => {
  test('a clean sidecar verifies end to end', () => {
    const result = verifyFilmSidecar(makeFilm(6).sidecar());
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(6);
    expect(result.results.every((r) => r.valid)).toBe(true);
  });

  test('tampering a shot prompt breaks that shot (membership)', () => {
    const sidecar = makeFilm(5).sidecar();
    const shots = sidecar.shots.map((s, i) =>
      i === 2 ? { ...s, prompt: 'forged narration never shot' } : s,
    );
    const result = verifyFilmSidecar({ ...sidecar, shots } as FilmProvenanceSidecar);
    expect(result.valid).toBe(false);
    expect(result.results.find((r) => !r.valid)?.reason).toBe('shot-receipt-desync');
  });

  test('forging the Direct Forcing edge is caught', () => {
    const sidecar = makeFilm(5).sidecar();
    // Re-point shot 3 to claim it conditioned on a different prior fingerprint.
    const shots = sidecar.shots.map((s, i) =>
      i === 3 ? { ...s, priorFingerprintDigest: leafEntryForClaim([9, 9, 9, 9]) } : s,
    );
    const result = verifyFilmSidecar({ ...sidecar, shots } as FilmProvenanceSidecar);
    expect(result.valid).toBe(false);
    // The edited shot no longer matches its receipt (it was sealed), so the
    // desync is caught before the chain check even runs — either way it fails.
    const bad = result.results.find((r) => !r.valid);
    expect(bad?.shotIndex).toBe(3);
    expect(['shot-receipt-desync', 'direct-forcing-broken']).toContain(bad?.reason);
  });

  test('reordering shots is caught (lineage is order-bound)', () => {
    const sidecar = makeFilm(5).sidecar();
    const shots = [...sidecar.shots];
    [shots[2], shots[3]] = [shots[3], shots[2]];
    const result = verifyFilmSidecar({ ...sidecar, shots } as FilmProvenanceSidecar);
    expect(result.valid).toBe(false);
  });

  test('a single-shot film is a valid genesis-only sidecar', () => {
    const result = verifyFilmSidecar(makeFilm(1).sidecar());
    expect(result.valid).toBe(true);
  });

  test('appending an extra unsealed shot to a verified sidecar breaks verification', () => {
    // Forged scenario: an attacker takes a legitimately verified sidecar and
    // appends one extra "shot" entry without producing a matching receipt.
    // The credit root still anchors the original N shots, but the displayed
    // sidecar.shots array now contains N+1 entries — every reader-as-verifier
    // surface that iterates sidecar.shots (e.g. the /film page) would render
    // the forged shot alongside the legitimate ones. The verifier MUST refuse.
    const original = makeFilm(3).sidecar();
    const forgedShot = {
      shotIndex: 3,
      prompt: 'forged narration that was never generated',
      seed: 9999,
      model: 'wan-2.1',
      adapter: 'stub',
      durationSeconds: 5,
      assetUrl: 'https://attacker.example/clip-3.mp4',
      fingerprintDigest: leafEntryForClaim([99, 99, 99, 99]),
      // Chain edges left as if conditioned on the real last shot, so a
      // naive pairwise chain check alone would also pass.
      priorFingerprintDigest: original.shots[2].fingerprintDigest,
      priorShotLeaf: leafEntryForClaim(original.shots[2]),
    } as const;
    const tampered: FilmProvenanceSidecar = {
      ...original,
      shots: [...original.shots, forgedShot],
    };
    const result = verifyFilmSidecar(tampered);
    expect(result.valid).toBe(false);
    // The forged trailing shot must be reported as invalid, not silently
    // dropped from the result set — otherwise a downstream UI displaying
    // sidecar.shots could still render it without any error indicator.
    const bad = result.results.find((r) => r.shotIndex === 3);
    expect(bad?.valid).toBe(false);
    expect(bad?.reason).toBe('unsealed-shot');
  });

  test('appending an orphan receipt with no matching shot is caught', () => {
    const original = makeFilm(3).sidecar();
    const orphanReceipt = original.receipts[0];
    const tampered: FilmProvenanceSidecar = {
      ...original,
      receipts: [...original.receipts, orphanReceipt],
    };
    const result = verifyFilmSidecar(tampered);
    expect(result.valid).toBe(false);
    expect(result.results).toHaveLength(4);
    expect(result.results[3]).toEqual({
      shotIndex: 3,
      valid: false,
      reason: 'shot-receipt-desync',
    });
  });
});
