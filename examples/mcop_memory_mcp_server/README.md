# MCOP Memory MCP Server

Stdio MCP server that exposes the MCOP triad (NOVA-NEO + Stigmergy v5 +
Holographic Etch) as a Merkle-rooted memory layer for any MCP-aware
client — Claude Desktop, Cursor, Continue, and the Model Context
Protocol reference clients.

It is the ecosystem-integration sibling of
[`examples/universal_adapter_mcp_server`](../universal_adapter_mcp_server/),
which exposes the Universal Adapter Protocol surface. This server
specifically scopes to **memory** so a host application can let MCOP
record / recall conversations and assets without taking a runtime
dependency on the framework.

## Tools

| Name | Purpose |
|---|---|
| `mcop.memory.record` | Record `(text, metadata)` through the triad. Returns Merkle-rooted provenance (etch hash + Merkle root + UUID-v4 trace id + ISO8601 timestamp). |
| `mcop.memory.recall` | Resonance query against recorded traces. Returns the best-matching trace (if any) with its score. |
| `mcop.memory.merkleRoot` | Latest Stigmergy Merkle root for the current session. |
| `mcop.memory.clear` | Reset the in-memory triad — drops all traces and etches. |

## Resources

| URI | Purpose |
|---|---|
| `mcop://benchmark/snapshot` | The deterministic benchmark snapshot (`docs/benchmarks/results.json`). |
| `mcop://memory/merkle-root` | Latest Stigmergy Merkle root as text. |

## Wire it into Claude Desktop

```json
{
  "mcpServers": {
    "mcop-memory": {
      "command": "node",
      "args": ["./examples/mcop_memory_mcp_server/server.js"]
    }
  }
}
```

## Wire it into Cursor / Continue

Both clients expect the same JSON-RPC framing. Drop the server's launch
command into the client's MCP server list — no client-side adapter
required.

## Local smoke test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | tsx examples/mcop_memory_mcp_server/server.ts
```

Tracing every record:

```bash
{
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcop.memory.record","arguments":{"text":"the holographic etch is rank-1 and replayable"}}}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mcop.memory.recall","arguments":{"query":"the holographic etch is rank-1 and replayable"}}}'
} | tsx examples/mcop_memory_mcp_server/server.ts
```

The first response carries the `etch.hash` and the Merkle root; the
second returns a `score > 0` and the matching trace's `id` and `hash`.

## Provenance invariants

- Every record emits a SHA-256 etch hash (RFC 8785 canonical JSON).
- Every record updates the Stigmergy Merkle chain (linked via
  `parentHash`).
- The triad is created lazily and is per-session — restarting the server
  starts a new Merkle chain, but the snapshot resource is constant.
- The reproducibility badge (`docs/badges/reproducible-benchmark.svg`)
  attests the snapshot resource's byte-identity.
