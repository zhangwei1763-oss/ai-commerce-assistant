"""
火山 / OpenAI 兼容图片生成接口封装。
默认按 images/generations 兼容协议发起请求，并兼容 url / b64_json 两类返回。
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import httpx

from services.provider_catalog import resolve_image_endpoint, resolve_image_model

DEFAULT_IMAGE_SIZE = ""
MAX_RETRIES = 3


@dataclass
class GeneratedImageAsset:
    url: str = ""
    b64_json: str = ""
    revised_prompt: str = ""


def _extract_error_message(payload: Any) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            for key in ("message", "detail", "reason"):
                value = error.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        for key in ("message", "detail", "reason"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return ""


def _normalize_image_generation_error_message(message: str, endpoint: str) -> str:
    normalized_message = (message or "").strip()
    lower_message = normalized_message.lower()
    lower_endpoint = (endpoint or "").strip().lower()

    if (
        'unknown field "messages"' in normalized_message
        or lower_endpoint.endswith("/chat/completions")
        or "/responses" in lower_endpoint
        or "/contents/generations/tasks" in lower_endpoint
    ):
        return "当前填写的不是生图接口，请在设置里把“人物图 生图模型”的 API 端点改成图片生成地址"

    return normalized_message or "图片生成失败"


def _parse_image_items(payload: Any) -> list[GeneratedImageAsset]:
    raw_items: list[Any] = []
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            raw_items = data
        elif isinstance(data, dict):
            for key in ("images", "items", "results"):
                maybe_items = data.get(key)
                if isinstance(maybe_items, list):
                    raw_items = maybe_items
                    break
        if not raw_items:
            for key in ("images", "items", "results"):
                maybe_items = payload.get(key)
                if isinstance(maybe_items, list):
                    raw_items = maybe_items
                    break

    assets: list[GeneratedImageAsset] = []
    for item in raw_items:
        if isinstance(item, str) and item.strip():
            assets.append(GeneratedImageAsset(url=item.strip()))
            continue
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or item.get("image_url") or item.get("imageUrl") or "").strip()
        b64_json = str(item.get("b64_json") or item.get("image_base64") or item.get("base64") or "").strip()
        revised_prompt = str(item.get("revised_prompt") or item.get("prompt") or "").strip()
        if url or b64_json:
            assets.append(GeneratedImageAsset(url=url, b64_json=b64_json, revised_prompt=revised_prompt))
    return assets


async def generate_seedream_images(
    *,
    api_key: str,
    provider: str = "SEEDREAM",
    api_endpoint: str | None,
    model_name: str | None,
    prompt: str,
    count: int = 1,
    size: str = DEFAULT_IMAGE_SIZE,
    user: str = "ai-commerce-assistant",
    reference_images: list[str] | None = None,
) -> list[GeneratedImageAsset]:
    endpoint = resolve_image_endpoint(provider, api_endpoint)
    model = resolve_image_model(provider, model_name)
    if not endpoint:
        raise ValueError("请先配置生图 API 端点")
    lower_endpoint = endpoint.strip().lower()
    if (
        lower_endpoint.endswith("/chat/completions")
        or "/responses" in lower_endpoint
        or "/contents/generations/tasks" in lower_endpoint
    ):
        raise ValueError("当前填写的不是生图接口，请在设置里把“人物图 生图模型”的 API 端点改成图片生成地址")

    base_payload: dict[str, Any] = {
        "prompt": prompt.strip(),
        "n": max(1, min(4, int(count))),
        "user": user,
    }
    resolved_size = (size or DEFAULT_IMAGE_SIZE).strip()
    if resolved_size:
        base_payload["size"] = resolved_size
    if model:
        base_payload["model"] = model

    normalized_reference_images = [
        str(item).strip()
        for item in (reference_images or [])
        if isinstance(item, str) and str(item).strip()
    ][:4]
    if len(normalized_reference_images) == 1:
        base_payload["image"] = normalized_reference_images[0]
    elif len(normalized_reference_images) > 1:
        base_payload["image"] = normalized_reference_images

    payload_variants: list[dict[str, Any]] = [
        {**base_payload, "response_format": "b64_json"},
        {**base_payload, "response_format": "url"},
        {**base_payload},
    ]

    last_error = "图片生成失败"
    timeout = httpx.Timeout(90.0, connect=20.0)
    for payload in payload_variants:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                    response = await client.post(
                        endpoint,
                        headers={
                            "Authorization": f"Bearer {api_key.strip()}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )

                if response.status_code >= 400:
                    try:
                        error_body = response.json()
                    except Exception:
                        error_body = response.text
                    message = _extract_error_message(error_body) or f"图片生成失败（HTTP {response.status_code}）"
                    last_error = _normalize_image_generation_error_message(message, endpoint)
                    if response.status_code >= 500 and attempt < MAX_RETRIES:
                        continue
                    if response.status_code < 500:
                        break
                    raise ValueError(last_error)

                data = response.json()
                assets = _parse_image_items(data)
                if assets:
                    return assets
                last_error = "图片生成成功，但未返回图片结果"
                break
            except httpx.TimeoutException:
                last_error = f"图片生成超时，第 {attempt} 次尝试失败"
                if attempt >= MAX_RETRIES:
                    break
            except httpx.HTTPError as error:
                last_error = str(error) or "图片生成请求失败"
                if attempt >= MAX_RETRIES:
                    break
            except ValueError:
                raise

    if "超时" in last_error:
        raise ValueError("图片生成超时，请稍后重试") from None
    raise ValueError(last_error)


def decode_generated_image_b64(value: str) -> bytes:
    return base64.b64decode(value)
