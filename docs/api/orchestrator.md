# Orchestrator API

`MCOPOrchestrator` is dependency-injected. It should coordinate already-built
surfaces instead of resolving every kernel variant from string keys internally.

## Injected-Instance Construction

Use this shape when integrating custom telemetry, encoders, or test doubles:

```ts
import { MCOPOrchestrator } from '@/orchestrator/MCOPOrchestrator';

const orchestrator = new MCOPOrchestrator({
  hardeningBootstrapper: {
    commitPipelineStageExecution: async (input) => {
      return bootstrapper.commitPipelineStageExecution(input);
    },
  },
});
```

If no bootstrapper is injected, `commitPipelineStageExecution()` resolves to
`undefined` and no telemetry dependencies are created.

## String-Key Factory Shape

Config or README examples may use keys such as:

```ts
{
  encoder: 'nova-neo-v2',
  memory: 'stigmergy-v5',
  ledger: 'holographic-etch'
}
```

Treat those as factory-layer inputs. Resolve keys into concrete instances before
constructing the orchestrator. Keeping resolution outside the orchestrator
prevents it from becoming the global registry for every encoder, memory,
hardware, and ledger variant.

## Integration Rule

Prefer injected instances for production integrations. Use string keys only at
configuration boundaries where they are resolved before orchestration begins.
