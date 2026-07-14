"""Python implementation of the MCOP Deterministic Triad.

The hash-backed NOVA-NEO encoder, Stigmergy v5 memory, and Holographic
Etch ledger in this module mirror the public algorithms in
``@kullailabs/mcop-core``.  Hashes use RFC 8785 canonical JSON so the same
payload produces the same trace or etch digest in Python and TypeScript.

The framework release and the wire protocol intentionally have separate
versions.  ``TRIAD_PROTOCOL_VERSION`` identifies the TypeScript/Python hash
contract and changes only when that contract changes.
"""

from __future__ import annotations

import hashlib
import inspect
import math
import struct
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import (
    Any,
    Callable,
    Dict,
    Generic,
    Iterable,
    Iterator,
    List,
    Mapping,
    Optional,
    Sequence,
    Tuple,
    TypeVar,
    Union,
)

from .canonical_encoding import canonical_digest


TRIAD_PROTOCOL_VERSION = "2.4.0"
SHA256_TENSOR_DIMENSIONS = 32
DEFAULT_FALSE_RESONANCE_ALPHA = 0.01

__all__ = [
    "TRIAD_PROTOCOL_VERSION",
    "SHA256_TENSOR_DIMENSIONS",
    "DEFAULT_FALSE_RESONANCE_ALPHA",
    "magnitude",
    "dot",
    "cosine",
    "variance",
    "nova_neo_encode",
    "estimate_entropy",
    "effective_tensor_dimensions",
    "analytic_threshold",
    "false_resonance_rate",
    "normal_cdf",
    "inverse_normal_cdf",
    "TriadParityResult",
    "triad_fingerprint",
    "HashingTrickBackend",
    "NovaNeoEncoder",
    "UniversalEncoder",
    "NovaNeoWeb",
    "PheromoneTrace",
    "ResonanceResult",
    "ResonantRecentTrace",
    "BufferStats",
    "StigmergyV5",
    "EtchRecord",
    "AdaptiveConfidenceBreakdown",
    "EudaimonicEtchSummary",
    "MemoryStats",
    "PositiveGrowthEvent",
    "PositiveImpactMetrics",
    "HolographicEtch",
]


def _to_unicode_scalar_string(text: str) -> str:
    """Apply JavaScript's well-formed-string replacement policy."""
    scalar_values: List[str] = []
    index = 0
    while index < len(text):
        code_point = ord(text[index])
        if 0xD800 <= code_point <= 0xDBFF:
            if index + 1 < len(text):
                low = ord(text[index + 1])
                if 0xDC00 <= low <= 0xDFFF:
                    combined = 0x10000 + ((code_point - 0xD800) << 10) + (low - 0xDC00)
                    scalar_values.append(chr(combined))
                    index += 2
                    continue
            scalar_values.append("\uFFFD")
        elif 0xDC00 <= code_point <= 0xDFFF:
            scalar_values.append("\uFFFD")
        else:
            scalar_values.append(text[index])
        index += 1
    return "".join(scalar_values)


def _text_encoder_utf8(text: str) -> bytes:
    """Encode a Python string with JavaScript ``TextEncoder`` semantics.

    JavaScript strings are sequences of UTF-16 code units. ``TextEncoder``
    combines valid surrogate pairs and replaces every unpaired surrogate with
    U+FFFD. Python's strict UTF-8 encoder instead raises for lone surrogates,
    so the replacement pass is required for deterministic cross-runtime input
    handling.
    """
    return _to_unicode_scalar_string(text).encode("utf-8")


def magnitude(v: Sequence[float]) -> float:
    """Return the Euclidean norm using the TypeScript operation order."""
    acc = 0.0
    for value in v:
        acc += value * value
    return math.sqrt(acc)


def dot(a: Sequence[float], b: Sequence[float]) -> float:
    """Return a ragged-safe dot product (implicit zero padding)."""
    acc = 0.0
    for index in range(min(len(a), len(b))):
        acc += a[index] * b[index]
    return acc


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Return cosine similarity, or zero for either zero vector."""
    a_magnitude = magnitude(a)
    b_magnitude = magnitude(b)
    if a_magnitude == 0 or b_magnitude == 0:
        return 0.0
    return dot(a, b) / (a_magnitude * b_magnitude)


def variance(v: Sequence[float]) -> float:
    """Single-pass variance over absolute values, matching the TS core."""
    length = len(v)
    if length == 0:
        return 0.0
    total = 0.0
    total_squared = 0.0
    for value in v:
        absolute = abs(value)
        total += absolute
        total_squared += absolute * absolute
    mean = total / length
    result = total_squared / length - mean * mean
    return 0.0 if result < 0 else result


def nova_neo_encode(text: str, dimensions: int, normalize: bool = False) -> List[float]:
    """Encode text with the deterministic SHA-256 NOVA-NEO hash backend.

    Normalization deliberately aggregates complete 32-byte SHA cycles before
    the remainder.  That is the exact operation order used by the TypeScript
    encoder and matters at dimensions above 32 because floating-point addition
    is not associative.
    """
    if isinstance(dimensions, bool) or not isinstance(dimensions, int) or dimensions <= 0:
        raise ValueError("dimensions must be a positive integer")

    digest = hashlib.sha256(_text_encoder_utf8(text)).digest()
    signed = [(byte / 255) * 2 - 1 for byte in digest]
    hash_length = len(signed)

    sum_squares = 0.0
    if normalize:
        hash_sum_squares = 0.0
        for value in signed:
            hash_sum_squares += value * value
        full_cycles = dimensions // hash_length
        remainder = dimensions % hash_length
        sum_squares = hash_sum_squares * full_cycles
        for index in range(remainder):
            value = signed[index]
            sum_squares += value * value

    values = [signed[index % hash_length] for index in range(dimensions)]
    if normalize:
        norm = math.sqrt(sum_squares) or 1.0
        for index in range(dimensions):
            values[index] /= norm
    return values


def estimate_entropy(tensor: Sequence[float], entropy_floor: float = 0.0) -> float:
    """Estimate NOVA-NEO tensor entropy as clamped absolute-value variance."""
    if not tensor:
        return 0.0
    return max(min(1.0, variance(tensor)), entropy_floor)


def effective_tensor_dimensions(backend: str, dimensions: int) -> int:
    """Return independent dimensions for the resonance null model."""
    safe = math.floor(dimensions) if math.isfinite(dimensions) and dimensions >= 1 else 1
    return safe if backend == "embedding" else min(safe, SHA256_TENSOR_DIMENSIONS)


def analytic_threshold(
    effective_dimensions: int,
    alpha: float = DEFAULT_FALSE_RESONANCE_ALPHA,
    candidates: int = 1,
) -> float:
    """Closed-form false-resonance threshold used by Stigmergy v5."""
    dimensions = (
        math.floor(effective_dimensions)
        if math.isfinite(effective_dimensions) and effective_dimensions >= 1
        else 1
    )
    if not math.isfinite(alpha):
        alpha = DEFAULT_FALSE_RESONANCE_ALPHA
    elif alpha <= 0:
        alpha = float.fromhex("0x0.0000000000001p-1022")
    elif alpha >= 1:
        alpha = 1.0 - 2.220446049250313e-16
    count = (
        math.floor(candidates)
        if math.isfinite(candidates) and candidates >= 1
        else 1
    )
    probability = math.exp(math.log1p(-alpha) / count)
    threshold = inverse_normal_cdf(probability) / math.sqrt(dimensions)
    return _clamp01(threshold)


def false_resonance_rate(
    threshold: float, effective_dimensions: int, candidates: int = 1
) -> float:
    """Gaussian null-model probability of a best-of-N false resonance."""
    dimensions = (
        math.floor(effective_dimensions)
        if math.isfinite(effective_dimensions) and effective_dimensions >= 1
        else 1
    )
    count = math.floor(candidates) if math.isfinite(candidates) and candidates >= 1 else 1
    phi = normal_cdf(threshold * math.sqrt(dimensions))
    return -math.expm1(count * math.log(phi))


def normal_cdf(z_value: float) -> float:
    """Portable normal CDF approximation used by the TypeScript core."""
    if not math.isfinite(z_value):
        return 1.0 if z_value > 0 else 0.0
    x_value = abs(z_value) / math.sqrt(2.0)
    t_value = 1.0 / (1.0 + 0.3275911 * x_value)
    erf = 1.0 - (
        (((((1.061405429 * t_value - 1.453152027) * t_value) + 1.421413741)
           * t_value - 0.284496736) * t_value + 0.254829592)
        * t_value
        * math.exp(-x_value * x_value)
    )
    return 0.5 * (1.0 + erf) if z_value >= 0 else 0.5 * (1.0 - erf)


def inverse_normal_cdf(probability: float) -> float:
    """Acklam rational approximation of the standard normal quantile."""
    if not 0 < probability < 1:
        raise ValueError("inverse_normal_cdf probability must be in (0, 1)")
    a = (
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    )
    b = (
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    )
    c = (
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    )
    d = (
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e00,
        3.754408661907416e00,
    )
    low = 0.02425
    if probability < low:
        q_value = math.sqrt(-2.0 * math.log(probability))
        return (
            (((((c[0] * q_value + c[1]) * q_value + c[2]) * q_value + c[3])
               * q_value + c[4]) * q_value + c[5])
            / ((((d[0] * q_value + d[1]) * q_value + d[2]) * q_value + d[3])
               * q_value + 1.0)
        )
    if probability > 1.0 - low:
        q_value = math.sqrt(-2.0 * math.log(1.0 - probability))
        return -(
            (((((c[0] * q_value + c[1]) * q_value + c[2]) * q_value + c[3])
               * q_value + c[4]) * q_value + c[5])
            / ((((d[0] * q_value + d[1]) * q_value + d[2]) * q_value + d[3])
               * q_value + 1.0)
        )
    q_value = probability - 0.5
    r_value = q_value * q_value
    return (
        (((((a[0] * r_value + a[1]) * r_value + a[2]) * r_value + a[3])
           * r_value + a[4]) * r_value + a[5])
        * q_value
        / (((((b[0] * r_value + b[1]) * r_value + b[2]) * r_value + b[3])
            * r_value + b[4]) * r_value + 1.0)
    )


@dataclass(frozen=True)
class TriadParityResult:
    input: str
    dimensions: int
    normalized: bool
    entropy: float
    tensor_sha256: str


def float_to_le_bytes(value: float) -> bytes:
    """Encode a float as the bytes of a little-endian Float64Array cell."""
    return struct.pack("<d", value)


def _tensor_sha256(tensor: Iterable[float]) -> str:
    hasher = hashlib.sha256()
    for value in tensor:
        hasher.update(float_to_le_bytes(value))
    return hasher.hexdigest()


def triad_fingerprint(
    text: str,
    dimensions: int = 32,
    normalize: bool = True,
    entropy_floor: float = 0.0,
) -> TriadParityResult:
    """Return the parity guardian fingerprint for a NOVA-NEO tensor."""
    tensor = nova_neo_encode(text, dimensions, normalize=normalize)
    return TriadParityResult(
        input=text,
        dimensions=dimensions,
        normalized=normalize,
        entropy=estimate_entropy(tensor, entropy_floor=entropy_floor),
        tensor_sha256=_tensor_sha256(tensor),
    )


_ECMASCRIPT_WHITESPACE = {
    "\u0009", "\u000A", "\u000B", "\u000C", "\u000D", "\u0020",
    "\u00A0", "\u1680", "\u2000", "\u2001", "\u2002", "\u2003",
    "\u2004", "\u2005", "\u2006", "\u2007", "\u2008", "\u2009",
    "\u200A", "\u2028", "\u2029", "\u202F", "\u205F", "\u3000",
    "\uFEFF",
}


def _embedding_features(text: str) -> List[str]:
    """Mirror ``embeddingEngine.ts::extractFeatures`` including UTF-16 slices."""
    lowered = _to_unicode_scalar_string(text).lower()
    normalized_chars: List[str] = []
    previous_was_space = True
    for character in lowered:
        category = unicodedata.category(character)
        retained = category.startswith(("L", "N"))
        is_space = character in _ECMASCRIPT_WHITESPACE
        if retained:
            normalized_chars.append(character)
            previous_was_space = False
        elif not previous_was_space:
            # Both stripped punctuation and whitespace become one ASCII space,
            # matching the two chained JavaScript replace calls.
            normalized_chars.append(" ")
            previous_was_space = True
        elif is_space:
            previous_was_space = True
    normalized = "".join(normalized_chars).strip()
    if not normalized:
        return []

    words = [word for word in normalized.split(" ") if word]
    features = list(words)
    for word in words:
        utf16 = word.encode("utf-16-le", errors="surrogatepass")
        units = [utf16[index:index + 2] for index in range(0, len(utf16), 2)]
        if len(units) < 2:
            continue
        for width in range(2, min(len(units), 4) + 1):
            for start in range(0, len(units) - width + 1):
                feature = b"".join(units[start:start + width]).decode(
                    "utf-16-le", errors="surrogatepass"
                )
                features.append(feature)
    return features


class HashingTrickBackend:
    """Dependency-free deterministic embedding backend mirrored from TS."""

    def __init__(self) -> None:
        self._last_dimension_healing: Optional[Dict[str, Any]] = None

    def encode(self, text: str, dimensions: int, normalize: bool) -> List[float]:
        safe_dimensions = _heal_dimensions(dimensions)
        if not isinstance(dimensions, bool) and safe_dimensions == dimensions:
            self._last_dimension_healing = None
        else:
            is_javascript_integer = (
                isinstance(dimensions, int) and not isinstance(dimensions, bool)
            ) or (
                isinstance(dimensions, float)
                and math.isfinite(dimensions)
                and dimensions.is_integer()
            )
            self._last_dimension_healing = {
                "requestedDimensions": dimensions,
                "healedDimensions": safe_dimensions,
                "reason": (
                    "non-positive"
                    if is_javascript_integer
                    else "non-integer"
                ),
                "timestamp": _timestamp(lambda: datetime.now(tz=timezone.utc)),
            }

        values = [0.0] * safe_dimensions
        for feature in _embedding_features(text):
            digest = hashlib.sha256(_text_encoder_utf8(feature)).digest()
            primary = int.from_bytes(digest[0:4], "little") % safe_dimensions
            secondary = int.from_bytes(digest[4:8], "little") % safe_dimensions
            weight = (digest[8] / 255) * 2 - 1
            values[primary] += weight
            values[secondary] += weight * 0.3

        if normalize:
            total = 0.0
            for value in values:
                total += value * value
            norm = math.sqrt(total) or 1.0
            for index in range(safe_dimensions):
                values[index] /= norm
        return values

    def get_last_dimension_healing(self) -> Optional[Dict[str, Any]]:
        return self._last_dimension_healing

    def getLastDimensionHealing(self) -> Optional[Dict[str, Any]]:  # noqa: N802
        return self.get_last_dimension_healing()


_DEFAULT_EMBEDDING_BACKEND = HashingTrickBackend()


class NovaNeoEncoder:
    """Deterministic NOVA-NEO encoder compatible with the TS hash backend."""

    def __init__(
        self,
        dimensions: int = 32,
        normalize: bool = False,
        backend: str = "hash",
        entropy_floor: float = 0.0,
        self_heal_dimensions: bool = False,
        embedding_backend: Optional[Any] = None,
    ) -> None:
        if self_heal_dimensions:
            dimensions = _heal_dimensions(dimensions)
        if isinstance(dimensions, bool) or not isinstance(dimensions, int) or dimensions <= 0:
            raise ValueError("dimensions must be a positive integer")
        if backend not in ("hash", "novaNeoWeb", "embedding"):
            raise ValueError("backend must be 'hash', 'novaNeoWeb', or 'embedding'")
        self.dimensions = dimensions
        self.normalize = normalize
        self.backend = backend
        self.entropy_floor = entropy_floor
        self.embedding_backend = (
            _DEFAULT_EMBEDDING_BACKEND
            if embedding_backend is None
            else embedding_backend
        )

    def encode(self, text: str) -> List[float]:
        if self.backend == "embedding":
            backend = self.embedding_backend
            encode_method = getattr(backend, "encode", None)
            if callable(encode_method):
                return list(encode_method(text, self.dimensions, self.normalize))
            if callable(backend):
                result = backend(text, self.dimensions, self.normalize)
                if inspect.isawaitable(result):
                    raise RuntimeError(
                        "Configured embedding backend is asynchronous; use "
                        "NovaNeoEncoder.encode_async()."
                    )
                return list(result)
            raise RuntimeError(
                "Configured embedding backend is asynchronous; use "
                "NovaNeoEncoder.encode_async()."
            )
        return nova_neo_encode(text, self.dimensions, normalize=self.normalize)

    async def encode_async(self, text: str) -> List[float]:
        if self.backend != "embedding":
            return self.encode(text)
        backend = self.embedding_backend
        async_method = getattr(backend, "encode_async", None)
        if not callable(async_method):
            async_method = getattr(backend, "encodeAsync", None)
        if callable(async_method):
            result = async_method(text, self.dimensions, self.normalize)
            if inspect.isawaitable(result):
                result = await result
            return list(result)
        encode_method = getattr(backend, "encode", None)
        if callable(encode_method):
            return list(encode_method(text, self.dimensions, self.normalize))
        if callable(backend):
            result = backend(text, self.dimensions, self.normalize)
            if inspect.isawaitable(result):
                result = await result
            return list(result)
        raise RuntimeError("embedding backend provides neither encode nor encode_async")

    async def encodeAsync(self, text: str) -> List[float]:  # noqa: N802
        return await self.encode_async(text)

    def estimate_entropy(self, tensor: Sequence[float]) -> float:
        return estimate_entropy(tensor, self.entropy_floor)

    def estimateEntropy(self, tensor: Sequence[float]) -> float:  # noqa: N802
        return self.estimate_entropy(tensor)


class UniversalEncoder(NovaNeoEncoder):
    """Portable hash facade corresponding to TypeScript ``UniversalEncoder``."""

    def __init__(
        self,
        dimensions: int = 32,
        normalize: bool = False,
        entropy_floor: float = 0.0,
        self_heal_dimensions: bool = False,
    ) -> None:
        super().__init__(
            dimensions=dimensions,
            normalize=normalize,
            backend="novaNeoWeb",
            entropy_floor=entropy_floor,
            self_heal_dimensions=self_heal_dimensions,
        )


NovaNeoWeb = UniversalEncoder


@dataclass(frozen=True)
class PheromoneTrace:
    id: str
    hash: str
    parent_hash: Optional[str]
    context: List[float]
    synthesis_vector: List[float]
    weight: float
    metadata: Optional[Dict[str, Any]]
    timestamp: str
    magnitude: Optional[float] = None
    semantic_context: Optional[List[float]] = None
    semantic_magnitude: Optional[float] = None

    @property
    def parentHash(self) -> Optional[str]:  # noqa: N802
        return self.parent_hash

    @property
    def synthesisVector(self) -> List[float]:  # noqa: N802
        return self.synthesis_vector

    @property
    def semanticContext(self) -> Optional[List[float]]:  # noqa: N802
        return self.semantic_context

    @property
    def semanticMagnitude(self) -> Optional[float]:  # noqa: N802
        return self.semantic_magnitude


@dataclass(frozen=True)
class ResonanceResult:
    score: float
    threshold_used: float
    trace: Optional[PheromoneTrace] = None
    positive_feedback_score: Optional[float] = None

    @property
    def thresholdUsed(self) -> float:  # noqa: N802
        return self.threshold_used

    @property
    def positiveFeedbackScore(self) -> Optional[float]:  # noqa: N802
        return self.positive_feedback_score


@dataclass(frozen=True)
class ResonantRecentTrace(PheromoneTrace):
    resonance_score: float = 0.0
    curiosity_lift: float = 0.0

    @property
    def resonanceScore(self) -> float:  # noqa: N802
        return self.resonance_score

    @property
    def curiosityLift(self) -> float:  # noqa: N802
        return self.curiosity_lift


@dataclass(frozen=True)
class BufferStats:
    size: int
    capacity: int
    lifetime_pushes: int

    @property
    def lifetimePushes(self) -> int:  # noqa: N802
        return self.lifetime_pushes


_T = TypeVar("_T")


class _CircularBuffer(Generic[_T]):
    def __init__(self, capacity: int) -> None:
        if isinstance(capacity, bool) or not isinstance(capacity, int) or capacity <= 0:
            raise ValueError("circular buffer capacity must be a positive integer")
        self.capacity = capacity
        self._buffer: List[Optional[_T]] = [None] * capacity
        self._head = 0
        self._count = 0
        self.lifetime_pushes = 0

    @property
    def size(self) -> int:
        return self._count

    def push(self, item: _T) -> Optional[_T]:
        evicted = self._buffer[self._head] if self._count == self.capacity else None
        self._buffer[self._head] = item
        self._head = (self._head + 1) % self.capacity
        if self._count < self.capacity:
            self._count += 1
        self.lifetime_pushes += 1
        return evicted

    def last(self) -> Optional[_T]:
        if self._count == 0:
            return None
        return self._buffer[(self._head - 1 + self.capacity) % self.capacity]

    def recent(self, limit: int) -> List[_T]:
        safe_limit = max(0, math.floor(limit)) if math.isfinite(limit) else self._count
        take = min(safe_limit, self._count)
        output: List[_T] = []
        index = (self._head - 1 + self.capacity) % self.capacity
        for _ in range(take):
            value = self._buffer[index]
            if value is not None:
                output.append(value)
            index = (index - 1 + self.capacity) % self.capacity
        return output

    def values(self) -> Iterator[_T]:
        start = (self._head - self._count + self.capacity) % self.capacity
        for offset in range(self._count):
            value = self._buffer[(start + offset) % self.capacity]
            if value is not None:
                yield value

    def to_list(self) -> List[_T]:
        return list(self.values())


class StigmergyV5:
    """Bounded, adaptive, RFC-8785-sealed stigmergic memory."""

    def __init__(
        self,
        resonance_threshold: Optional[float] = None,
        max_traces: int = 2048,
        noise_floor_alpha: Optional[float] = None,
        noise_floor_dimensions: int = SHA256_TENSOR_DIMENSIONS,
        noise_floor_backend: str = "hash",
        noise_floor_candidates: Optional[int] = None,
        adaptive_threshold: Optional[Union[float, bool]] = None,
        hysteresis_band: float = 0.05,
        calibration_window: int = 32,
        curiosity_bonus: float = 0.08,
        growth_bias: float = 0.15,
        id_factory: Optional[Callable[[], str]] = None,
        clock: Optional[Callable[[], Union[str, datetime]]] = None,
    ) -> None:
        if isinstance(max_traces, bool) or not isinstance(max_traces, int) or max_traces <= 0:
            raise ValueError("max_traces must be a positive integer")
        numeric_adaptive: Optional[float] = None
        if adaptive_threshold is not None and not isinstance(adaptive_threshold, bool):
            numeric_adaptive = float(adaptive_threshold)
        calibrated = analytic_threshold(
            effective_tensor_dimensions(noise_floor_backend, noise_floor_dimensions),
            alpha=(
                DEFAULT_FALSE_RESONANCE_ALPHA
                if noise_floor_alpha is None
                else noise_floor_alpha
            ),
            candidates=(
                max_traces
                if noise_floor_candidates is None
                else noise_floor_candidates
            ),
        )
        selected = (
            numeric_adaptive
            if numeric_adaptive is not None
            else resonance_threshold if resonance_threshold is not None else calibrated
        )
        self.resonance_threshold = _clamp01(selected)
        self.max_traces = max_traces
        self.adaptive_threshold = (
            adaptive_threshold if isinstance(adaptive_threshold, bool) else True
        )
        self.hysteresis_band = max(0.0, hysteresis_band)
        self.calibration_window = max(2, calibration_window)
        self.curiosity_bonus = _clamp01(curiosity_bonus)
        self.growth_bias = _clamp01(growth_bias)
        self._last_accepted_threshold = self.resonance_threshold
        self._traces: _CircularBuffer[PheromoneTrace] = _CircularBuffer(max_traces)
        self._id_factory = id_factory or (lambda: str(uuid.uuid4()))
        self._clock = clock or (lambda: datetime.now(tz=timezone.utc))

    @property
    def traces(self) -> List[PheromoneTrace]:
        """Oldest-first retained traces (legacy harness compatibility)."""
        return self._traces.to_list()

    def record_trace(
        self,
        context: Sequence[float],
        synthesis_vector: Sequence[float],
        metadata: Optional[Mapping[str, Any]] = None,
        *,
        semantic_context: Optional[Sequence[float]] = None,
        trace_id: Optional[str] = None,
    ) -> PheromoneTrace:
        context_values = list(context)
        synthesis_values = list(synthesis_vector)
        semantic_values = list(semantic_context) if semantic_context is not None else None
        metadata_values = dict(metadata) if metadata is not None else None
        parent = self._traces.last()
        parent_hash = parent.hash if parent is not None else None
        # TypeScript uses nullish coalescing here: an explicitly supplied
        # empty identifier is retained rather than treated as absent.
        identifier = self._id_factory() if trace_id is None else trace_id
        context_magnitude = magnitude(context_values)
        synthesis_magnitude = magnitude(synthesis_values)
        weight = (
            0.0
            if context_magnitude == 0 or synthesis_magnitude == 0
            else dot(context_values, synthesis_values)
            / (context_magnitude * synthesis_magnitude)
        )

        payload: Dict[str, Any] = {
            "id": identifier,
            "context": context_values,
            "synthesisVector": synthesis_values,
            "weight": weight,
        }
        if metadata is not None:
            payload["metadata"] = metadata_values
        if semantic_values is not None:
            payload["semanticContext"] = semantic_values
        trace_hash = canonical_digest({"payload": payload, "parentHash": parent_hash})
        trace = PheromoneTrace(
            id=identifier,
            hash=trace_hash,
            parent_hash=parent_hash,
            context=context_values,
            synthesis_vector=synthesis_values,
            weight=weight,
            metadata=metadata_values,
            timestamp=_timestamp(self._clock),
            magnitude=context_magnitude,
            semantic_context=semantic_values,
            semantic_magnitude=(
                magnitude(semantic_values) if semantic_values is not None else None
            ),
        )
        self._traces.push(trace)
        return trace

    def recordTrace(  # noqa: N802
        self,
        context: Sequence[float],
        synthesisVector: Sequence[float],
        metadata: Optional[Mapping[str, Any]] = None,
        options: Optional[Mapping[str, Any]] = None,
    ) -> PheromoneTrace:
        options = options or {}
        return self.record_trace(
            context,
            synthesisVector,
            metadata,
            semantic_context=options.get("semanticContext"),
            trace_id=options.get("traceId"),
        )

    def get_resonance(
        self, context: Sequence[float], keyspace: str = "context"
    ) -> ResonanceResult:
        if keyspace not in ("context", "semantic"):
            raise ValueError("keyspace must be 'context' or 'semantic'")
        query = list(context)
        query_magnitude = magnitude(query)
        if query_magnitude == 0:
            return ResonanceResult(0.0, self.resonance_threshold)

        best_score = 0.0
        best_trace: Optional[PheromoneTrace] = None
        for trace in self._traces.values():
            key_vector = trace.semantic_context if keyspace == "semantic" else trace.context
            if key_vector is None:
                continue
            trace_magnitude = (
                trace.semantic_magnitude if keyspace == "semantic" else trace.magnitude
            )
            if trace_magnitude is None:
                trace_magnitude = magnitude(key_vector)
            if trace_magnitude == 0:
                continue
            score = dot(query, key_vector) / (query_magnitude * trace_magnitude)
            if self.get_positive_feedback_hysteresis_score(score) > self.get_positive_feedback_hysteresis_score(best_score):
                best_score = score
                best_trace = trace

        threshold = self.get_adaptive_resonance_threshold()
        positive = self.get_positive_feedback_hysteresis_score(best_score)
        if best_trace is not None and positive >= threshold:
            self._last_accepted_threshold = threshold
            return ResonanceResult(best_score, threshold, best_trace, positive)
        return ResonanceResult(0.0, threshold, positive_feedback_score=positive)

    def getResonance(  # noqa: N802
        self,
        context: Sequence[float],
        options: Optional[Mapping[str, Any]] = None,
    ) -> ResonanceResult:
        return self.get_resonance(context, (options or {}).get("keyspace", "context"))

    def get_merkle_root(self) -> Optional[str]:
        latest = self._traces.last()
        return latest.hash if latest is not None else None

    def getMerkleRoot(self) -> Optional[str]:  # noqa: N802
        return self.get_merkle_root()

    def merkle_root(self) -> Optional[str]:
        """Legacy integration-harness alias for ``get_merkle_root``."""
        return self.get_merkle_root()

    def get_recent(self, limit: int = 5) -> List[PheromoneTrace]:
        return self._traces.recent(limit)

    def getRecent(self, limit: int = 5) -> List[PheromoneTrace]:  # noqa: N802
        return self.get_recent(limit)

    def get_resonant_recent(
        self,
        limit: int = 5,
        *,
        context: Optional[Sequence[float]] = None,
        curiosity_bonus: Optional[float] = None,
        include_low_resonance: bool = True,
    ) -> List[ResonantRecentTrace]:
        safe_limit = max(0, math.floor(limit)) if math.isfinite(limit) else self._traces.size
        if safe_limit == 0:
            return []
        threshold = self.get_adaptive_resonance_threshold()
        query = list(context) if context is not None else None
        query_magnitude = magnitude(query) if query is not None else 0.0
        curiosity = _clamp01(
            self.curiosity_bonus if curiosity_bonus is None else curiosity_bonus
        )
        ranked: List[Tuple[ResonantRecentTrace, int]] = []
        for insertion_order, trace in enumerate(self._traces.values()):
            contextual_score = max(0.0, trace.weight)
            if query is not None and query_magnitude > 0:
                trace_magnitude = trace.magnitude or magnitude(trace.context)
                contextual_score = (
                    0.0
                    if trace_magnitude == 0
                    else max(
                        0.0,
                        self.get_positive_feedback_hysteresis_score(
                            dot(query, trace.context) / (query_magnitude * trace_magnitude)
                        ),
                    )
                )
            gap = max(0.0, threshold - contextual_score)
            curiosity_lift = curiosity * gap if include_low_resonance else 0.0
            ranked.append(
                (
                    ResonantRecentTrace(
                        id=trace.id,
                        hash=trace.hash,
                        parent_hash=trace.parent_hash,
                        context=trace.context,
                        synthesis_vector=trace.synthesis_vector,
                        weight=trace.weight,
                        metadata=trace.metadata,
                        timestamp=trace.timestamp,
                        magnitude=trace.magnitude,
                        semantic_context=trace.semantic_context,
                        semantic_magnitude=trace.semantic_magnitude,
                        resonance_score=_clamp01(contextual_score + curiosity_lift),
                        curiosity_lift=curiosity_lift,
                    ),
                    insertion_order,
                )
            )
        ranked.sort(key=lambda pair: (-pair[0].resonance_score, -pair[1]))
        return [pair[0] for pair in ranked[:safe_limit]]

    def getResonantRecent(  # noqa: N802
        self, limit: int = 5, options: Optional[Mapping[str, Any]] = None
    ) -> List[ResonantRecentTrace]:
        options = options or {}
        return self.get_resonant_recent(
            limit,
            context=options.get("context"),
            curiosity_bonus=options.get("curiosityBonus"),
            include_low_resonance=options.get("includeLowResonance", True),
        )

    def get_buffer_stats(self) -> BufferStats:
        return BufferStats(
            size=self._traces.size,
            capacity=self._traces.capacity,
            lifetime_pushes=self._traces.lifetime_pushes,
        )

    def getBufferStats(self) -> BufferStats:  # noqa: N802
        return self.get_buffer_stats()

    def get_positive_feedback_hysteresis_score(self, score: float) -> float:
        raw = _clamp01(score)
        lift = max(0.0, raw - self._last_accepted_threshold) * self.growth_bias
        return _clamp01(raw + lift)

    def getPositiveFeedbackHysteresisScore(self, score: float) -> float:  # noqa: N802
        return self.get_positive_feedback_hysteresis_score(score)

    def get_adaptive_resonance_threshold(self) -> float:
        if not self.adaptive_threshold:
            return self.resonance_threshold
        weights = [
            max(0.0, trace.weight)
            for trace in self._traces.recent(self.calibration_window)
            if math.isfinite(trace.weight)
        ]
        if len(weights) < 3:
            return self.resonance_threshold
        total = 0.0
        for weight in weights:
            total += weight
        mean = total / len(weights)
        variance_total = 0.0
        for weight in weights:
            delta = weight - mean
            variance_total += delta * delta
        standard_deviation = math.sqrt(variance_total / len(weights))
        calibrated = _clamp01(mean - standard_deviation * 0.5)
        if abs(calibrated - self._last_accepted_threshold) < self.hysteresis_band:
            return self._last_accepted_threshold
        return calibrated

    def getAdaptiveResonanceThreshold(self) -> float:  # noqa: N802
        return self.get_adaptive_resonance_threshold()


@dataclass(frozen=True)
class EtchRecord:
    hash: str
    delta_weight: float
    note: Optional[str]
    timestamp: str
    flourishing_score: Optional[float] = None
    propagation_hint: Optional[str] = None

    @property
    def deltaWeight(self) -> float:  # noqa: N802
        return self.delta_weight

    @property
    def flourishingScore(self) -> Optional[float]:  # noqa: N802
        return self.flourishing_score

    @property
    def propagationHint(self) -> Optional[str]:  # noqa: N802
        return self.propagation_hint


@dataclass(frozen=True)
class AdaptiveConfidenceBreakdown:
    alignment: float
    magnitude_health: float
    static_floor_margin: float
    recency_stability: float
    score: float
    accepted: bool

    @property
    def magnitudeHealth(self) -> float:  # noqa: N802
        return self.magnitude_health

    @property
    def staticFloorMargin(self) -> float:  # noqa: N802
        return self.static_floor_margin

    @property
    def recencyStability(self) -> float:  # noqa: N802
        return self.recency_stability


@dataclass(frozen=True)
class EudaimonicEtchSummary:
    flourishing_score: float
    propagation_hint: str
    positive_resonance: float

    @property
    def flourishingScore(self) -> float:  # noqa: N802
        return self.flourishing_score

    @property
    def propagationHint(self) -> str:  # noqa: N802
        return self.propagation_hint

    @property
    def positiveResonance(self) -> float:  # noqa: N802
        return self.positive_resonance


@dataclass(frozen=True)
class MemoryStats:
    size: int
    capacity: int
    lifetime_pushes: int
    utilization_pct: float

    @property
    def lifetimePushes(self) -> int:  # noqa: N802
        return self.lifetime_pushes

    @property
    def utilizationPct(self) -> float:  # noqa: N802
        return self.utilization_pct


@dataclass(frozen=True)
class PositiveGrowthEvent:
    domain: str
    title: str
    positive_building: str
    resonance_delta: float
    evidence: Optional[Dict[str, Any]]
    human_celebration: Optional[str]
    id: str
    hash: str
    parent_hash: Optional[str]
    timestamp: str
    resonance_score: float

    @property
    def positiveBuilding(self) -> str:  # noqa: N802
        return self.positive_building

    @property
    def resonanceDelta(self) -> float:  # noqa: N802
        return self.resonance_delta

    @property
    def humanCelebration(self) -> Optional[str]:  # noqa: N802
        return self.human_celebration

    @property
    def parentHash(self) -> Optional[str]:  # noqa: N802
        return self.parent_hash

    @property
    def resonanceScore(self) -> float:  # noqa: N802
        return self.resonance_score


@dataclass(frozen=True)
class PositiveImpactMetrics:
    contributor_joy: float
    adoption_velocity: float
    beneficial_outcome_amplification: float
    growth_events: int
    merkle_root: Optional[str]

    @property
    def contributorJoy(self) -> float:  # noqa: N802
        return self.contributor_joy

    @property
    def adoptionVelocity(self) -> float:  # noqa: N802
        return self.adoption_velocity

    @property
    def beneficialOutcomeAmplification(self) -> float:  # noqa: N802
        return self.beneficial_outcome_amplification

    @property
    def growthEvents(self) -> int:  # noqa: N802
        return self.growth_events

    @property
    def merkleRoot(self) -> Optional[str]:  # noqa: N802
        return self.merkle_root


class _DefaultPositiveGrowthLedger:
    """Small Python port used when ``growth_ledger=True`` is requested."""

    def __init__(self, max_events: int, human_celebration_enabled: bool) -> None:
        self._events: _CircularBuffer[PositiveGrowthEvent] = _CircularBuffer(max_events)
        self._human_celebration_enabled = human_celebration_enabled

    @staticmethod
    def _read(input_value: Any, snake_name: str, camel_name: str) -> Any:
        if isinstance(input_value, Mapping):
            if snake_name in input_value:
                return input_value[snake_name]
            return input_value.get(camel_name)
        if hasattr(input_value, snake_name):
            return getattr(input_value, snake_name)
        return getattr(input_value, camel_name, None)

    def record_growth_event(self, input_value: Any) -> PositiveGrowthEvent:
        domain = str(self._read(input_value, "domain", "domain"))
        title = str(self._read(input_value, "title", "title"))
        positive_building = str(
            self._read(input_value, "positive_building", "positiveBuilding")
        )
        resonance_delta = _clamp_signed(
            float(self._read(input_value, "resonance_delta", "resonanceDelta"))
        )
        evidence = self._read(input_value, "evidence", "evidence")
        celebration = self._read(
            input_value, "human_celebration", "humanCelebration"
        )
        parent = self._events.last()
        parent_hash = parent.hash if parent is not None else None
        resonance_score = _clamp01(0.5 + resonance_delta / 2.0)
        payload = {
            "domain": domain,
            "evidence": evidence,
            "parentHash": parent_hash,
            "positiveBuilding": positive_building,
            "resonanceDelta": resonance_delta,
            "resonanceScore": resonance_score,
            "title": title,
        }
        event_hash = canonical_digest(payload)
        if self._human_celebration_enabled:
            human_celebration = (
                celebration
                if celebration is not None
                else f"Positive Building of {domain}: {title} now radiates more trust."
            )
        else:
            human_celebration = None
        event = PositiveGrowthEvent(
            domain=domain,
            title=title,
            positive_building=positive_building,
            resonance_delta=resonance_delta,
            evidence=(dict(evidence) if isinstance(evidence, Mapping) else evidence),
            human_celebration=human_celebration,
            id=event_hash[:16],
            hash=event_hash,
            parent_hash=parent_hash,
            timestamp=_timestamp(lambda: datetime.now(tz=timezone.utc)),
            resonance_score=resonance_score,
        )
        self._events.push(event)
        return event

    def recent_growth_events(self, limit: int = 8) -> List[PositiveGrowthEvent]:
        return self._events.recent(limit)

    def get_positive_impact_metrics(self) -> PositiveImpactMetrics:
        events = self._events.to_list()
        if not events:
            return PositiveImpactMetrics(0.0, 0.0, 0.0, 0, None)
        joy_events = sum(1 for event in events if event.human_celebration)
        mean_resonance = sum(event.resonance_score for event in events) / len(events)
        domain_diversity = len({event.domain for event in events}) / len(events)
        positive_delta = sum(max(0.0, event.resonance_delta) for event in events)
        return PositiveImpactMetrics(
            contributor_joy=_round_metric(
                _clamp01(0.35 + mean_resonance * 0.45 + joy_events / len(events) * 0.2)
            ),
            adoption_velocity=_round_metric(
                _clamp01(0.25 + domain_diversity * 0.35 + math.log2(len(events) + 1) / 10)
            ),
            beneficial_outcome_amplification=_round_metric(
                _clamp01(0.3 + positive_delta / len(events) * 0.7)
            ),
            growth_events=len(events),
            merkle_root=events[-1].hash,
        )


class HolographicEtch:
    """Bounded adaptive etch ledger with eudaimonic result metadata."""

    def __init__(
        self,
        confidence_floor: float = 0.65,
        audit_log: bool = True,
        max_etches: int = 4096,
        static_floor_weight: float = 0.4,
        curiosity_bonus: float = 0.15,
        flourishing_amplifier: float = 0.2,
        growth_ledger: Optional[Any] = None,
        max_growth_events: Optional[int] = None,
        human_celebration_enabled: bool = True,
        clock: Optional[Callable[[], Union[str, datetime]]] = None,
    ) -> None:
        if isinstance(max_etches, bool) or not isinstance(max_etches, int) or max_etches <= 0:
            raise ValueError("max_etches must be a positive integer")
        self.confidence_floor = confidence_floor
        self.audit_log = audit_log
        self.max_etches = max_etches
        self.static_floor_weight = _clamp01(static_floor_weight)
        self.curiosity_bonus = curiosity_bonus
        self.flourishing_amplifier = _clamp01(flourishing_amplifier)
        self._etches: _CircularBuffer[EtchRecord] = _CircularBuffer(max_etches)
        self._audit: _CircularBuffer[EtchRecord] = _CircularBuffer(max_etches)
        if growth_ledger is True:
            self._growth_ledger: Optional[Any] = _DefaultPositiveGrowthLedger(
                max_growth_events if max_growth_events is not None else max_etches,
                human_celebration_enabled,
            )
        elif growth_ledger is None or growth_ledger is False:
            self._growth_ledger = None
        else:
            self._growth_ledger = growth_ledger
        self._clock = clock or (lambda: datetime.now(tz=timezone.utc))

    @property
    def etches(self) -> List[EtchRecord]:
        """Oldest-first committed etches (legacy harness compatibility)."""
        return self._etches.to_list()

    @property
    def audit(self) -> List[EtchRecord]:
        return self._audit.to_list()

    def score_confidence(
        self, context: Sequence[float], synthesis_vector: Sequence[float]
    ) -> AdaptiveConfidenceBreakdown:
        context_magnitude = magnitude(context)
        synthesis_magnitude = magnitude(synthesis_vector)
        alignment = max(0.0, cosine(context, synthesis_vector))
        magnitude_health = _clamp01(min(context_magnitude, synthesis_magnitude))
        normalized_delta = _normalized_delta(context, synthesis_vector)
        static_floor_margin = _clamp01(
            normalized_delta - self.confidence_floor + 1.0
        ) / 2.0
        recency_stability = self._compute_recency_stability()
        adaptive_weight = 1.0 - self.static_floor_weight
        adaptive = (
            0.5 * alignment
            + 0.2 * magnitude_health
            + 0.3 * recency_stability
        )
        score = _clamp01(
            self.static_floor_weight * static_floor_margin
            + adaptive_weight * adaptive
        )
        final_score = _clamp01(score + self.curiosity_bonus * 0.5)
        return AdaptiveConfidenceBreakdown(
            alignment=alignment,
            magnitude_health=magnitude_health,
            static_floor_margin=static_floor_margin,
            recency_stability=recency_stability,
            score=final_score,
            accepted=normalized_delta >= self.confidence_floor,
        )

    def scoreConfidence(  # noqa: N802
        self, context: Sequence[float], synthesisVector: Sequence[float]
    ) -> AdaptiveConfidenceBreakdown:
        return self.score_confidence(context, synthesisVector)

    def apply_etch(
        self,
        context: Sequence[float],
        synthesis_vector: Sequence[float],
        note: Optional[str] = None,
    ) -> EtchRecord:
        context_values = list(context)
        synthesis_values = list(synthesis_vector)
        normalized_delta = _normalized_delta(context_values, synthesis_values)
        if normalized_delta < self.confidence_floor:
            skipped = EtchRecord(
                hash="",
                delta_weight=0.0,
                note="skipped-low-confidence",
                timestamp=_timestamp(self._clock),
            )
            if self.audit_log:
                self._audit.push(skipped)
            return skipped

        eudaimonic = self.score_eudaimonic_etch(
            context_values, synthesis_values, normalized_delta
        )
        payload: Dict[str, Any] = {
            "context": context_values,
            "synthesisVector": synthesis_values,
            "normalizedDelta": normalized_delta,
        }
        if note is not None:
            payload["note"] = note
        record = EtchRecord(
            hash=canonical_digest(payload),
            delta_weight=normalized_delta,
            note=note,
            timestamp=_timestamp(self._clock),
            flourishing_score=eudaimonic.flourishing_score,
            propagation_hint=eudaimonic.propagation_hint,
        )
        self._etches.push(record)
        if self.audit_log:
            self._audit.push(record)
        return record

    def applyEtch(  # noqa: N802
        self,
        context: Sequence[float],
        synthesisVector: Sequence[float],
        note: Optional[str] = None,
    ) -> EtchRecord:
        return self.apply_etch(context, synthesisVector, note)

    def score_eudaimonic_etch(
        self,
        context: Sequence[float],
        synthesis_vector: Sequence[float],
        normalized_delta: Optional[float] = None,
    ) -> EudaimonicEtchSummary:
        positive_resonance = max(0.0, cosine(context, synthesis_vector))
        delta = (
            _normalized_delta(context, synthesis_vector)
            if normalized_delta is None
            else normalized_delta
        )
        base = _clamp01(max(0.0, delta))
        flourishing_score = _clamp01(
            base * (1.0 + self.flourishing_amplifier * positive_resonance)
            + self.curiosity_bonus * 0.1
        )
        propagation_hint = (
            "radiate"
            if flourishing_score >= 0.9
            else "bloom" if flourishing_score >= 0.5 else "seed"
        )
        return EudaimonicEtchSummary(
            flourishing_score=flourishing_score,
            propagation_hint=propagation_hint,
            positive_resonance=positive_resonance,
        )

    def scoreEudaimonicEtch(  # noqa: N802
        self,
        context: Sequence[float],
        synthesisVector: Sequence[float],
        normalizedDelta: Optional[float] = None,
    ) -> EudaimonicEtchSummary:
        return self.score_eudaimonic_etch(context, synthesisVector, normalizedDelta)

    def recent(self, limit: int = 5) -> List[EtchRecord]:
        return self._etches.recent(limit)

    def recent_audit(self, limit: int = 5) -> List[EtchRecord]:
        return self._audit.recent(limit)

    def recentAudit(self, limit: int = 5) -> List[EtchRecord]:  # noqa: N802
        return self.recent_audit(limit)

    def record_positive_growth_event(self, input_value: Any) -> Optional[Any]:
        if self._growth_ledger is None:
            return None
        method = getattr(self._growth_ledger, "record_growth_event", None)
        if not callable(method):
            method = getattr(self._growth_ledger, "recordGrowthEvent", None)
        if not callable(method):
            raise TypeError("growth_ledger must provide record_growth_event()")
        return method(input_value)

    def recordPositiveGrowthEvent(self, input_value: Any) -> Optional[Any]:  # noqa: N802
        return self.record_positive_growth_event(input_value)

    def recent_positive_growth(self, limit: int = 8) -> List[Any]:
        if self._growth_ledger is None:
            return []
        method = getattr(self._growth_ledger, "recent_growth_events", None)
        if not callable(method):
            method = getattr(self._growth_ledger, "recentGrowthEvents", None)
        if not callable(method):
            raise TypeError("growth_ledger must provide recent_growth_events()")
        return list(method(limit))

    def recentPositiveGrowth(self, limit: int = 8) -> List[Any]:  # noqa: N802
        return self.recent_positive_growth(limit)

    def get_positive_impact_metrics(self) -> Optional[Any]:
        if self._growth_ledger is None:
            return None
        method = getattr(self._growth_ledger, "get_positive_impact_metrics", None)
        if not callable(method):
            method = getattr(self._growth_ledger, "getPositiveImpactMetrics", None)
        if not callable(method):
            raise TypeError("growth_ledger must provide get_positive_impact_metrics()")
        return method()

    def getPositiveImpactMetrics(self) -> Optional[Any]:  # noqa: N802
        return self.get_positive_impact_metrics()

    def get_memory_stats(self) -> MemoryStats:
        utilization = math.floor(
            (self._etches.size / self._etches.capacity) * 1000.0 + 0.5
        ) / 10.0
        return MemoryStats(
            size=self._etches.size,
            capacity=self._etches.capacity,
            lifetime_pushes=self._etches.lifetime_pushes,
            utilization_pct=utilization,
        )

    def getMemoryStats(self) -> MemoryStats:  # noqa: N802
        return self.get_memory_stats()

    def _compute_recency_stability(self) -> float:
        recent = self._etches.recent(16)
        if len(recent) < 2:
            return 1.0
        total = 0.0
        total_squared = 0.0
        count = 0
        for record in recent:
            if record.hash == "":
                continue
            total += record.delta_weight
            total_squared += record.delta_weight * record.delta_weight
            count += 1
        if count < 2:
            return 1.0
        mean = total / count
        result_variance = max(0.0, total_squared / count - mean * mean)
        return _clamp01(1.0 - min(1.0, math.sqrt(result_variance)))


def _normalized_delta(
    context: Sequence[float], synthesis_vector: Sequence[float]
) -> float:
    minimum = min(len(context), len(synthesis_vector))
    accumulator = 0.0
    for index in range(minimum):
        accumulator += context[index] * synthesis_vector[index]
    return accumulator / (minimum or 1)


def _clamp01(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value


def _clamp_signed(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    if value < -1:
        return -1.0
    if value > 1:
        return 1.0
    return value


def _round_metric(value: float) -> float:
    # Metrics are clamped non-negative before rounding, so this reproduces
    # JavaScript Math.round(value * 1000) / 1000 without negative tie quirks.
    return math.floor(value * 1000.0 + 0.5) / 1000.0


def _heal_dimensions(dimensions: Any) -> int:
    if (
        isinstance(dimensions, int)
        and not isinstance(dimensions, bool)
        and dimensions > 0
    ):
        return dimensions
    base = math.ceil(dimensions) if isinstance(dimensions, (int, float)) and math.isfinite(dimensions) and dimensions > 0 else 1
    power = 1
    while power < base and power < 2 ** 30:
        power *= 2
    return power


def _timestamp(clock: Callable[[], Union[str, datetime]]) -> str:
    value = clock()
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    utc = value.astimezone(timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _cli(argv: Optional[Sequence[str]] = None) -> int:
    """Emit encoder and fixed triad fixtures for the parity guardian."""
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="MCOP deterministic triad parity fixture")
    parser.add_argument("text", help="Input string to encode")
    parser.add_argument("--dimensions", type=int, default=32)
    parser.add_argument("--normalize", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)

    result = triad_fingerprint(args.text, args.dimensions, args.normalize)
    context = [0.25, -0.5, 0.75, 1.0]
    synthesis = [0.5, -0.25, 0.75, 0.5]
    fixed_time = lambda: "2026-07-14T00:00:00.000Z"
    memory = StigmergyV5(
        resonance_threshold=0.25,
        max_traces=8,
        adaptive_threshold=False,
        clock=fixed_time,
    )
    trace = memory.record_trace(
        context,
        synthesis,
        {"stage": "cross-language-parity", "sequence": 1},
        trace_id="123e4567-e89b-42d3-a456-426614174000",
    )
    resonance = memory.get_resonance(context)
    etcher = HolographicEtch(
        confidence_floor=0.0,
        audit_log=True,
        max_etches=8,
        static_floor_weight=0.4,
        curiosity_bonus=0.15,
        flourishing_amplifier=0.2,
        clock=fixed_time,
    )
    etch = etcher.apply_etch(context, synthesis, "cross-language-parity")

    optional_memory = StigmergyV5(
        resonance_threshold=0.25,
        max_traces=8,
        adaptive_threshold=False,
        clock=fixed_time,
    )
    optional_trace = optional_memory.record_trace(
        context,
        synthesis,
        metadata=None,
        trace_id="223e4567-e89b-42d3-a456-426614174000",
    )
    optional_etch = etcher.apply_etch(context, synthesis, note=None)

    embedding_tensor = NovaNeoEncoder(
        dimensions=16, normalize=True, backend="embedding"
    ).encode("Semantic café 😀")
    unicode_tensor = NovaNeoEncoder(dimensions=8).encode("\ud800")
    growth_etcher = HolographicEtch(
        confidence_floor=0.0,
        max_etches=8,
        growth_ledger=True,
        max_growth_events=8,
    )
    growth_event = growth_etcher.record_positive_growth_event(
        {
            "domain": "determinism",
            "title": "Parity",
            "positiveBuilding": "Shared contract",
            "resonanceDelta": 0.5,
        }
    )
    growth_metrics = growth_etcher.get_positive_impact_metrics()

    json.dump(
        {
            "input": result.input,
            "dimensions": result.dimensions,
            "normalized": result.normalized,
            "entropy": result.entropy,
            "tensor_sha256": result.tensor_sha256,
            "triad_protocol_version": TRIAD_PROTOCOL_VERSION,
            "stigmergy": {
                "trace_id": trace.id,
                "trace_hash": trace.hash,
                "weight": trace.weight,
                "merkle_root": memory.get_merkle_root(),
                "resonance_score": resonance.score,
                "threshold_used": resonance.threshold_used,
                "positive_feedback_score": resonance.positive_feedback_score,
            },
            "holographic_etch": {
                "hash": etch.hash,
                "delta_weight": etch.delta_weight,
                "flourishing_score": etch.flourishing_score,
                "propagation_hint": etch.propagation_hint,
            },
            "optional_fields": {
                "trace_hash": optional_trace.hash,
                "etch_hash": optional_etch.hash,
            },
            "embedding": {"tensor_sha256": _tensor_sha256(embedding_tensor)},
            "unicode_policy": {"tensor_sha256": _tensor_sha256(unicode_tensor)},
            "noise_floor": {
                "candidate_1": StigmergyV5(
                    max_traces=2048,
                    noise_floor_candidates=1,
                    adaptive_threshold=False,
                ).get_resonance([0.0]).threshold_used,
                "candidate_8": StigmergyV5(
                    max_traces=2048,
                    noise_floor_candidates=8,
                    adaptive_threshold=False,
                ).get_resonance([0.0]).threshold_used,
            },
            "growth_ledger": {
                "hash": growth_event.hash if growth_event is not None else None,
                "contributor_joy": (
                    growth_metrics.contributor_joy
                    if growth_metrics is not None
                    else None
                ),
                "growth_events": (
                    growth_metrics.growth_events
                    if growth_metrics is not None
                    else None
                ),
                "merkle_root": (
                    growth_metrics.merkle_root
                    if growth_metrics is not None
                    else None
                ),
            },
        },
        sys.stdout,
        separators=(",", ":"),
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_cli())
