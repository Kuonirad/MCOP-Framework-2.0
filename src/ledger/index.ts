/**
 * MCOP Hosted Provenance Ledger.
 *
 * - {@link LedgerService}: core multi-tenant Merkle forest with
 *   in-memory + pluggable storage adapters.
 * - {@link LedgerClient}: transport-agnostic MCOP-side adapter with
 *   automatic local fallback.
 * - {@link createLedgerClient}: the canonical one-line entry point.
 *
 * See `docs/HOSTED_PROVENANCE_LEDGER.md` for the operator runbook.
 */

export * from './types';
export * from './ledgerService';
export * from './ledgerClient';
