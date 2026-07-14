# MCOP Python 4.0 deployment summary

## Distribution contract

The PyPI package is no longer documented as a separate-lineage product. It
ships the same flagship deterministic primitives as `@kullailabs/mcop-core`:

| Surface | Python API | Compatibility contract |
| --- | --- | --- |
| NOVA-NEO | `mcop.NovaNeoEncoder` | SHA-256 byte mapping and cycle-ordered normalization |
| Stigmergy v5 | `mcop.StigmergyV5` | adaptive threshold, bounded traces, RFC 8785 Merkle payload |
| Holographic Etch | `mcop.HolographicEtch` | confidence floor, bounded audit/etch buffers, RFC 8785 etch payload |
| Wire/hash version | `mcop.TRIAD_PROTOCOL_VERSION` | `2.4.0`, also recorded in `[tool.mcop]` |

`MCOPEngine`, the four reasoning modes, mycelial chaining, evidence grounding,
and domain adapters remain supported under their existing imports.

## Versioning

- Distribution/runtime version: `4.0.0`.
- Triad protocol version: `2.4.0`.
- Supported Python: 3.10 and newer as declared in `pyproject.toml`; CI
  exercises 3.10, 3.12, and 3.14.

The distribution version and protocol version are deliberately independent.
A packaging or reasoning-engine release does not imply a hash-protocol change.

## Determinism guarantees

The cross-language tests lock all of the following:

- normalized NOVA-NEO output above one 32-byte SHA cycle;
- exact trace hash with a fixed trace ID and metadata;
- exact Holographic Etch hash with a fixed note;
- omission of absent optional metadata/note fields;
- Merkle parent chaining and bounded retention;
- resonance, adaptive-memory, audit, flourishing, and propagation outputs;
- top-level imports, distribution version, and protocol metadata;
- compatibility defaults for the legacy ecosystem harness.

Run the focused release gate from the repository root:

```bash
PYTHONPATH=mcop_package python -m pytest \
  mcop_package/tests/test_flagship_triad.py \
  mcop_package/tests/test_triad_parity.py \
  mcop_package/tests/test_integrations.py \
  mcop_package/tests/test_version_metadata.py -q
```

On PowerShell:

```powershell
$env:PYTHONPATH = "mcop_package"
python -m pytest mcop_package/tests -q
```

The standalone parity payload is available with:

```bash
python -m mcop.triad "crystalline entropy" --dimensions 64 --normalize
```

## Runtime dependencies

- `rfc8785` provides canonical JSON encoding for byte-identical Python/TS
  hashes.
- `httpx` supports evidence retrieval.
- `openai` remains an optional `llm` extra.
- pytest tooling remains an optional `dev` extra.

## Publishing checklist

1. Build from `mcop_package/pyproject.toml`.
2. Run the focused gate and full `mcop_package/tests` suite.
3. Inspect wheel metadata and confirm version `4.0.0`.
4. Publish through the repository's PyPI trusted-publishing workflow.
5. Install the published wheel in a clean environment and rerun the parity
   CLI fixture.

Repository configuration makes a release reproducible; a published artifact
exists only after the trusted-publishing workflow completes successfully.
