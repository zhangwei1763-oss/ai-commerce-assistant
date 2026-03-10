"""
视频生成服务 - 兼容前端当前调用格式
使用官方异步任务 API 创建视频任务、查询状态，并在完成后下载结果到本地存储。
"""

from __future__ import annotations

import base64
import os
import uuid
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.provider_catalog import resolve_video_endpoint, resolve_video_model
from services.storage_service import storage_service
from utils.image_handler import decode_base64_image, image_to_base64

router = APIRouter()

DEFAULT_RATIO = "9:16"
DEFAULT_RESOLUTION = "720p"
DEFAULT_DURATION_SECONDS = 5
MIN_DURATION_SECONDS = 2
MAX_DURATION_SECONDS = 12
COMPOSITE_REFERENCE_HEIGHT = 960
COMPOSITE_REFERENCE_WIDTH = 1728
COMPOSITE_PADDING = 48


class VideoGenerateRequest(BaseModel):
    apiKey: str
    prompt: str
    style: str
    imageUrl: str = ""
    characterImageUrl: str = ""
    productImageUrl: str = ""
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


def _build_reference_instruction(has_character: bool, has_product: bool) -> str:
    if has_character and has_product:
        return (
            "参考图是一张组合参考图：左侧为人物参考，右侧为产品参考。"
            "这张组合参考图只用于识别人物与产品，不是视频画面本身。"
            "禁止生成任何拼接图、分屏、左右并列展示板、白底参考板、边框、标签文字、海报排版或把参考图直接当成首帧。"
            "视频首帧必须直接进入真实带货场景：使用左侧人物参考对应的人物形象，自然手持右侧产品参考对应的产品出镜，"
            "镜头以真实半身或近景开始，让人物和产品处于正常拍摄关系中。"
            "请严格保持左侧人物的脸型、发型、服装、主播气质一致；同时严格保持右侧产品的外观、包装、颜色、材质一致。"
        )
    if has_character:
        return (
            "参考图是人物参考图。视频首帧直接进入真实带货场景，不要出现参考板或静态海报。"
            "请严格保持人物脸型、发型、服装和主播气质一致。"
        )
    if has_product:
        return (
            "参考图是产品参考图。视频首帧直接进入真实产品展示场景，不要出现参考板或静态海报。"
            "请严格保持产品外观、包装、颜色和材质一致。"
        )
    return ""


def _build_generation_prompt(prompt: str, style: str, *, has_character: bool, has_product: bool) -> str:
    prompt_text = prompt.strip()
    style_text = style.strip()
    reference_text = _build_reference_instruction(has_character, has_product)
    parts = [part for part in (reference_text, style_text, prompt_text) if part]
    return " ".join(parts) or "商品展示视频"


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
    if raw_value.startswith("data:image/"):
        return raw_value
    current_host = urlparse(str(request.base_url)).netloc
    if raw_value.startswith("http://") or raw_value.startswith("https://"):
        parsed = urlparse(raw_value)
        if parsed.netloc == current_host or parsed.hostname in {"127.0.0.1", "localhost", "0.0.0.0"}:
            return image_to_base64(raw_value)
        return raw_value
    if raw_value.startswith("/"):
        return image_to_base64(raw_value)
    try:
        stored_reference = decode_base64_image(raw_value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"参考图片处理失败: {exc}") from exc
    return image_to_base64(stored_reference)


def _collect_reference_images(
    request: Request,
    *,
    character_image_url: str,
    product_image_url: str,
    fallback_image_url: str,
) -> list[tuple[str, str]]:
    references: list[tuple[str, str]] = []

    if character_image_url.strip():
        references.append(("character", _prepare_reference_image(request, character_image_url)))

    if product_image_url.strip():
        references.append(("product", _prepare_reference_image(request, product_image_url)))
    elif not references and fallback_image_url.strip():
        references.append(("product", _prepare_reference_image(request, fallback_image_url)))

    return references


def _read_image_from_source(source: str):
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="缺少图片处理依赖，无法合成参考图") from exc

    if source.startswith("data:image/"):
        try:
            _, payload = source.split(",", 1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="参考图片数据格式无效") from exc
        buffer = base64.b64decode(payload)
    else:
        local_path = storage_service.download_to_local(source, preferred_name=f"reference_{uuid.uuid4().hex[:8]}.png")
        with open(local_path, "rb") as file_obj:
            buffer = file_obj.read()
    image = cv2.imdecode(np.frombuffer(buffer, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="参考图片读取失败，请更换图片后重试")
    return cv2, image


def _fit_reference_image(image, *, target_width: int, target_height: int):
    import cv2

    height, width = image.shape[:2]
    if height <= 0 or width <= 0:
        raise HTTPException(status_code=400, detail="参考图片尺寸无效")

    scale = min(target_width / width, target_height / height)
    new_width = max(1, int(width * scale))
    new_height = max(1, int(height * scale))
    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)

    canvas = cv2.copyMakeBorder(
        resized,
        top=(target_height - new_height) // 2,
        bottom=target_height - new_height - ((target_height - new_height) // 2),
        left=(target_width - new_width) // 2,
        right=target_width - new_width - ((target_width - new_width) // 2),
        borderType=cv2.BORDER_CONSTANT,
        value=(250, 250, 250),
    )
    return canvas


def _compose_dual_reference(character_source: str, product_source: str) -> str:
    cv2, character_image = _read_image_from_source(character_source)
    _, product_image = _read_image_from_source(product_source)

    content_width = (COMPOSITE_REFERENCE_WIDTH - COMPOSITE_PADDING * 3) // 2
    content_height = COMPOSITE_REFERENCE_HEIGHT - COMPOSITE_PADDING * 2

    left_image = _fit_reference_image(
        character_image,
        target_width=content_width,
        target_height=content_height,
    )
    right_image = _fit_reference_image(
        product_image,
        target_width=content_width,
        target_height=content_height,
    )

    canvas = cv2.copyMakeBorder(
        left_image,
        top=COMPOSITE_PADDING,
        bottom=COMPOSITE_PADDING,
        left=COMPOSITE_PADDING,
        right=COMPOSITE_PADDING * 2 + content_width,
        borderType=cv2.BORDER_CONSTANT,
        value=(248, 248, 248),
    )
    canvas[
        COMPOSITE_PADDING:COMPOSITE_PADDING + content_height,
        COMPOSITE_PADDING * 2 + content_width:COMPOSITE_PADDING * 2 + content_width + content_width,
    ] = right_image

    success, encoded = cv2.imencode(".jpg", canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not success:
        raise HTTPException(status_code=500, detail="组合参考图生成失败")
    return f"data:image/jpeg;base64,{base64.b64encode(encoded.tobytes()).decode()}"


def _resolve_video_reference_payload(references: list[tuple[str, str]]) -> list[str]:
    character_reference = next((url for role, url in references if role == "character"), "")
    product_reference = next((url for role, url in references if role == "product"), "")

    if character_reference and product_reference:
        return [_compose_dual_reference(character_reference, product_reference)]
    return [url for _, url in references]


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
    image_urls: list[str],
    duration_seconds: int,
) -> dict[str, Any]:
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": prompt,
        },
    ]
    content.extend(
        {
            "type": "image_url",
            "image_url": {
                "url": image_url,
            },
        }
        for image_url in image_urls
    )

    payload = {
        "model": model_name,
        "content": content,
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
    references = _collect_reference_images(
        http_request,
        character_image_url=request.characterImageUrl,
        product_image_url=request.productImageUrl,
        fallback_image_url=request.imageUrl,
    )
    if not references:
        raise HTTPException(status_code=400, detail="请至少提供一张人物图或产品图")

    has_character = any(role == "character" for role, _ in references)
    has_product = any(role == "product" for role, _ in references)
    prompt_text = _build_generation_prompt(
        request.prompt,
        request.style,
        has_character=has_character,
        has_product=has_product,
    )

    remote_task = await _create_remote_task(
        api_key=api_key,
        endpoint=task_endpoint,
        model_name=model_name,
        prompt=prompt_text,
        image_urls=_resolve_video_reference_payload(references),
        duration_seconds=duration_seconds,
    )

    task_id = str(remote_task.get("id") or remote_task.get("task_id"))
    video_tasks[task_id] = {
        "status": "processing",
        "progress": 10,
        "task_endpoint": task_endpoint,
        "model_name": model_name,
        "reference_image_urls": [url for _, url in references],
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
