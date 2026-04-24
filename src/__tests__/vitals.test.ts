/**
 * @jest-environment node
 */
import { POST } from '../app/api/vitals/route';
import { NextRequest } from 'next/server';

function makeReq(body: string | object, init?: { headers?: Record<string, string> }) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new NextRequest(new URL('http://localhost/api/vitals'), {
    method: 'POST',
    body: text,
    headers: init?.headers ?? { 'content-type': 'application/json' },
  });
}

describe('POST /api/vitals', () => {
  it('accepts a well-formed LCP report with 204', async () => {
    const req = makeReq({ name: 'LCP', value: 2400, device: '4g', url: '/', ts: Date.now() });
    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  it('rejects unknown metrics with 400', async () => {
    const req = makeReq({ name: 'FOO', value: 1 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric values with 400', async () => {
    const req = makeReq({ name: 'LCP', value: 'nope' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const req = makeReq('{not json');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects oversize bodies with 413', async () => {
    const req = makeReq({ name: 'LCP', value: 1, pad: 'x'.repeat(4096) });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });
});
