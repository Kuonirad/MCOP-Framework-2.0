/**
 * Standalone HTTP server for the MCOP Hosted Provenance Ledger.
 *
 * Run with:
 *
 * ```bash
 * node --experimental-strip-types services/ledger/src/server.ts
 * ```
 *
 * Endpoints:
 *
 *   - `GET  /health`           — liveness probe.
 *   - `GET  /capabilities`     — feature flags + version.
 *   - `POST /etch`             — append a leaf; returns {@link EtchReceipt}.
 *   - `POST /query`            — filter leaves; returns {@link LedgerQueryResult}.
 *   - `POST /verify`           — verify a receipt; returns {@link VerifyResult}.
 *   - `POST /export`           — full export bundle for offline verification.
 *
 * Authentication: the server honours an optional
 * `MCOP_LEDGER_API_KEY` env var. When set, every POST request must
 * include an `x-mcop-ledger-api-key` header matching the configured
 * value (constant-time compared).
 *
 * Multi-tenancy: tenants are derived from the request body's
 * `tenantId` field; the API key is checked once at the boundary.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import {
  LedgerService,
  InMemoryStorageAdapter,
  type EtchReceipt,
} from '../../../src/ledger';

const PORT = Number(process.env.MCOP_LEDGER_PORT ?? 8767);
const HOST = process.env.MCOP_LEDGER_HOST ?? '0.0.0.0';
const API_KEY = process.env.MCOP_LEDGER_API_KEY;
const VERSION = '0.1.0';

const service = new LedgerService({ storage: new InMemoryStorageAdapter() });

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function authorised(req: IncomingMessage): boolean {
  if (!API_KEY) return true;
  const provided = req.headers['x-mcop-ledger-api-key'];
  if (typeof provided !== 'string') return false;
  return constantTimeEquals(provided, API_KEY);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8') || '{}';
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(raw),
  });
  res.end(raw);
}

const handlers: Record<string, (body: unknown) => Promise<unknown>> = {
  '/etch': async (body) => service.etch(body as Parameters<LedgerService['etch']>[0]),
  '/query': async (body) => service.query(body as Parameters<LedgerService['query']>[0]),
  '/verify': async (body) => service.verifyReceipt(body as EtchReceipt),
  '/export': async (body) =>
    service.exportFullLedger((body as { tenantId: string }).tenantId),
};

export const app = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      writeJson(res, 200, { status: 'ok', version: VERSION, timestamp: new Date().toISOString() });
      return;
    }
    if (req.method === 'GET' && req.url === '/capabilities') {
      writeJson(res, 200, {
        version: VERSION,
        endpoints: Object.keys(handlers),
        requiresApiKey: API_KEY !== undefined,
      });
      return;
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!authorised(req)) {
      writeJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const handler = req.url ? handlers[req.url] : undefined;
    if (!handler) {
      writeJson(res, 404, { error: 'not_found', path: req.url });
      return;
    }
    const body = await readJson(req);
    const result = await handler(body);
    writeJson(res, 200, result);
  } catch (err) {
    if (err instanceof Error) {
      console.error('Request handling failed:', err.stack ?? err.message);
    } else {
      console.error('Request handling failed:', String(err));
    }
    writeJson(res, 400, { error: 'bad_request' });
  }
});

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  app.listen(PORT, HOST, () => {
    process.stdout.write(`mcop-ledger v${VERSION} listening on http://${HOST}:${PORT}\n`);
  });
}
