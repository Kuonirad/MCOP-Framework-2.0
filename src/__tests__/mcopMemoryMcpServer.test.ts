/**
 * Tests for examples/mcop_memory_mcp_server/server.ts.
 *
 * The server module is in `examples/`, outside the coverage scope, so we
 * import it via a relative path. We exercise `handleRequest` directly —
 * the stdio loop is a thin wrapper around it.
 */
import {
  handleRequest,
  tools,
  resources,
} from '../../examples/mcop_memory_mcp_server/server';
import { ensureTriad } from '../integrations/triadHarness';

function makeState() {
  return { triad: ensureTriad({ resonanceThreshold: 0.05 }) };
}

describe('mcop_memory_mcp_server', () => {
  it('initialize returns serverInfo + capabilities', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });
    const result = response.result as Record<string, unknown>;
    expect(result.serverInfo).toEqual({ name: 'mcop-memory', version: '0.1.0' });
    expect(result.capabilities).toBeDefined();
  });

  it('tools/list returns the four canonical memory tools', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    const result = response.result as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name)).toEqual([
      'mcop.memory.record',
      'mcop.memory.recall',
      'mcop.memory.merkleRoot',
      'mcop.memory.clear',
    ]);
    expect(tools.length).toBe(4);
  });

  it('resources/list enumerates the canonical MCOP memory resources', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    const result = response.result as { resources: Array<{ uri: string }> };
    expect(result.resources.map((r) => r.uri)).toEqual([
      'mcop://benchmark/snapshot',
      'mcop://memory/merkle-root',
    ]);
    expect(resources.length).toBe(2);
  });

  it('mcop.memory.record etches a trace and returns full provenance', async () => {
    const state = makeState();
    const response = await handleRequest(state, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'mcop.memory.record',
        arguments: { text: 'positive resonance memory' },
      },
    });
    const result = response.result as {
      provenance: { etchHash: string; merkleRoot: string };
      trace: { id: string; hash: string };
      etch: { hash: string };
    };
    expect(result.provenance.etchHash.length).toBeGreaterThan(0);
    expect(result.provenance.merkleRoot.length).toBeGreaterThan(0);
    expect(result.trace.hash.length).toBeGreaterThan(0);
    expect(result.etch.hash.length).toBeGreaterThan(0);
  });

  it('mcop.memory.recall returns score=0 when no traces have been recorded', async () => {
    const state = makeState();
    const response = await handleRequest(state, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'mcop.memory.recall',
        arguments: { query: 'unseen query' },
      },
    });
    const result = response.result as { score: number; trace: unknown };
    expect(result.score).toBe(0);
    expect(result.trace).toBeNull();
  });

  it('mcop.memory.recall returns the matching trace after a record', async () => {
    const state = makeState();
    await handleRequest(state, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'mcop.memory.record',
        arguments: { text: 'the holographic etch is rank-1 and replayable' },
      },
    });
    const response = await handleRequest(state, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'mcop.memory.recall',
        arguments: { query: 'the holographic etch is rank-1 and replayable' },
      },
    });
    const result = response.result as { score: number; trace: { hash: string } | null };
    expect(result.score).toBeGreaterThan(0);
    expect(result.trace?.hash).toBeDefined();
  });

  it('mcop.memory.merkleRoot returns null before any record', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'mcop.memory.merkleRoot', arguments: {} },
    });
    const result = response.result as { merkleRoot: string | null };
    expect(result.merkleRoot).toBeNull();
  });

  it('mcop.memory.merkleRoot returns the live root after a record', async () => {
    const state = makeState();
    await handleRequest(state, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'mcop.memory.record',
        arguments: { text: 'first record' },
      },
    });
    const response = await handleRequest(state, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'mcop.memory.merkleRoot', arguments: {} },
    });
    const result = response.result as { merkleRoot: string };
    expect(result.merkleRoot.length).toBeGreaterThan(0);
  });

  it('mcop.memory.clear resets the triad', async () => {
    const state = makeState();
    await handleRequest(state, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'mcop.memory.record',
        arguments: { text: 'before clear' },
      },
    });
    const cleared = await handleRequest(state, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'mcop.memory.clear', arguments: {} },
    });
    expect((cleared.result as { cleared: boolean }).cleared).toBe(true);
    const after = await handleRequest(state, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'mcop.memory.merkleRoot', arguments: {} },
    });
    expect((after.result as { merkleRoot: string | null }).merkleRoot).toBeNull();
  });

  it('resources/read returns the snapshot JSON for the benchmark resource', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'mcop://benchmark/snapshot' },
    });
    const result = response.result as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(result.contents[0].uri).toBe('mcop://benchmark/snapshot');
    expect(result.contents[0].mimeType).toBe('application/json');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed).toHaveProperty('runs');
    expect(parsed).toHaveProperty('capturedAt');
  });

  it('resources/read returns the empty Merkle root before any record', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'mcop://memory/merkle-root' },
    });
    const result = response.result as {
      contents: Array<{ text: string }>;
    };
    expect(result.contents[0].text).toBe('');
  });

  it('unknown method returns JSON-RPC -32601', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'definitely/not/a/thing',
    });
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32601);
  });

  it('unknown tool returns JSON-RPC -32000', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'mcop.memory.unknown', arguments: {} },
    });
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32000);
    expect(error.message).toMatch(/Unknown tool/);
  });

  it('unknown resource uri returns JSON-RPC -32000', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'mcop://unknown/resource' },
    });
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32000);
    expect(error.message).toMatch(/Unknown resource/);
  });

  it('malformed tools/call params is rejected with -32000', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: 'not an object',
    });
    expect((response.error as { code: number }).code).toBe(-32000);
  });

  it('record with missing text is rejected', async () => {
    const response = await handleRequest(makeState(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'mcop.memory.record', arguments: {} },
    });
    expect((response.error as { code: number; message: string }).message).toMatch(
      /text must be a non-empty string/,
    );
  });
});
