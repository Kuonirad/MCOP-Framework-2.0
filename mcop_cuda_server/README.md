# mcop_cuda_server

HTTP microservice exposing the six MCOP CUDA kernels (`encode`,
`graphAggregate`, `holographicUpdate`, `cosineRecall`, `evolveScore`,
`homeostasis`) over a stateless POST surface, with **verified-device
provenance** and **ghost-GPU detection** baked into every response.

Pairs with `src/hardware/Accelerator.ts::CUDAProvider` in the
TypeScript core. The two providers (in-process op-sharded layer and
this HTTP microservice) ship side-by-side under independent flags; see
`docs/CUDA_PRODUCTION.md` for the full operator runbook.

## Quick start (stdlib, zero dependencies)

```bash
python3 -m mcop_cuda_server --port 8765 --device cuda:0
```

Then from the TypeScript side:

```ts
import { resolveHardwareLayer } from '@kuonirad/mcop-framework';

const { accelerator } = await resolveHardwareLayer({
  config: { useCUDA: true, provider: 'microservice', enableCUDA: 'auto', kernelDir: './models' },
  microservice: { endpoint: 'http://localhost:8765' },
});

const result = await accelerator.accelerate('nova-neo-encode', { tensor: [1, 2, 3] });
console.log(result._provenance.verifiedDevice); // CPUExecutionProvider on a CPU host
```

## Endpoints

| Method | Path             | Description                                    |
| ------ | ---------------- | ---------------------------------------------- |
| GET    | `/health`        | Liveness probe                                  |
| GET    | `/capabilities`  | Reports detected backends (`onnxruntime`, `cupy`, `torch`) + kernel listing |
| POST   | `/cuda/<op>`     | Execute a single kernel; returns `AcceleratedResult<T>` |
| POST   | `/cuda`          | Batch dispatch: `{ "calls": [{ op, input }, ...] }`     |

All successful responses include a Merkle-rooted `_provenance` envelope
byte-identical to what the TypeScript `attachAcceleratorProvenance`
emits.

## FastAPI / Uvicorn (recommended for production)

```bash
pip install fastapi 'uvicorn[standard]' rfc8785
uvicorn mcop_cuda_server.fastapi_app:app --host 0.0.0.0 --port 8765
```

## Ghost-GPU gate

When `--require-cuda` (or `MCOP_CUDA_REQUIRE=1`) is set, any request
whose verified execution provider is not `CUDAExecutionProvider`
returns HTTP 502 with an `error: "ghost_gpu"` body — the cluster log
must never contain ghost-GPU lineage.

## Docker

```bash
docker build -f mcop_cuda_server/Dockerfile -t mcop-cuda-server:dev .
docker run --rm -p 8765:8765 --gpus all mcop-cuda-server:dev
```

See `docker-compose.yml` for a one-line compose entry that runs the
server alongside the Next.js app.
