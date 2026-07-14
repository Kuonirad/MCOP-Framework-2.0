# Hosted Provenance Ledger — Operator + Integrator Runbook

> Companion to [`docs/CUDA_PRODUCTION.md`](./CUDA_PRODUCTION.md) and
> [`docs/DISTRIBUTED_CLUSTER_MODE.md`](./DISTRIBUTED_CLUSTER_MODE.md).
> The Hosted Provenance Ledger gives teams **zero-ops auditability**
> for the MCOP holographic etch + provenance chain while letting them
> cryptographically verify every history they ingest.

## Vision

A managed or self-hostable service that teams plug into for
`etch / query / verify` operations without operating their own
persistent store, while retaining the ability to cryptographically
audit everything end-to-end.

## Surface

| Verb / endpoint | Description                                  |
| --------------- | -------------------------------------------- |
| `POST /etch`    | Append a leaf; returns a self-verifying `EtchReceipt`. |
| `POST /query`   | Filter leaves by tenant / window / score.    |
| `POST /verify`  | Verify a previously-issued receipt against the tenant's current forest. |
| `POST /export`  | Full export bundle for offline verification. |
| `GET /health`   | Liveness probe.                              |
| `GET /capabilities` | Endpoint listing + auth state.          |

## One-line MCOP integration

```ts
// Source checkout only; the hosted-ledger client is not a public npm export.
import { createLedgerClient } from './src/ledger';

const ledger = createLedgerClient({
  type: 'hosted',              // 'hosted' | 'self-host' | 'embedded'
  endpoint: 'https://ledger.mcop.ai',
  apiKey: process.env.MCOP_LEDGER_API_KEY,
});

const receipt = await ledger.etch({
  tenantId: 'team-orion',
  context: tensor,
  score: 0.82,
  note: 'positive-resonance run',
});
```

### Automatic local fallback

The client transparently falls back to an in-process
`LedgerService` when the hosted endpoint is unreachable. Receipts
issued during the fallback window are annotated with
`metadata.source: 'local-fallback'` so the audit log can distinguish
hosted vs locally-mirrored etches. Disable with `fallback: false`
if you need hard failures instead.

## Storage adapters

```ts
interface LedgerStorageAdapter {
  appendLeaf(leaf: LedgerLeaf): Promise<void> | void;
  listLeaves(tenantId: TenantId): Promise<ReadonlyArray<LedgerLeaf>> | ReadonlyArray<LedgerLeaf>;
  getLastLeaf(tenantId: TenantId): Promise<LedgerLeaf | undefined> | LedgerLeaf | undefined;
}
```

Ships with `InMemoryStorageAdapter`. Postgres + S3-compatible
implementations are deliberate follow-ups using the same interface
so the swap is one line.

## Cryptographic invariants

- **Multi-tenant Merkle forests.** Every record lives under a
  `tenantId`. Forest root = canonical SHA-256 over `{tenantId,
  leafHashes: [...]}` taken in insertion order — byte-stable across
  runtimes.
- **Self-verifying receipts.** `EtchReceipt` bundles the leaf hash,
  the parent hash (chain pointer), the current forest root, and an
  inclusion proof. `verifyReceipt(receipt)` checks all three
  conditions.
- **Stateless export verification.** `LedgerService.verifyBundle()`
  is a pure function — it works against any caller-supplied
  bundle, including air-gapped audit reviews.
- **Append-only semantics.** Receipts seal the forest root *at the
  moment of issuance*. Subsequent etches advance the root, so an
  older receipt's `forestRoot` will not match — that's the
  intended audit signal, not a bug.

## Verify CLI

```bash
node scripts/mcop-ledger-verify.mjs --bundle ./export.json
# → mcop-ledger verify: OK — tenant=t1 leaves=42 root=…
```

Exit codes: `0 = valid`, `1 = invalid`, `2 = usage error`. The CLI
does not call out to any remote ledger — drop the bundle on an
air-gapped machine and verify there.

## Self-hosting

### Docker Compose

```bash
MCOP_LEDGER_API_KEY=$(openssl rand -hex 24) docker compose --profile ledger up -d
```

The service listens on `:8767` by default. Configure via env vars:

| Variable                  | Default      | Description                                  |
| ------------------------- | ------------ | -------------------------------------------- |
| `MCOP_LEDGER_HOST`        | `0.0.0.0`    | Bind host.                                   |
| `MCOP_LEDGER_PORT`        | `8767`       | Bind port.                                   |
| `MCOP_LEDGER_API_KEY`     | _(unset)_    | When set, every POST must include `x-mcop-ledger-api-key`. |

### Helm

```bash
helm install mcop-ledger ./services/ledger/helm/mcop-ledger \
  --set apiKey=$(openssl rand -hex 24) \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=ledger.example.com
```

The chart at [`services/ledger/helm/mcop-ledger/`](../services/ledger/helm/mcop-ledger/)
ships with deployment, service, secret (apiKey), and ingress
templates. Liveness + readiness probes hit `/health`.

## Phase ladder

| Phase | Status | What ships |
| ----- | ------ | ---------- |
| 0 — Service design | ✅ shipped | API + receipt + bundle schema |
| 1 — Core implementation (self-host first) | ✅ shipped | `LedgerService`, in-memory adapter, docker-compose `ledger` profile, Helm chart |
| 2 — Hosted / managed offering | ⏳ follow-on | Vercel / Fly.io / AWS recipes + managed Postgres adapter |
| 3 — Verification & trust layer | ✅ shipped | `verifyReceipt`, `verifyBundle`, `scripts/mcop-ledger-verify.mjs` |
| 4 — Integration & DX | ✅ shipped | `createLedgerClient({ type, endpoint, apiKey })` one-liner + local fallback |

## Wire format

Etch receipt:

```json
{
  "id":          "<uuid>",
  "tenantId":    "team-orion",
  "leafHash":    "<sha256>",
  "parentHash":  null,
  "forestRoot":  "<sha256>",
  "inclusionProof": ["<sha256>", "..."],
  "sealedAt":    "2026-05-18T05:48:00Z"
}
```

Ledger export bundle:

```json
{
  "version":     "mcop-ledger-export/1.0",
  "tenantId":    "team-orion",
  "forestRoot":  "<sha256>",
  "exportedAt":  "...",
  "leaves": [
    {
      "id": "<uuid>",
      "tenantId": "team-orion",
      "leafHash": "<sha256>",
      "parentHash": "<sha256>",
      "payloadHash": "<sha256>",
      "createdAt": "2026-05-18T05:48:00Z"
    }
  ]
}
```

## Audit story

A tenant downloads the export bundle on a schedule. They run
`scripts/mcop-ledger-verify.mjs --bundle <path>` to confirm the
sealed root matches the leaf chain. They replay the bundle locally
against their MCOP nodes (using `LedgerService.verifyBundle()` or
the JS client's `embedded` mode) and assert each etch they observed
locally is present in the bundle with the same `leafHash`. The two
checks together close the trust loop without requiring trust in the
ledger operator.
