# Universal Adapter Protocol MCP reference server

This directory is a minimal reference implementation for exposing the Universal
MCOP Adapter Protocol as MCP tools. It is intentionally dependency-light and
uses JSON-RPC over stdio so adopters can port it to the official MCP SDK for
their runtime without changing the MCOP adapter contract.

## Tools

| Tool | Purpose |
| --- | --- |
| `mcop.adapter.capabilities` | Returns the wrapped adapter capability surface. |
| `mcop.adapter.generate` | Runs the deterministic adapter pipeline and returns `AdapterResponse`. |
| `mcop.adapter.prepare` | Runs encode → resonance → dialectical synthesis → etch without vendor dispatch. |

## Smoke test

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' \
  | pnpm dlx tsx --tsconfig tsconfig.json examples/universal_adapter_mcp_server/server.ts
```

Generate through the fixture adapter:

```sh
printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mcop.adapter.generate","arguments":{"prompt":"aurora-lit cathedral trailer frame","domain":"graphic","metadata":{"demo":true}}}}\n' \
  | pnpm dlx tsx --tsconfig tsconfig.json examples/universal_adapter_mcp_server/server.ts
```

Replace `createReferenceAdapter()` in `server.ts` with a real
`MagnificMCOPAdapter`, `UtopaiMCOPAdapter`, or custom `GenericProductionAdapter`
to expose production tools to an MCP client.
