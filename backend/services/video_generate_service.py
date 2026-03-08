"""
视频生成服务 - 兼容前端当前调用格式
使用官方异步任务 API 创建视频任务、查询状态，并在完成后下载结果到本地存储。
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.provider_catalog import resolve_video_endpoint, resolve_video_model
from services.storage_service import storage_service
from utils.image_handler import decode_base64_image

router = APIRouter()

DEFAULT_RATIO = "9:16"
DEFAULT_RESOLUTION = "720p"
DEFAULT_DURATION_SECONDS = 5
MIN_DURATION_SECONDS = 2
MAX_DURATION_SECONDS = 12


class VideoGenerateRequest(BaseModel):
    apiKey: str
    prompt: str
    style: str
    imageUrl: str
    durationSeconds: int = Field(default=DEFAULT_DURATION_SECONDS)
    apiEndpoint: str = ""
    modelName: str = ""


class VideoStatusRequest(BaseModel):
    apiKey: str
    taskId: str


video_tasks: dict[str, dict[str, Any]] = {}


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


def _http_error_message(response: httpx.Response, fallback: str) -> str:
    try:
        payload = response.json()
    except Exception:
        payload = response.text
    message = _extract_error_message(payload)
    if message:
        return message
    return f"{fallback}（HTTP {response.status_code}）"


def _resolve_task_endpoint(api_endpoint: str | None) -> str:
    normalized = resolve_video_endpoint("SEEDANCE", api_endpoint).rstrip("/")
    if not normalized:
        raise HTTPException(status_code=400, detail="请先在设置中填写视频 API 端点")
    if normalized.endswith("/contents/generations/tasks"):
        return normalized
    return f"{normalized}/contents/generations/tasks"


def _resolve_video_model(model_name: str | None) -> str:
    resolved = resolve_video_model("SEEDANCE", model_name)
    if not resolved:
        raise HTTPException(status_code=400, detail="请先在设置中填写视频模型名称")
    return resolved


def _normalize_duration(duration_seconds: int) -> int:
    value = duration_seconds if isinstance(duration_seconds, int) else DEFAULT_DURATION_SECONDS
    return max(MIN_DURATION_SECONDS, min(MAX_DURATION_SECONDS, value))


def _build_generation_prompt(prompt: str, style: str) -> str:
    prompt_text = prompt.strip()
    style_text = style.strip()
    if style_text and prompt_text:
        return f"{style_text}，{prompt_text}"
    return prompt_text or style_text or "商品展示视频"


def _make_absolute_url(request: Request, value: str) -> str:
    if not value:
        return value
    parsed = urlparse(value)
    if parsed.scheme in ("http", "https"):
        return value
    base = str(request.base_url).rstrip("/")
    path = value if value.startswith("/") else f"/{value}"
    return f"{base}{path}"


def _prepare_reference_image(request: Request, image_url: str) -> str:
    raw_value = image_url.strip()
    if not raw_value:
        raise HTTPException(status_code=400, detail="缺少参考图片")
    if raw_value.startswith("http://") or raw_value.startswith("https://"):
        return raw_value
    try:
        stored_reference = decode_base64_image(raw_value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"参考图片处理失败: {exc}") from exc
    return _make_absolute_url(request, stored_reference)


def _task_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
    }


async def _create_remote_task(
    *,
    api_key: str,
    endpoint: str,
    model_name: str,
    prompt: str,
    image_url: str,
    duration_seconds: int,
) -> dict[str, Any]:
    payload = {
        "model": model_name,
        "content": [
            {
                "type": "text",
                "text": prompt,
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": image_url,
                },
            },
        ],
        "resolution": DEFAULT_RESOLUTION,
        "ratio": DEFAULT_RATIO,
        "duration": duration_seconds,
        "watermark": False,
    }

    timeout = httpx.Timeout(60.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.post(endpoint, headers=_task_headers(api_key), json=payload)

    if response.status_code >= 400:
        message = _http_error_message(response, "视频任务创建失败")
        raise HTTPException(status_code=response.status_code, detail=message)

    data = response.json()
    task_id = data.get("id") or data.get("task_id")
    if not task_id:
        raise HTTPException(status_code=502, detail="视频任务创建成功，但响应中缺少任务 ID")
    return data


async def _query_remote_task(*, api_key: str, task_endpoint: str, task_id: str) -> dict[str, Any]:
    status_endpoint = f"{task_endpoint.rstrip('/')}/{task_id}"
    timeout = httpx.Timeout(30.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(status_endpoint, headers=_task_headers(api_key))

    if response.status_code >= 400:
        message = _http_error_message(response, "视频任务查询失败")
        raise HTTPException(status_code=response.status_code, detail=message)

    return response.json()


def _normalize_remote_status(raw_status: str) -> str:
    normalized = raw_status.strip().lower()
    if not normalized:
        return "processing"
    if normalized.endswith("succeeded") or normalized in {"success", "succeeded", "completed"}:
        return "completed"
    if normalized.endswith("failed") or normalized.endswith("canceled") or normalized.endswith("cancelled"):
        return "failed"
    if normalized.endswith("expired"):
        return "failed"
    return "processing"


def _progress_for_status(task: dict[str, Any], status: str) -> int:
    if status == "completed":
        return 100
    if status == "failed":
        return 0
    task["poll_count"] = int(task.get("poll_count", 0)) + 1
    base_progress = int(task.get("progress", 10))
    next_progress = base_progress + (10 if base_progress < 50 else 6)
    return min(92, max(15, next_progress))


async def _download_video_to_storage(video_url: str, task_id: str) -> str:
    timeout = httpx.Timeout(300.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(video_url)

    if response.status_code >= 400:
        message = _http_error_message(response, "视频结果下载失败")
        raise HTTPException(status_code=502, detail=message)

    ext = os.path.splitext(urlparse(video_url).path)[1] or ".mp4"
    filename = f"seedance_{task_id}{ext}"
    stored = storage_service.store_bytes(
        category="videos",
        filename=filename,
        data=response.content,
        content_type=response.headers.get("content-type") or "video/mp4",
    )
    return stored.reference


@router.post("/generate-video")
async def generate_video(request: VideoGenerateRequest, http_request: Request):
    api_key = request.apiKey.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="请先配置视频 API Key")

    task_endpoint = _resolve_task_endpoint(request.apiEndpoint)
    model_name = _resolve_video_model(request.modelName)
    duration_seconds = _normalize_duration(request.durationSeconds)
    reference_image_url = _prepare_reference_image(http_request, request.imageUrl)
    prompt_text = _build_generation_prompt(request.prompt, request.style)

    remote_task = await _create_remote_task(
        api_key=api_key,
        endpoint=task_endpoint,
        model_name=model_name,
        prompt=prompt_text,
        image_url=reference_image_url,
        duration_seconds=duration_seconds,
    )

    task_id = str(remote_task.get("id") or remote_task.get("task_id"))
    video_tasks[task_id] = {
        "status": "processing",
        "progress": 10,
        "task_endpoint": task_endpoint,
        "model_name": model_name,
        "reference_image_url": reference_image_url,
        "video_url": "",
        "remote_video_url": "",
        "error": "",
        "poll_count": 0,
    }

    return {
        "ok": True,
        "taskId": task_id,
    }


@router.post("/video-status")
async def get_video_status(request: VideoStatusRequest, http_request: Request):
    api_key = request.apiKey.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="请先配置视频 API Key")

    task = video_tasks.get(request.taskId)
    if not task:
        raise HTTPException(status_code=404, detail="视频任务不存在或已失效，请重新生成")

    remote_task = await _query_remote_task(
        api_key=api_key,
        task_endpoint=str(task["task_endpoint"]),
        task_id=request.taskId,
    )

    raw_status = str(remote_task.get("status") or remote_task.get("state") or "")
    status = _normalize_remote_status(raw_status)
    task["status"] = status
    task["progress"] = _progress_for_status(task, status)

    if status == "completed":
        content = remote_task.get("content") or {}
        remote_video_url = ""
        if isinstance(content, dict):
            remote_video_url = str(content.get("video_url") or content.get("videoUrl") or "").strip()
        if not remote_video_url:
            task["status"] = "failed"
            task["error"] = "视频任务已完成，但未返回可下载视频地址"
            return {
                "ok": True,
                "status": "failed",
                "progress": 0,
                "videoUrl": "",
                "error": task["error"],
            }

        if not task.get("video_url"):
            stored_reference = await _download_video_to_storage(remote_video_url, request.taskId)
            task["remote_video_url"] = remote_video_url
            task["video_url"] = _make_absolute_url(http_request, stored_reference)

        return {
            "ok": True,
            "status": "completed",
            "progress": 100,
            "videoUrl": task["video_url"],
        }

    if status == "failed":
        task["error"] = _extract_error_message(remote_task) or "视频生成失败，请检查模型、配额或提示词后重试"
        return {
            "ok": True,
            "status": "failed",
            "progress": 0,
            "videoUrl": "",
            "error": task["error"],
        }

    return {
        "ok": True,
        "status": "processing",
        "progress": int(task["progress"]),
        "videoUrl": "",
    }
