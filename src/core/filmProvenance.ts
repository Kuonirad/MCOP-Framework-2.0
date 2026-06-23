// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Provenanced film — a long-form generated video whose every shot is
 * Merkle-traceable to its prompt, seed, adapter call, and the fingerprint of
 * the previously generated clip it conditioned on. The provenance **sidecar**
 * ships with the film; the credits are a root hash.
 *
 * ## What this composes
 *
 *   - {@link ./longFormVideoOrchestrator} already drives clip-by-clip
 *     generation with a **Direct Forcing** loop: each clip conditions on the
 *     *fingerprint of the previously generated clip*, not just the prompt, which
 *     is what holds a long sequence together against drift.
 *   - {@link ./reasoningReceipts} provides an append-only Merkle Mountain Range
 *     and verifiable receipts.
 *
 * This module binds them: each shot becomes a claim in the film's MMR, and the
 * shot record **cryptographically seals the Direct Forcing edge** — it carries
 * the digest of the prior clip's generated fingerprint and the leaf of the prior
 * shot. So the sidecar proves two things a viewer can check locally:
 *
 *   1. **Membership** — every shot belongs to the film with this root
 *      (`O(log n)` inclusion proof per shot, via the receipts).
 *   2. **Lineage** — shot *i* really conditioned on shot *i−1*'s actual output
 *      (the recorded `priorFingerprintDigest` matches shot *i−1*'s
 *      `fingerprintDigest`), so the Direct Forcing chain is tamper-evident.
 *
 * The Direct Forcing loop therefore does *real* cryptographic work here, not
 * ceremonial work: it is the same conditioning signal that fights drift,
 * promoted to a verifiable provenance edge.
 *
 * ## Trust boundary
 *
 * A valid sidecar proves the film was *assembled as recorded* — these shots, in
 * this order, each conditioned on the previous one's real output, unaltered
 * since the root was published. It does **not** prove the footage depicts
 * anything real, nor that the prompts' provenance is the *training data's*
 * provenance (provenance of a prompt is not provenance of a model). Say so in
 * the credits or the artifact overclaims.
 *
 * @see docs/PROVENANCED_FILM.md
 */

import type { ContextTensor } from './types';
import {
  leafEntryForClaim,
  receiptMatchesAnchor,
  ReasoningSession,
  verifyReceipt,
  type ReasoningReceipt,
} from './reasoningReceipts';

export const FILM_PROVENANCE_VERSION = 'mcop-film-provenance/1.0' as const;

/** What a caller supplies for one generated shot. */
export interface ShotProvenanceInput {
  readonly shotIndex: number;
  /** The prompt actually sent to the adapter (already augmented). */
  readonly prompt: string;
  /** Generation seed, if the adapter exposes one. */
  readonly seed?: number | string;
  /** Model identifier (e.g. `vidu-q1`, `kling-1.6`, `wan-2.1`). */
  readonly model?: string;
  /** Adapter/provider name. */
  readonly adapter?: string;
  readonly durationSeconds: number;
  readonly assetUrl: string;
  /** The generated clip's fingerprint (latent/feature vector). */
  readonly fingerprint: ContextTensor;
}

/**
 * The canonical, hashed record for one shot — the MMR claim. It does **not**
 * contain its own leaf digest (that is derived from it); it carries the prior
 * shot's leaf and the prior clip's fingerprint digest to seal the chain.
 */
export interface ShotProvenanceRecord {
  readonly shotIndex: number;
  readonly prompt: string;
  readonly seed: number | string | null;
  readonly model: string | null;
  readonly adapter: string | null;
  readonly durationSeconds: number;
  readonly assetUrl: string;
  /** Canonical digest of this shot's generated fingerprint. */
  readonly fingerprintDigest: string;
  /** Direct Forcing edge: digest of the clip this shot conditioned on (`null` for shot 0). */
  readonly priorFingerprintDigest: string | null;
  /** Chain edge: MMR leaf of the prior shot's record (`null` for shot 0). */
  readonly priorShotLeaf: string | null;
}

/** The shippable provenance sidecar. Mirrors a reasoning-session bundle. */
export interface FilmProvenanceSidecar {
  readonly version: typeof FILM_PROVENANCE_VERSION;
  readonly title?: string;
  /** The film's credit root — one hash that anchors every shot. */
  readonly creditRoot: string;
  readonly shotCount: number;
  /** Always `true` — shots are bound by the Direct Forcing chain. */
  readonly directForcing: true;
  readonly shots: ReadonlyArray<ShotProvenanceRecord>;
  readonly receipts: ReadonlyArray<ReasoningReceipt>;
}

export type ShotInvalidReason =
  | 'receipt-invalid'
  | 'root-mismatch'
  | 'shot-receipt-desync'
  | 'direct-forcing-broken'
  | 'chain-broken'
  | 'bad-genesis'
  /**
   * The sidecar's displayed shot record has no matching receipt — the credit
   * root never sealed it, so it MUST be treated as forged even if the sidecar
   * is otherwise structurally valid. Catches sidecars where `shots` was
   * extended (or `receipts` truncated) after the MMR root was published.
   */
  | 'unsealed-shot';

export interface FilmVerification {
  readonly valid: boolean;
  readonly creditRoot: string;
  readonly results: ReadonlyArray<{
    readonly shotIndex: number;
    readonly valid: boolean;
    readonly reason?: ShotInvalidReason;
  }>;
  /**
   * Present iff the sidecar's published `shotCount` disagrees with the number
   * of receipts the credit root actually seals. Forging this number alone —
   * without touching the root, shots, or receipts — is a one-line attack
   * against any consumer that surfaces the count (the {@link FilmCredits}
   * reader does). Without this cross-check, such a sidecar would still pass
   * verification while displaying an inflated shot count beside a
   * "PROVENANCE VERIFIED" badge. Same class of bug as the reasoning-bundle
   * `sizeMismatch` fix landed in #828.
   */
  readonly shotCountMismatch?: { readonly declared: number; readonly actual: number };
}

/**
 * Records shots into a film's append-only Merkle Mountain Range and emits the
 * verifiable provenance sidecar. Deterministic and pure with respect to its
 * inputs.
 */
export class FilmProvenanceRecorder {
  private readonly session: ReasoningSession;
  private readonly records: ShotProvenanceRecord[] = [];

  constructor(private readonly title?: string) {
    this.session = new ReasoningSession(title);
  }

  /** Seal one generated shot; returns its canonical record. */
  recordShot(input: ShotProvenanceInput): ShotProvenanceRecord {
    const prior = this.records[this.records.length - 1];
    const record: ShotProvenanceRecord = {
      shotIndex: input.shotIndex,
      prompt: input.prompt,
      seed: input.seed ?? null,
      model: input.model ?? null,
      adapter: input.adapter ?? null,
      durationSeconds: input.durationSeconds,
      assetUrl: input.assetUrl,
      fingerprintDigest: leafEntryForClaim(input.fingerprint),
      priorFingerprintDigest: prior ? prior.fingerprintDigest : null,
      priorShotLeaf: prior ? leafEntryForClaim(prior) : null,
    };
    this.session.addClaim(record);
    this.records.push(record);
    return record;
  }

  get shotCount(): number {
    return this.records.length;
  }

  /** The film's credit root. */
  creditRoot(): string {
    return this.session.root();
  }

  /** Export the sidecar that ships with the film. */
  sidecar(): FilmProvenanceSidecar {
    const bundle = this.session.export();
    return {
      version: FILM_PROVENANCE_VERSION,
      ...(this.title !== undefined ? { title: this.title } : {}),
      creditRoot: bundle.root,
      shotCount: bundle.size,
      directForcing: true,
      shots: this.records.slice(),
      receipts: bundle.receipts,
    };
  }
}

/**
 * Verify a film provenance sidecar end to end: every shot's receipt folds to the
 * credit root (membership), the displayed shot record matches its receipt, and
 * the Direct Forcing chain is intact (each shot recorded the real prior clip's
 * fingerprint and the real prior shot's leaf). Pure and browser-runnable.
 */
export function verifyFilmSidecar(sidecar: FilmProvenanceSidecar): FilmVerification {
  const results: Array<{ shotIndex: number; valid: boolean; reason?: ShotInvalidReason }> = [];

  // Iterate every shot AND every receipt so a sidecar with a length mismatch
  // surfaces the unsealed-shot / orphan-receipt rows instead of silently
  // ignoring the trailing entries. Without this, an attacker could append a
  // forged shot to a verified sidecar and the credit-root proof would still
  // come back "all valid" because the verification loop never visited the
  // extra index.
  const total = Math.max(sidecar.shots.length, sidecar.receipts.length);

  for (let i = 0; i < total; i += 1) {
    const receipt = sidecar.receipts[i];
    const shot = sidecar.shots[i];
    let valid = true;
    let reason: ShotInvalidReason | undefined;

    if (!receipt) {
      // Shot is displayed in the sidecar but the credit root never sealed it.
      valid = false;
      reason = 'unsealed-shot';
    } else {
      const verification = verifyReceipt(receipt);
      if (!verification.valid) {
        valid = false;
        reason = 'receipt-invalid';
      } else if (!receiptMatchesAnchor(receipt, sidecar.creditRoot)) {
        valid = false;
        reason = 'root-mismatch';
      } else if (!shot || leafEntryForClaim(shot) !== receipt.leafEntry) {
        // The human-readable shot record must be exactly what the receipt sealed.
        valid = false;
        reason = 'shot-receipt-desync';
      } else if (i === 0) {
        if (shot.priorFingerprintDigest !== null || shot.priorShotLeaf !== null) {
          valid = false;
          reason = 'bad-genesis';
        }
      } else {
        const prev = sidecar.shots[i - 1];
        if (!prev || shot.priorFingerprintDigest !== prev.fingerprintDigest) {
          valid = false;
          reason = 'direct-forcing-broken';
        } else if (shot.priorShotLeaf !== leafEntryForClaim(prev)) {
          valid = false;
          reason = 'chain-broken';
        }
      }
    }

    const shotIndex = shot ? shot.shotIndex : i;
    results.push({ shotIndex, valid, ...(reason ? { reason } : {}) });
  }

  // Cross-check the published `shotCount`. Receipts are what the credit root
  // actually binds, so they are the cryptographic ground truth for "how many
  // shots are in this film". A forger who only edits `shotCount` — leaving
  // the root, shots, and receipts byte-identical to a verified sidecar — must
  // be caught here, otherwise the FilmCredits reader (which renders
  // `sidecar.shotCount` directly under a "PROVENANCE VERIFIED" badge) would
  // happily show 99 shots when the root only seals 3. This is the parallel
  // of the reasoning-bundle `sizeMismatch` fix landed in #828.
  const shotCountOk = sidecar.shotCount === sidecar.receipts.length;
  const allValid = shotCountOk && results.every((r) => r.valid);
  return {
    valid: allValid,
    creditRoot: sidecar.creditRoot,
    results,
    ...(shotCountOk
      ? {}
      : { shotCountMismatch: { declared: sidecar.shotCount, actual: sidecar.receipts.length } }),
  };
}
