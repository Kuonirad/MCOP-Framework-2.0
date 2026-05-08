"""Grok Images API adapter for MCOP-Framework-2.0.

The module exposes two layers:

* ``generate_image`` / ``generate_image_async``: thin HTTP helpers for xAI's
  OpenAI-compatible Images API.
* ``GrokImageMCOPAdapter``: a BaseMCOPAdapter integration that routes image
  prompts through MCOP's encode → resonance → dialectical synthesis → etch
  pipeline before dispatching to xAI.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, Protocol

import httpx

from .base_adapter import (
    AdapterCapabilities,
    AdapterRequest,
    AdapterResponse,
    BaseMCOPAdapter,
    PreparedDispatch,
)

GROK_BASE_URL = os.getenv("GROK_BASE_URL", "https://api.x.ai/v1")
GROK_IMAGE_MODEL = os.getenv("GROK_IMAGE_MODEL", "grok-imagine-image")

ResponseFormat = Literal["url", "b64_json"]
Resolution = Literal["1k", "2k"]
AspectRatio = Literal[
    "1:1",
    "3:4",
    "4:3",
    "9:16",
    "16:9",
    "2:3",
    "3:2",
]


__all__ = [
    "GROK_BASE_URL",
    "GROK_IMAGE_MODEL",
    "GrokImageClient",
    "GrokImageMCOPAdapter",
    "GrokImageRequest",
    "GrokImageResult",
    "generate_image",
    "generate_image_async",
]


def _api_key(explicit: Optional[str] = None) -> str:
    """Resolve the xAI bearer token from explicit args or environment."""

    key = explicit or os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY")
    if not key:
        raise RuntimeError(
            "Grok Images API key is required; set GROK_API_KEY or XAI_API_KEY"
        )
    return key


def _endpoint(base_url: Optional[str] = None) -> str:
    return f"{(base_url or GROK_BASE_URL).rstrip('/')}/images/generations"


def _payload(
    *,
    prompt: str,
    model: str,
    n: int,
    response_format: ResponseFormat,
    aspect_ratio: Optional[AspectRatio] = None,
    resolution: Optional[Resolution] = None,
    extra_body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string")
    if not 1 <= n <= 10:
        raise ValueError("n must be between 1 and 10")
    if response_format not in {"url", "b64_json"}:
        raise ValueError("response_format must be 'url' or 'b64_json'")

    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": n,
        "response_format": response_format,
    }
    if aspect_ratio is not None:
        payload["aspect_ratio"] = aspect_ratio
    if resolution is not None:
        payload["resolution"] = resolution
    if extra_body:
        payload.update(extra_body)
    return payload


def _headers(api_key: Optional[str] = None) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key(api_key)}",
        "Content-Type": "application/json",
    }


def _data_from_response(response: httpx.Response) -> List[Dict[str, Any]]:
    response.raise_for_status()
    body = response.json()
    data = body.get("data")
    if not isinstance(data, list):
        raise RuntimeError("Grok Images API response did not include a data list")
    return data


def generate_image(
    prompt: str,
    *,
    model: str = GROK_IMAGE_MODEL,
    n: int = 1,
    response_format: ResponseFormat = "url",
    aspect_ratio: Optional[AspectRatio] = None,
    resolution: Optional[Resolution] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = 60.0,
    client: Optional[httpx.Client] = None,
    extra_body: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Generate images with xAI's Images API and return ``data`` entries.

    Each returned dict contains either ``url`` or ``b64_json`` depending on
    ``response_format``. Pass ``client`` to reuse an existing ``httpx.Client``
    or to inject a mock transport during tests.
    """

    payload = _payload(
        prompt=prompt,
        model=model,
        n=n,
        response_format=response_format,
        aspect_ratio=aspect_ratio,
        resolution=resolution,
        extra_body=extra_body,
    )
    request_kwargs = {
        "json": payload,
        "headers": _headers(api_key),
        "timeout": timeout,
    }
    if client is not None:
        return _data_from_response(client.post(_endpoint(base_url), **request_kwargs))

    with httpx.Client() as http_client:
        return _data_from_response(
            http_client.post(_endpoint(base_url), **request_kwargs)
        )


async def generate_image_async(
    prompt: str,
    *,
    model: str = GROK_IMAGE_MODEL,
    n: int = 1,
    response_format: ResponseFormat = "url",
    aspect_ratio: Optional[AspectRatio] = None,
    resolution: Optional[Resolution] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = 60.0,
    client: Optional[httpx.AsyncClient] = None,
    extra_body: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Async variant of :func:`generate_image`."""

    payload = _payload(
        prompt=prompt,
        model=model,
        n=n,
        response_format=response_format,
        aspect_ratio=aspect_ratio,
        resolution=resolution,
        extra_body=extra_body,
    )
    request_kwargs = {
        "json": payload,
        "headers": _headers(api_key),
        "timeout": timeout,
    }
    if client is not None:
        return _data_from_response(await client.post(_endpoint(base_url), **request_kwargs))

    async with httpx.AsyncClient() as http_client:
        return _data_from_response(
            await http_client.post(_endpoint(base_url), **request_kwargs)
        )


class GrokImageClient(Protocol):
    """Minimal sync client surface for Grok image generation."""

    def generate_image(
        self,
        *,
        prompt: str,
        model: str,
        n: int,
        response_format: ResponseFormat,
        aspect_ratio: Optional[AspectRatio] = None,
        resolution: Optional[Resolution] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:  # pragma: no cover -- structural typing only
        ...


@dataclass
class GrokImageResult:
    """Vendor-neutral result returned by ``GrokImageMCOPAdapter``."""

    model: str
    images: List[Dict[str, Any]]
    response_format: ResponseFormat
    audit_hash: Optional[str] = None
    raw: Any = None

    @property
    def image_url(self) -> Optional[str]:
        first = self.images[0] if self.images else {}
        value = first.get("url")
        return value if isinstance(value, str) else None


@dataclass
class GrokImageRequest(AdapterRequest):
    """MCOP request shape for xAI image generations."""

    model: str = GROK_IMAGE_MODEL
    n: int = 1
    response_format: ResponseFormat = "url"
    aspect_ratio: Optional[AspectRatio] = None
    resolution: Optional[Resolution] = None


class _DefaultGrokImageClient:
    def generate_image(
        self,
        *,
        prompt: str,
        model: str,
        n: int,
        response_format: ResponseFormat,
        aspect_ratio: Optional[AspectRatio] = None,
        resolution: Optional[Resolution] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        return generate_image(
            prompt,
            model=model,
            n=n,
            response_format=response_format,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            extra_body=extra_body,
        )


class GrokImageMCOPAdapter(BaseMCOPAdapter):
    """MCOP adapter that dispatches refined prompts to xAI Images."""

    def __init__(
        self,
        client: Optional[GrokImageClient] = None,
        **base_kwargs: Any,
    ) -> None:
        super().__init__(**base_kwargs)
        self._client = client or _DefaultGrokImageClient()

    @property
    def platform_name(self) -> str:
        return "grok-images"

    def get_capabilities(self) -> AdapterCapabilities:
        return AdapterCapabilities(
            platform="grok-images",
            version="2026-05",
            models=[
                "grok-imagine-image",
                "grok-imagine-image-quality",
                "grok-imagine-image-fast",
            ],
            supports_audit=True,
            features=[
                "text-to-image",
                "batch-generation",
                "url-output",
                "base64-output",
                "aspect-ratio",
                "resolution",
                "merkle-audit",
            ],
            max_resolution="2k",
            notes=(
                "Uses xAI's /images/generations endpoint; set "
                "GROK_API_KEY or XAI_API_KEY for the default HTTP client."
            ),
        )

    def generate_image(
        self,
        prompt: str,
        *,
        model: str = GROK_IMAGE_MODEL,
        n: int = 1,
        response_format: ResponseFormat = "url",
        aspect_ratio: Optional[AspectRatio] = None,
        resolution: Optional[Resolution] = None,
        **metadata: Any,
    ) -> AdapterResponse:
        request = GrokImageRequest(
            prompt=prompt,
            domain="imaging",
            model=model,
            n=n,
            response_format=response_format,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            metadata=metadata,
        )
        return self.generate(request)

    def call_platform(
        self, dispatch: PreparedDispatch, request: AdapterRequest
    ) -> GrokImageResult:
        if isinstance(request, GrokImageRequest):
            image_request = request
        else:
            payload = request.payload
            image_request = GrokImageRequest(
                prompt=request.prompt,
                domain=request.domain,
                metadata=request.metadata,
                human_feedback=request.human_feedback,
                style_context=request.style_context,
                entropy_target=request.entropy_target,
                planned_sequence=request.planned_sequence,
                model=str(payload.get("model", GROK_IMAGE_MODEL)),
                n=int(payload.get("n", 1)),
                response_format=payload.get("response_format", "url"),
                aspect_ratio=payload.get("aspect_ratio"),
                resolution=payload.get("resolution"),
            )

        images = self._client.generate_image(
            prompt=dispatch.refined_prompt,
            model=image_request.model,
            n=image_request.n,
            response_format=image_request.response_format,
            aspect_ratio=image_request.aspect_ratio,
            resolution=image_request.resolution,
            extra_body=None,
        )
        return GrokImageResult(
            model=image_request.model,
            images=images,
            response_format=image_request.response_format,
            audit_hash=dispatch.etch_hash or None,
            raw={"data": images},
        )
