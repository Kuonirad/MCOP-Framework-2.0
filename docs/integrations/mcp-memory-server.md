# MCOP Memory MCP Server — Integration Guide

> **Status:** Shipped
> **Source:** `examples/mcop_memory_mcp_server/`
> **Phase:** v2.4 — Phase 4 (Ecosystem Integration Deepening)

## What this is

A stdio MCP (Model Context Protocol) server that exposes the MCOP
triad as a Merkle-rooted memory layer for any MCP-aware client —
**Claude Desktop**, **Cursor**, **Continue**, and the official MCP
reference clients.

Sibling to [`examples/universal_adapter_mcp_server/`](../../examples/universal_adapter_mcp_server/),
which exposes the Universal Adapter Protocol surface; this server scopes
to memory specifically so a host application can let MCOP record /
recall conversations and assets without taking a runtime dependency on
the framework.

## Tools (`tools/list`)

| Name | Purpose |
|---|---|
| `mcop.memory.record` | Record `(text, metadata)` through the triad. Returns Merkle-rooted provenance. |
| `mcop.memory.recall` | Resonance query against recorded traces. Returns the best-matching trace (if any) with its score. |
| `mcop.memory.merkleRoot` | Latest Stigmergy Merkle root for the current session. |
| `mcop.memory.clear` | Reset the in-memory triad — drops all traces and etches. |

## Resources (`resources/list`)

| URI | Purpose |
|---|---|
| `mcop://benchmark/snapshot` | The deterministic benchmark snapshot (`docs/benchmarks/results.json`). |
| `mcop://memory/merkle-root` | Latest Stigmergy Merkle root (text/plain). |

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

## Wire it into Cursor

```json
{
  "mcpServers": {
    "mcop-memory": {
      "command": "tsx",
      "args": ["./examples/mcop_memory_mcp_server/server.ts"]
    }
  }
}
```

## Smoke test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | tsx examples/mcop_memory_mcp_server/server.ts
```

## Provenance invariants

- Every record emits a SHA-256 etch hash via RFC 8785 canonical JSON.
- Every record updates the Stigmergy Merkle chain (parent-linked).
- The triad is created lazily and is per-session — restarting the server
  starts a new Merkle chain, but the snapshot resource is constant.
- The reproducibility badge attests the snapshot resource's
  byte-identity ([source](../badges/reproducible-benchmark.svg)).

## Test coverage

| File | Cases |
|---|---|
| `src/__tests__/mcopMemoryMcpServer.test.ts` | 16 |
