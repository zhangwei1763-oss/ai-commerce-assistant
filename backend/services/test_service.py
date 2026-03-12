"""
API Key 测试服务
支持文案与视频 provider 的端点/模型/鉴权联调测试。
"""

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.provider_catalog import (
    normalize_provider,
    resolve_image_endpoint,
    resolve_image_model,
    resolve_text_endpoint,
    resolve_text_model,
    resolve_video_endpoint,
    resolve_video_model,
)

router = APIRouter()

ApiTestType = Literal["text", "video", "image"]
ARK_MODELS_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/models"
VIDEO_TEST_IMAGE_URL = "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"


class TestKeyRequest(BaseModel):
    type: ApiTestType
    apiKey: str
    provider: str = ""
    apiEndpoint: str = ""
    modelName: str = ""


def extract_error_message(payload: object) -> str:
    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            for key in ("message", "detail", "reason"):
                value = error_obj.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        for key in ("message", "detail", "reason"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return ""


def is_responses_endpoint(endpoint: str) -> bool:
    return "/responses" in endpoint.lower()


def build_request_payload(api_type: ApiTestType, model: str, endpoint: str) -> dict:
    if api_type == "text":
        if is_responses_endpoint(endpoint):
            return {
                "model": model,
                "input": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Hi",
                            }
                        ],
                    }
                ],
            }
        return {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Hi",
                        }
                    ],
                }
            ],
        }

    if api_type == "image":
        return {
            "model": model,
            "prompt": "一个站在直播间里的电商主播形象，半身，写实风格",
            "n": 1,
            "response_format": "url",
        }

    return {
        "model": model,
        "content": [
            {
                "type": "text",
                "text": "无人机以极快速度穿越复杂障碍 --duration 5 --camerafixed false --watermark true",
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": VIDEO_TEST_IMAGE_URL,
                },
            },
        ],
    }


async def probe_api_key_auth(api_key: str) -> dict:
    timeout = httpx.Timeout(15.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                ARK_MODELS_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
            )

        if response.status_code < 400:
            return {"ok": True, "endpoint": ARK_MODELS_ENDPOINT, "status": response.status_code}
        if response.status_code in (401, 403):
            return {
                "ok": False,
                "endpoint": ARK_MODELS_ENDPOINT,
                "status": response.status_code,
                "reason": "API Key 无效或无权限",
            }
        return {
            "ok": False,
            "endpoint": ARK_MODELS_ENDPOINT,
            "status": response.status_code,
            "reason": f"鉴权探测失败，状态码 {response.status_code}",
        }
    except httpx.TimeoutException:
        return {
            "ok": False,
            "endpoint": ARK_MODELS_ENDPOINT,
            "reason": "鉴权探测超时，请检查网络",
        }
    except Exception as error:
        return {
            "ok": False,
            "endpoint": ARK_MODELS_ENDPOINT,
            "reason": str(error) or "鉴权探测失败",
        }


async def probe_endpoint(api_type: ApiTestType, provider: str, endpoint: str, api_key: str, model: str) -> dict:
    timeout = httpx.Timeout(30.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=build_request_payload(api_type, model, endpoint),
            )

        if response.status_code < 400:
            return {"ok": True, "endpoint": endpoint, "model": model, "status": response.status_code}

        try:
            error_body = response.json()
        except Exception:
            error_body = response.text
        error_message = extract_error_message(error_body)

        if response.status_code == 400 and ("model" in error_message.lower() or "image size" in error_message.lower()):
            if provider in {"DOUBAO", "SEEDANCE"} or "ark.cn-beijing.volces.com" in endpoint:
                auth_probe = await probe_api_key_auth(api_key)
                if auth_probe.get("ok"):
                    return {
                        "ok": True,
                        "endpoint": endpoint,
                        "model": model,
                        "status": response.status_code,
                        "warning": (
                            f"API Key 可用，但当前模型不可用：{model}"
                            if "model" in error_message.lower()
                            else "API Key 可用，但测试参数与当前图片模型要求不完全匹配"
                        ),
                    }
            else:
                return {
                    "ok": False,
                    "endpoint": endpoint,
                    "model": model,
                    "status": response.status_code,
                    "reason": f"模型不可用: {model}",
                }
            return {
                "ok": False,
                "endpoint": endpoint,
                "model": model,
                "status": response.status_code,
                "reason": f"模型不可用: {model}",
            }

        if response.status_code in (401, 403):
            return {
                "ok": False,
                "endpoint": endpoint,
                "model": model,
                "status": response.status_code,
                "reason": "API Key 无效或无权限",
            }

        return {
            "ok": False,
            "endpoint": endpoint,
            "model": model,
            "status": response.status_code,
            "reason": error_message or f"接口返回状态码 {response.status_code}",
        }
    except httpx.TimeoutException:
        return {
            "ok": False,
            "endpoint": endpoint,
            "model": model,
            "reason": "请求超时，请检查网络或稍后重试",
        }
    except Exception as error:
        return {
            "ok": False,
            "endpoint": endpoint,
            "model": model,
            "reason": str(error) or "网络请求失败",
        }


@router.post("/test-key")
async def test_api_key(request: TestKeyRequest):
    api_key = request.apiKey.strip()
    if not api_key:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "message": "参数错误：需要 type(text|video|image) 和 apiKey"},
        )

    provider = normalize_provider(request.provider, request.type)
    if request.type == "text":
        model = resolve_text_model(provider, request.modelName)
        endpoint = resolve_text_endpoint(provider, request.apiEndpoint)
    elif request.type == "image":
        model = resolve_image_model(provider, request.modelName)
        endpoint = resolve_image_endpoint(provider, request.apiEndpoint)
    else:
        model = resolve_video_model(provider, request.modelName)
        endpoint = resolve_video_endpoint(provider, request.apiEndpoint)

    if not model:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "message": "请先填写模型名称",
            },
        )
    if not endpoint:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "message": "请先填写可用的 API 端点"},
        )

    result = await probe_endpoint(request.type, provider, endpoint, api_key, model)
    if result.get("ok"):
        warning = result.get("warning")
        message = (
            f"连接成功（{endpoint} / {model}）。{warning}"
            if warning
            else f"连接成功（{endpoint} / {model}）"
        )
        return {"ok": True, "message": message}

    if result.get("status") in (401, 403):
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "message": "连接失败：API Key 无效或无权限",
                "details": [result],
            },
        )

    reason = str(result.get("reason") or "").strip()
    endpoint_hint = str(result.get("endpoint") or endpoint).strip()
    model_hint = str(result.get("model") or model).strip()
    message = "连接失败：未能连通测试端点"
    if reason:
        message = f"连接失败：{reason}"
        if "certificate verify failed" in reason.lower():
            message += "。这通常是本机证书链或网络代理问题"
    if endpoint_hint:
        message += f"（{endpoint_hint}"
        if model_hint:
            message += f" / {model_hint}"
        message += "）"

    return JSONResponse(
        status_code=502,
        content={
            "ok": False,
            "message": message,
            "details": [result],
        },
    )
