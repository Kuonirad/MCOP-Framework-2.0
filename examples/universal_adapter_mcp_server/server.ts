/**
 * Universal Adapter Protocol MCP reference server.
 *
 * Implements a tiny JSON-RPC-over-stdio surface for the three useful adapter
 * operations: list capabilities, generate, and prepare. The transport mirrors
 * MCP's tool-list/tool-call shape while avoiding a hard dependency on a
 * specific MCP SDK in this framework repo.
 */

import * as readline from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';

import {
  type ContextTensor,
} from '../../src/core';
import {
  type AdapterDomain,
  type AdapterRequest,
  type BaseAdapterDeps,
  GenericProductionAdapter,
} from '../../src/adapters';

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

interface GenerateArgs {
  readonly prompt: string;
  readonly domain?: AdapterDomain;
  readonly metadata?: Record<string, unknown>;
}

interface ReferenceAsset {
  readonly assetUrl: string;
  readonly promptLength: number;
}

const tools = [
  {
    name: 'mcop.adapter.capabilities',
    description: 'Return Universal Adapter Protocol capabilities.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'mcop.adapter.generate',
    description: 'Run the full adapter pipeline and fixture dispatch.',
    inputSchema: generateSchema(),
  },
  {
    name: 'mcop.adapter.prepare',
    description: 'Run encode → resonance → dialectical synthesis → etch only.',
    inputSchema: generateSchema(),
  },
] as const;

async function main(): Promise<void> {
  const adapter = createReferenceAdapter();
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    if (line.trim() === '') continue;
    const request = parseRequest(line);
    const response = await handleRequest(adapter, request);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

async function handleRequest(
  adapter: GenericProductionAdapter<ReferenceAsset>,
  request: JsonRpcRequest,
): Promise<Record<string, unknown>> {
  try {
    if (request.method === 'tools/list') {
      return ok(request.id, { tools });
    }

    if (request.method === 'tools/call') {
      const params = parseToolCallParams(request.params);
      const result = await callTool(adapter, params);
      return ok(request.id, result);
    }

    return fail(request.id, -32601, `Unknown method: ${request.method ?? '∅'}`);
  } catch (err) {
    return fail(request.id, -32000, errorMessage(err));
  }
}

async function callTool(
  adapter: GenericProductionAdapter<ReferenceAsset>,
  params: ToolCallParams,
): Promise<Record<string, unknown>> {
  if (params.name === 'mcop.adapter.capabilities') {
    return { capabilities: await adapter.getCapabilities() };
  }

  if (params.name === 'mcop.adapter.generate') {
    const args = parseGenerateArgs(params.arguments);
    const request = toAdapterRequest(args);
    return { response: await adapter.generate(request) };
  }

  if (params.name === 'mcop.adapter.prepare') {
    const args = parseGenerateArgs(params.arguments);
    const request = toAdapterRequest(args);
    const prepared = adapter.prepare(request);
    return {
      prepared: {
        refinedPrompt: prepared.refinedPrompt,
        resonanceScore: prepared.resonance.score,
        traceHash: prepared.trace.hash,
        etchHash: prepared.etchHash,
        provenance: prepared.provenance,
      },
    };
  }

  throw new Error(`Unknown tool: ${params.name}`);
}

function createReferenceAdapter(): GenericProductionAdapter<ReferenceAsset> {
  const triad = {
    encoder: new DemoEncoder(64),
    stigmergy: new DemoStigmergy(),
    etch: new DemoEtch(),
  } as unknown as BaseAdapterDeps;

  return new GenericProductionAdapter<ReferenceAsset>({
    ...triad,
    platform: 'mcp-reference-adapter',
    capabilities: {
      version: '0.1.0',
      models: ['fixture-dispatch-v1'],
      features: ['mcp-tools', 'dry-run-prepare', 'merkle-provenance'],
    },
    async dispatch({ refinedPrompt }) {
      return {
        assetUrl: `mcp-reference://${stableSlug(refinedPrompt)}`,
        promptLength: refinedPrompt.length,
      };
    },
  });
}

function parseRequest(line: string): JsonRpcRequest {
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed)) throw new Error('JSON-RPC request must be an object');
  return parsed;
}

function parseToolCallParams(value: unknown): ToolCallParams {
  if (!isRecord(value)) throw new Error('tools/call params must be an object');
  if (typeof value.name !== 'string') {
    throw new Error('tools/call params.name must be a string');
  }
  return { name: value.name, arguments: value.arguments };
}

function parseGenerateArgs(value: unknown): GenerateArgs {
  if (!isRecord(value)) throw new Error('tool arguments must be an object');
  if (typeof value.prompt !== 'string' || value.prompt.length === 0) {
    throw new Error('arguments.prompt must be a non-empty string');
  }
  return {
    prompt: value.prompt,
    domain: parseDomain(value.domain),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function parseDomain(value: unknown): AdapterDomain | undefined {
  if (value === undefined) return undefined;
  if (
    value === 'graphic' ||
    value === 'cinematic' ||
    value === 'narrative' ||
    value === 'audio' ||
    value === 'generic'
  ) {
    return value;
  }
  throw new Error('arguments.domain must be graphic, cinematic, narrative, audio, or generic');
}

function toAdapterRequest(args: GenerateArgs): AdapterRequest {
  return {
    prompt: args.prompt,
    domain: args.domain ?? 'generic',
    metadata: args.metadata,
  };
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

function generateSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['prompt'],
    additionalProperties: false,
    properties: {
      prompt: { type: 'string', minLength: 1 },
      domain: {
        type: 'string',
        enum: ['graphic', 'cinematic', 'narrative', 'audio', 'generic'],
      },
      metadata: { type: 'object' },
    },
  };
}

function stableSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class DemoEncoder {
  constructor(private readonly dimensions: number) {}

  encode(text: string): ContextTensor {
    const values = new Array<number>(this.dimensions);
    for (let i = 0; i < this.dimensions; i++) {
      const digestBuffer = createHash('sha256')
        .update(`${i}:${text}`)
        .digest();
      values[i] = (digestBuffer[0] / 255) * 2 - 1;
    }
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    return norm > 0 ? values.map((value) => value / norm) : values;
  }
}

class DemoStigmergy {
  private readonly traces: Array<{
    id: string;
    hash: string;
    context: ContextTensor;
    synthesisVector: ContextTensor;
    weight: number;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }> = [];

  getResonance(context: ContextTensor) {
    const best = this.traces
      .map((trace) => ({ trace, score: cosine(context, trace.context) }))
      .sort((a, b) => b.score - a.score)[0];
    return best && best.score >= 0.3
      ? { score: best.score, trace: best.trace }
      : { score: 0 };
  }

  recordTrace(
    context: ContextTensor,
    synthesisVector: ContextTensor,
    metadata?: Record<string, unknown>,
  ) {
    const parentHash = this.getMerkleRoot();
    const id = randomUUID();
    const trace = {
      id,
      hash: digest({ id, context, synthesisVector, metadata, parentHash }),
      parentHash,
      context,
      synthesisVector,
      weight: cosine(context, synthesisVector),
      timestamp: new Date().toISOString(),
      metadata,
    };
    this.traces.push(trace);
    return trace;
  }

  getMerkleRoot(): string | undefined {
    return this.traces.at(-1)?.hash;
  }
}

class DemoEtch {
  applyEtch(context: ContextTensor, synthesisVector: ContextTensor, note?: string) {
    const deltaWeight = cosine(context, synthesisVector);
    return {
      hash: digest({ context, synthesisVector, note, deltaWeight }),
      deltaWeight,
      note,
      timestamp: new Date().toISOString(),
    };
  }
}

function cosine(a: ContextTensor, b: ContextTensor): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
  return denom > 0 ? dot / denom : 0;
}

function digest(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${errorMessage(err)}\n`);
    process.exitCode = 1;
  });
}

export { createReferenceAdapter, handleRequest };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
