# Regulated Provenance Adapter v0.3

Status: implemented.

The Regulated Provenance Adapter maps standard MCOP adapter provenance into
regulator-friendly envelopes without claiming domain correctness. It is intended
for governed decision-support pilots that need replayable lineage across finance
and healthcare review workflows.

## Scope boundary

MCOP provenance proves process integrity only:

- NOVA-NEO tensor hash for the encoded input.
- Stigmergy trace ID / Merkle hash for resonance memory.
- Holographic Etch Merkle root for append-only replay.
- Timestamp, resonance score, etch delta, and human-in-the-loop refined prompt
  hash.

It does **not** certify clinical correctness, financial suitability, HIPAA
compliance, FDA clearance, BAA readiness, or model-risk approval. Those remain
local governance obligations.

## TypeScript usage

```ts
import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '@/core';
import { RegulatedProvenanceAdapter } from '@/adapters';

const adapter = new RegulatedProvenanceAdapter({
  encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
  stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
  etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
  custodianOrg: 'KULLAI-LABS',
});

const { result, merkleRoot } = await adapter.generate({
  prompt: 'risk-review decision support trace',
  domain: 'finance',
  payload: {
    target: 'both',
    subjectId: 'case-123',
    operatorId: 'human-reviewer-7',
    sourceInstitutionId: 'BANK-A',
    receiverInstitutionId: 'AUDITOR-B',
  },
});

console.log(merkleRoot, result.fhir, result.iso20022);
```

## FHIR mapping

`mapProvenanceToFHIR()` emits a compact FHIR `Provenance` resource shape:

| FHIR field | MCOP source |
| --- | --- |
| `recorded` | adapter provenance timestamp |
| `target[0].reference` | `payload.targetReference` or `DocumentReference/{subjectId}` |
| `agent[0]` | deterministic MCOP triad assembler |
| `agent[1]` | accountable human operator |
| `entity[tensorHash]` | NOVA-NEO tensor hash |
| `entity[traceHash]` | Stigmergy Merkle trace hash, when present |
| `entity[etchHash]` | Holographic Etch Merkle root |
| `signature[0].data` | etch hash / replay root |
| `extension[verificationStatus]` | `SEALED` when required hashes are 64-char hex roots |

## ISO 20022 mapping

`mapProvenanceToISO20022()` emits a lightweight business envelope:

| ISO-style field | MCOP source |
| --- | --- |
| `AppHdr.Fr` / `AppHdr.To` | source and receiver institution IDs |
| `AppHdr.BizMsgIdr` | caller-provided ID or `MCOP-{etchHash prefix}` |
| `AppHdr.MsgDefIdr` | caller-provided message definition or `mcop.prvc.002.001.00` |
| `Document.MCOPrvnc.PrvcRoot` | Holographic Etch Merkle root |
| `Document.MCOPrvnc.TnsrHash` | NOVA-NEO tensor hash |
| `Document.MCOPrvnc.TraceId` / `TraceHash` | Stigmergy trace metadata |
| `Document.MCOPrvnc.RefinedPromptHash` | SHA-256 of human-reviewed refined prompt |
| `Document.MCOPrvnc.VrfctnSts` | `SEALED` or `UNVERIFIED` |

## Verification status

`deriveVerificationStatus()` returns:

- `SEALED` when `tensorHash` and `etchHash` are both 64-character lowercase
  hexadecimal roots.
- `UNVERIFIED` otherwise.

This status is intentionally narrow. It is a cryptographic-format assertion for
process lineage, not a statement about business, medical, legal, or regulatory
fitness.
