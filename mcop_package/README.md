# MCOP for Python

`mcop` 4.0 is the Python distribution of the MCOP Deterministic Triad:

- `NovaNeoEncoder` — deterministic SHA-256 context tensors.
- `StigmergyV5` — bounded, adaptive resonance memory with an RFC 8785
  Merkle chain.
- `HolographicEtch` — bounded confidence/audit memory with eudaimonic
  flourishing signals.

The hash protocol is `2.4.0`, matching `@kullailabs/mcop-core`. The package
also retains the established `MCOPEngine`, mycelial chaining, grounding,
reasoning modes, and domain adapters. Those APIs are additive; existing Python
reasoning-engine imports remain valid.

## Install

```bash
pip install mcop
```

Optional extras:

```bash
pip install mcop[llm]
pip install mcop[dev]
```

Python requires `rfc8785` for cross-runtime canonical hashes and `httpx` for
the evidence-retrieval surface. These are installed automatically.

## Deterministic Triad

```python
from mcop import HolographicEtch, NovaNeoEncoder, StigmergyV5

encoder = NovaNeoEncoder(dimensions=64, normalize=True)
context = encoder.encode("a replayable memory")

memory = StigmergyV5(resonance_threshold=0.55, max_traces=2048)
trace = memory.record_trace(
    context,
    list(context),
    {"source": "python"},
)
resonance = memory.get_resonance(context)

etcher = HolographicEtch(confidence_floor=0.0)
etch = etcher.apply_etch(context, list(context), note="accepted")

print(trace.hash, memory.get_merkle_root())
print(resonance.score, etch.hash, etch.flourishing_score)
```

Python methods use snake case. Camel-case aliases such as `recordTrace`,
`getMerkleRoot`, and `applyEtch` are retained for direct TypeScript-to-Python
ports.

### Cross-language parity fixture

```bash
python -m mcop.triad "crystalline entropy" --dimensions 64 --normalize
```

The JSON includes the encoder fingerprint, protocol version, a deterministic
Stigmergy trace/resonance result, a Holographic Etch result, and hashes proving
that absent optional `metadata`/`note` fields are omitted rather than encoded
as `null`. `tests/test_flagship_triad.py` locks those values to the same
fixtures used by the TypeScript parity guardian.

## Reasoning Engine (legacy, still supported)

```python
from mcop import MCOPEngine, Problem, solve

solution = solve("What causes climate change?")
print(solution.content)
print(f"Confidence: {solution.confidence * 100:.1f}%")

engine = MCOPEngine()
explicit = engine.solve(Problem(description="Your problem here"))
```

General, medical, scientific, and governance adapters remain available. The
medical and scientific adapters are decision-support examples and do not
replace professional judgment.

## Command-line reasoning interface

```bash
mcop solve "What are the causes of inflation?"
mcop solve --domain medical "Patient with fever and cough"
mcop interactive
mcop info
```

## Release identity

- PyPI distribution: `mcop` 4.0.x.
- Python runtime version: `mcop.__version__`.
- Cross-language hash contract: `mcop.TRIAD_PROTOCOL_VERSION == "2.4.0"` and
  `[tool.mcop].protocol-version` in `pyproject.toml`.
- npm core distribution: `@kullailabs/mcop-core` (framework release line
  2.4.x).

Package versions may advance independently; protocol parity is the explicit
compatibility contract.

## Development

```bash
python -m pytest tests -q
```

See the repository's
[usage guide](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/mcop_package/USAGE_GUIDE.md),
[API reference](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/mcop_package/API_REFERENCE.md),
and [deployment summary](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/mcop_package/DEPLOYMENT_SUMMARY.md)
for the extended Python surface and release checks.

## License

Apache License 2.0 (Apache-2.0) — see the repository
[LICENSE](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/mcop_package/LICENSE)
and [NOTICE](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/mcop_package/NOTICE.md).
Versions originally released under MIT remain available under the
[legacy license](https://github.com/Kuonirad/MCOP-Framework-2.0/blob/main/mcop_package/LICENSE-MIT-LEGACY).
