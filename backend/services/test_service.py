"""
API Key 测试服务
对齐前端当前使用的 Ark 兼容探测逻辑。
"""

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import settings

router = APIRouter()

ApiTestType = Literal["text", "video"]
DEFAULT_TEXT_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/responses"
DEFAULT_VIDEO_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
ARK_MODELS_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/models"
DEFAULT_TEXT_MODEL = "ep-20260225204603-zcqr4"
DEFAULT_VIDEO_MODEL = "ep-20260225204954-4sqgz"
VIDEO_TEST_IMAGE_URL = "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"


class TestKeyRequest(BaseModel):
    type: ApiTestType
    apiKey: str


def get_ark_model(api_type: ApiTestType) -> str:
    if api_type == "text":
        return (
            settings.ARK_TEXT_MODEL.strip()
            or settings.ARK_MODEL.strip()
            or DEFAULT_TEXT_MODEL
        )
    return (
        settings.ARK_VIDEO_MODEL.strip()
        or settings.ARK_MODEL.strip()
        or DEFAULT_VIDEO_MODEL
    )


def get_test_endpoint(api_type: ApiTestType) -> str:
    if api_type == "text":
        return settings.ARK_TEXT_TEST_ENDPOINT.strip() or DEFAULT_TEXT_ENDPOINT
    return settings.ARK_VIDEO_TEST_ENDPOINT.strip() or DEFAULT_VIDEO_ENDPOINT


def build_request_payload(api_type: ApiTestType, model: str) -> dict:
    if api_type == "text":
        return {
            "model": model,
            "max_output_tokens": 10,
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


async def probe_endpoint(api_type: ApiTestType, endpoint: str, api_key: str, model: str) -> dict:
    timeout = httpx.Timeout(30.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=build_request_payload(api_type, model),
            )

        if response.status_code < 400:
            return {"ok": True, "endpoint": endpoint, "model": model, "status": response.status_code}

        error_message = ""
        try:
            error_body = response.json()
            if isinstance(error_body, dict):
                error_obj = error_body.get("error")
                if isinstance(error_obj, dict) and isinstance(error_obj.get("message"), str):
                    error_message = error_obj["message"]
                elif isinstance(error_body.get("message"), str):
                    error_message = error_body["message"]
        except Exception:
            error_message = ""

        if response.status_code == 400 and "model" in error_message.lower():
            auth_probe = await probe_api_key_auth(api_key)
            if auth_probe.get("ok"):
                return {
                    "ok": True,
                    "endpoint": endpoint,
                    "model": model,
                    "status": response.status_code,
                    "warning": f"API Key 可用，但当前模型不可用：{model}",
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
            content={"ok": False, "message": "参数错误：需要 type(text|video) 和 apiKey"},
        )

    model = get_ark_model(request.type)
    endpoint = get_test_endpoint(request.type)
    if not model:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "message": f"未配置 {'ARK_TEXT_MODEL' if request.type == 'text' else 'ARK_VIDEO_MODEL'} 或 ARK_MODEL",
            },
        )
    if not endpoint:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "message": "未配置可用的测试端点"},
        )

    result = await probe_endpoint(request.type, endpoint, api_key, model)
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

    return JSONResponse(
        status_code=502,
        content={
            "ok": False,
            "message": "连接失败：未能连通测试端点",
            "details": [result],
        },
    )
