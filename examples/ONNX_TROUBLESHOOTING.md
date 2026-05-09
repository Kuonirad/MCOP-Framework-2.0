# ONNX `IEmbeddingBackend` — Troubleshooting Guide

Companion to [`examples/onnx_embedding_backend.ts`](./onnx_embedding_backend.ts).
The example header shows the happy path; this file documents the four most
common failure modes new contributors hit on first run, and how to recover
from each in under a minute.

> **Why this file exists.** ONNX is an *optional* peer dependency. The default
> `HashingTrickBackend` is deterministic and zero-dependency, so the example
> intentionally exits cleanly when the ONNX prerequisites are missing. The
> errors below appear once you opt in — they are not bugs, just first-run
> environment friction.

---

## 1. `Cannot find module 'onnxruntime-node'`

You see something like:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'onnxruntime-node'
```

**Cause.** `onnxruntime-node` is an optional peer dependency and is not
installed by default (we keep `@kullailabs/mcop-core` zero-dep so consumers
who want determinism do not pay an ~80 MB native-binary tax).

**Fix.**

```bash
pnpm add onnxruntime-node
```

**Verify.**

```bash
node -e "console.log(require('onnxruntime-node').InferenceSession ? 'ok' : 'broken')"
# → ok
```

If the install itself fails on Apple Silicon, see §3 below.

---

## 2. `Failed to load model: file not found`

You see something like:

```
Error: Failed to load model from .models/all-MiniLM-L6-v2.onnx (ENOENT)
```

**Cause.** The example reads the model path from `ONNX_MODEL_PATH` (and
`ONNX_TOKENIZER_PATH`) but the `.models/` directory has not been populated
yet.

**Fix — copy/paste the exact `curl` snippet from the example header.**

```bash
mkdir -p .models
curl -L -o .models/all-MiniLM-L6-v2.onnx \
  https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx
curl -L -o .models/all-MiniLM-L6-v2.tokenizer.json \
  https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json
```

Then re-run with the env vars set:

```bash
ONNX_MODEL_PATH=.models/all-MiniLM-L6-v2.onnx \
ONNX_TOKENIZER_PATH=.models/all-MiniLM-L6-v2.tokenizer.json \
pnpm exec tsx examples/onnx_embedding_backend.ts "your prompt here"
```

**Verify.**

```bash
ls -lh .models/
# → all-MiniLM-L6-v2.onnx           ~80 MB
# → all-MiniLM-L6-v2.tokenizer.json ~700 KB
```

If your `.gitignore` does not already cover `.models/`, add it — those
binaries should never be committed.

---

## 3. Apple-Silicon native binary not available

You see something like:

```
Error: The module 'onnxruntime_binding.node' was compiled against a different
Node.js version using NODE_MODULE_VERSION ...
```

or

```
dyld: missing symbol called
```

**Cause.** `onnxruntime-node`'s prebuilt binaries are not always shipped for
arm64 macOS, and the resolver may pick an x64 binary that fails on M-series
silicon.

**Fix — pick one of these workarounds.**

- **Run under Rosetta** (slower but always works):

  ```bash
  arch -x86_64 zsh        # or bash
  pnpm install            # reinstall with x64 toolchain visible
  pnpm exec tsx examples/onnx_embedding_backend.ts "..."
  ```

- **Force x64 npm package install:**

  ```bash
  pnpm install --config.arch=x64 onnxruntime-node
  ```

- **Use the deterministic fallback.** If neural embeddings are not strictly
  required, drop the env vars and the example automatically falls back to
  `HashingTrickBackend`, which has no native binaries and is byte-identical
  across architectures.

**Verify.** After the fix, the install should print:

```
Resolved: onnxruntime-node@<version>
Postinstall: downloaded prebuilt binary for darwin-x64
```

---

## 4. Tokenizer not bundled

You see something like:

```
Error: ONNX_TOKENIZER_PATH set but file is empty / cannot parse tokenizer.json
```

or the example logs `loaded model but could not tokenize input`.

**Cause.** Sentence-transformers ONNX exports ship the model weights and the
tokenizer as **separate** files. The `.onnx` file alone is not enough — you
also need a `tokenizer.json` from the same model repository.

**Fix.**

```bash
curl -L -o .models/all-MiniLM-L6-v2.tokenizer.json \
  https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json
export ONNX_TOKENIZER_PATH=.models/all-MiniLM-L6-v2.tokenizer.json
```

For richer tokenization (subword fallbacks, alternate models) consider the
[`@xenova/transformers`](https://github.com/xenova/transformers.js) JS port,
which loads the same `tokenizer.json` and adds graceful unknown-token
handling. Swap the tokenizer call inside the example without changing the
backend interface.

**Verify.**

```bash
node -e "JSON.parse(require('fs').readFileSync(process.env.ONNX_TOKENIZER_PATH)).model.type"
# → 'BPE' or 'WordPiece' (anything but a parse error means it's valid JSON)
```

---

## Still stuck?

1. Re-read the example header — it has the canonical setup commands.
2. Check the [ONNX Runtime Node.js docs](https://onnxruntime.ai/docs/get-started/with-javascript/node.html).
3. Open a [Good First Issue](https://github.com/Kuonirad/MCOP-Framework-2.0/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — first-run friction reports are very welcome.

The deterministic `HashingTrickBackend` always works as a fallback; ONNX is an
opt-in upgrade for *semantic* resonance, not a hard requirement.
