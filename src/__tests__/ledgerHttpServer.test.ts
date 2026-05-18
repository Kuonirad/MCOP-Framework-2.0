/**
 * @jest-environment node
 *
 * Hosted Provenance Ledger — HTTP server smoke coverage.
 *
 * Drives the standalone Node HTTP server in
 * `services/ledger/src/server.ts` against a real socket and asserts
 * the full request/response shape for every endpoint plus the API-key
 * authorisation path.
 *
 * The server module is imported lazily so the env vars are set
 * before `createServer()` reads them.
 */

import type { AddressInfo } from 'node:net';

async function startServer(env: Record<string, string | undefined> = {}): Promise<{ port: number; close: () => Promise<void> }> {
  // Apply env before importing the module-level handler.
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    previous[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  jest.resetModules();
  const mod = await import('../../services/ledger/src/server');
  const app = mod.app;
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
  const port = (app.address() as AddressInfo).port;
  return {
    port,
    close: async () => {
      await new Promise<void>((resolve) => app.close(() => resolve()));
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

type JsonBody = Record<string, unknown> & {
  // Loose index signatures keep the test ergonomic without disabling lint.
  leafHash?: string;
  parentHash?: string;
  leaves?: ReadonlyArray<{ leafHash: string; parentHash?: string }>;
  forestRoot?: string;
  valid?: boolean;
  reason?: string;
  version?: string;
  status?: string;
  endpoints?: ReadonlyArray<string>;
  requiresApiKey?: boolean;
  tenantId?: string;
  error?: string;
};

async function postJson(
  port: number,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: JsonBody }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  return { status: res.status, body: parsed as JsonBody };
}

async function getJson(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: JsonBody }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  const parsed = await res.json().catch(() => ({}));
  return { status: res.status, body: parsed as JsonBody };
}

describe('mcop-ledger HTTP server', () => {
  it('GET /health returns ok', async () => {
    const { port, close } = await startServer();
    try {
      const { status, body } = await getJson(port, '/health');
      expect(status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('0.1.0');
    } finally {
      await close();
    }
  });

  it('full etch → query → verify → export round-trip', async () => {
    const { port, close } = await startServer();
    try {
      const e1 = await postJson(port, '/etch', { tenantId: 't1', context: [1, 0, 0], score: 0.8, note: 'first' });
      expect(e1.status).toBe(200);
      expect(e1.body.leafHash).toHaveLength(64);

      const e2 = await postJson(port, '/etch', { tenantId: 't1', context: [0, 1, 0], score: 0.9 });
      expect(e2.body.parentHash).toBe(e1.body.leafHash);

      const q = await postJson(port, '/query', { tenantId: 't1' });
      expect(q.body.leaves).toHaveLength(2);

      // The latest receipt verifies against the current forest. The
      // first receipt's forestRoot is now stale because the forest has
      // advanced — that's the expected append-only semantics.
      const v = await postJson(port, '/verify', e2.body);
      expect(v.body.valid).toBe(true);
      const vStale = await postJson(port, '/verify', e1.body);
      expect(vStale.body.valid).toBe(false);
      expect(vStale.body.reason).toMatch(/forest root/);

      const ex = await postJson(port, '/export', { tenantId: 't1' });
      expect(ex.body.version).toBe('mcop-ledger-export/1.0');
      expect(ex.body.leaves).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it('rejects POST without API key when MCOP_LEDGER_API_KEY is set', async () => {
    const { port, close } = await startServer({ MCOP_LEDGER_API_KEY: 'sekrit' });
    try {
      const { status } = await postJson(port, '/etch', { tenantId: 't', context: [1], score: 0.5 });
      expect(status).toBe(401);
    } finally {
      await close();
    }
  });

  it('accepts POST with matching API key', async () => {
    const { port, close } = await startServer({ MCOP_LEDGER_API_KEY: 'sekrit' });
    try {
      const { status, body } = await postJson(
        port,
        '/etch',
        { tenantId: 't', context: [1], score: 0.5 },
        { 'x-mcop-ledger-api-key': 'sekrit' },
      );
      expect(status).toBe(200);
      expect(body.tenantId).toBe('t');
    } finally {
      await close();
    }
  });

  it('returns 404 on unknown POST path', async () => {
    const { port, close } = await startServer();
    try {
      const { status } = await postJson(port, '/nope', {});
      expect(status).toBe(404);
    } finally {
      await close();
    }
  });

  it('GET /capabilities reports endpoints + auth state', async () => {
    const { port, close } = await startServer({ MCOP_LEDGER_API_KEY: 'k' });
    try {
      const { status, body } = await getJson(port, '/capabilities');
      expect(status).toBe(200);
      expect(body.endpoints).toEqual(expect.arrayContaining(['/etch', '/query', '/verify', '/export']));
      expect(body.requiresApiKey).toBe(true);
    } finally {
      await close();
    }
  });
});
