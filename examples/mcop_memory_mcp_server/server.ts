/**
 * MCOP Memory MCP server.
 *
 * Exposes the MCOP triad (NOVA-NEO + Stigmergy v5 + Holographic Etch) as a
 * stdio-MCP server so any MCP-aware client (Claude Desktop, Cursor,
 * Continue) can use MCOP as a Merkle-rooted memory layer with one
 * configuration entry, e.g. for Claude Desktop:
 *
 *   {
 *     "mcpServers": {
 *       "mcop-memory": {
 *         "command": "node",
 *         "args": ["./examples/mcop_memory_mcp_server/server.js"]
 *       }
 *     }
 *   }
 *
 * The server speaks JSON-RPC 2.0 over stdio (matching the MCP framing
 * used by `examples/universal_adapter_mcp_server/`) and exposes:
 *
 *   tools/list        →  4 tools (record / recall / merkleRoot / clear)
 *   tools/call        →  invoke a named tool
 *   resources/list    →  enumerate the deterministic benchmark snapshot
 *                        + the live Merkle root
 *   resources/read    →  return the resource body (JSON for the snapshot,
 *                        text for the merkle-root pseudo-resource)
 *
 * No external MCP SDK dependency is taken on — the JSON-RPC framing is
 * tiny and self-contained, mirroring `examples/universal_adapter_mcp_server`.
 */

import * as readline from 'node:readline';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  ensureTriad,
  recallFromTriad,
  recordIntoTriad,
  type MCOPTriad,
} from '../../src/integrations/triadHarness';

interface JsonRpcRequest {
  readonly jsonrpc?: '2.0';
  readonly id?: string | number | null;
  readonly method?: string;
  readonly params?: unknown;
}

interface ToolCallParams {
  readonly name: string;
  readonly arguments?: unknown;
}

const REPO_ROOT = resolve(__dirname, '../..');
const BENCHMARK_SNAPSHOT_PATH = join(REPO_ROOT, 'docs/benchmarks/results.json');

const tools = [
  {
    name: 'mcop.memory.record',
    description: 'Record a (text, metadata) pair through the MCOP triad and return Merkle-rooted provenance.',
    inputSchema: {
      type: 'object',
      required: ['text'],
      additionalProperties: false,
      properties: {
        text: { type: 'string', minLength: 1 },
        metadata: { type: 'object' },
        note: { type: 'string' },
      },
    },
  },
  {
    name: 'mcop.memory.recall',
    description: 'Run a resonance query and return the best-matching trace (if any).',
    inputSchema: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'mcop.memory.merkleRoot',
    description: 'Return the latest Stigmergy Merkle root for the current session.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'mcop.memory.clear',
    description: 'Reset the in-memory triad — drops all traces and etches for the current session.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
] as const;

const resources = [
  {
    uri: 'mcop://benchmark/snapshot',
    name: 'Reproducible benchmark snapshot',
    description: 'docs/benchmarks/results.json — byte-identity-reproducible benchmark output.',
    mimeType: 'application/json',
  },
  {
    uri: 'mcop://memory/merkle-root',
    name: 'Live Merkle root',
    description: 'Latest Stigmergy Merkle root for the current session (text/plain).',
    mimeType: 'text/plain',
  },
] as const;

interface MemoryServerState {
  triad: MCOPTriad;
}

export async function handleRequest(
  state: MemoryServerState,
  request: JsonRpcRequest,
): Promise<Record<string, unknown>> {
  try {
    if (request.method === 'initialize') {
      return ok(request.id, {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'mcop-memory', version: '0.1.0' },
        capabilities: { tools: {}, resources: {} },
      });
    }
    if (request.method === 'tools/list') {
      return ok(request.id, { tools });
    }
    if (request.method === 'tools/call') {
      const params = parseToolCallParams(request.params);
      const result = await callTool(state, params);
      return ok(request.id, result);
    }
    if (request.method === 'resources/list') {
      return ok(request.id, { resources });
    }
    if (request.method === 'resources/read') {
      const result = await readResource(state, request.params);
      return ok(request.id, result);
    }
    return fail(request.id, -32601, `Unknown method: ${request.method ?? '∅'}`);
  } catch (err) {
    return fail(request.id, -32000, errorMessage(err));
  }
}

async function callTool(
  state: MemoryServerState,
  params: ToolCallParams,
): Promise<Record<string, unknown>> {
  if (params.name === 'mcop.memory.record') {
    const args = parseRecordArgs(params.arguments);
    const recorded = recordIntoTriad(state.triad, args.text, args.metadata, args.note);
    return {
      provenance: recorded.provenance,
      trace: { id: recorded.trace.id, hash: recorded.trace.hash, weight: recorded.trace.weight },
      etch: { hash: recorded.etch.hash, deltaWeight: recorded.etch.deltaWeight, note: recorded.etch.note },
    };
  }
  if (params.name === 'mcop.memory.recall') {
    const args = parseRecallArgs(params.arguments);
    const { resonance } = recallFromTriad(state.triad, args.query);
    return {
      score: resonance.score,
      thresholdUsed: resonance.thresholdUsed,
      trace: resonance.trace
        ? {
            id: resonance.trace.id,
            hash: resonance.trace.hash,
            metadata: resonance.trace.metadata ?? null,
            timestamp: resonance.trace.timestamp,
          }
        : null,
    };
  }
  if (params.name === 'mcop.memory.merkleRoot') {
    return { merkleRoot: state.triad.stigmergy.getMerkleRoot() ?? null };
  }
  if (params.name === 'mcop.memory.clear') {
    state.triad = ensureTriad();
    return { cleared: true };
  }
  throw new Error(`Unknown tool: ${params.name}`);
}

async function readResource(
  state: MemoryServerState,
  rawParams: unknown,
): Promise<Record<string, unknown>> {
  const params = parseResourceReadParams(rawParams);
  if (params.uri === 'mcop://benchmark/snapshot') {
    const text = await fs.readFile(BENCHMARK_SNAPSHOT_PATH, 'utf8');
    return {
      contents: [{ uri: params.uri, mimeType: 'application/json', text }],
    };
  }
  if (params.uri === 'mcop://memory/merkle-root') {
    const root = state.triad.stigmergy.getMerkleRoot() ?? '';
    return {
      contents: [{ uri: params.uri, mimeType: 'text/plain', text: root }],
    };
  }
  throw new Error(`Unknown resource: ${params.uri}`);
}

function parseToolCallParams(value: unknown): ToolCallParams {
  if (!isRecord(value)) throw new Error('tools/call params must be an object');
  if (typeof value.name !== 'string') {
    throw new Error('tools/call params.name must be a string');
  }
  return { name: value.name, arguments: value.arguments };
}

function parseRecordArgs(value: unknown): {
  text: string;
  metadata?: Record<string, unknown>;
  note?: string;
} {
  if (!isRecord(value)) throw new Error('tool arguments must be an object');
  if (typeof value.text !== 'string' || value.text.length === 0) {
    throw new Error('arguments.text must be a non-empty string');
  }
  return {
    text: value.text,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    note: typeof value.note === 'string' ? value.note : undefined,
  };
}

function parseRecallArgs(value: unknown): { query: string } {
  if (!isRecord(value)) throw new Error('tool arguments must be an object');
  if (typeof value.query !== 'string' || value.query.length === 0) {
    throw new Error('arguments.query must be a non-empty string');
  }
  return { query: value.query };
}

function parseResourceReadParams(value: unknown): { uri: string } {
  if (!isRecord(value)) throw new Error('resources/read params must be an object');
  if (typeof value.uri !== 'string' || value.uri.length === 0) {
    throw new Error('resources/read params.uri must be a non-empty string');
  }
  return { uri: value.uri };
}

function ok(
  id: JsonRpcRequest['id'],
  result: Record<string, unknown>,
): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function fail(
  id: JsonRpcRequest['id'],
  code: number,
  message: string,
): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/* istanbul ignore next -- entrypoint executed only outside tests */
async function main(): Promise<void> {
  const state: MemoryServerState = { triad: ensureTriad() };
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    if (line.trim() === '') continue;
    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      const response = await handleRequest(state, request);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (err) {
      process.stdout.write(`${JSON.stringify(fail(null, -32700, errorMessage(err)))}\n`);
    }
  }
}

/* istanbul ignore next -- entrypoint guard */
if (require.main === module) {
  void main();
}

export { tools, resources };
export type { MemoryServerState };
