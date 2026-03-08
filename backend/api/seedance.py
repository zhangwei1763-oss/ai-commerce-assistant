"""
Seedance 视频生成 API 封装
统一对接官方异步任务接口，并向上层返回兼容项目当前使用的数据结构。
"""

from __future__ import annotations

import os
from typing import Optional, List, Dict, Any

import httpx

from config import settings
from services.provider_catalog import resolve_video_endpoint, resolve_video_model

DEFAULT_RATIO = "9:16"
DEFAULT_RESOLUTION = "720p"


class SeedanceClient:
    """Seedance 视频生成 API 客户端"""

    def __init__(self):
        self.api_key = settings.SEEDANCE_API_KEY
        self.api_url = settings.SEEDANCE_API_URL

    def _resolve_task_endpoint(self) -> str:
        normalized = resolve_video_endpoint("SEEDANCE", self.api_url).rstrip("/")
        if normalized.endswith("/contents/generations/tasks"):
            return normalized
        return f"{normalized}/contents/generations/tasks"

    def _resolve_model(self) -> str:
        return resolve_video_model("SEEDANCE", "")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _normalize_reference_image(self, reference_images: Optional[Dict[str, List[str]]]) -> str:
        if not reference_images:
            return ""
        for key in ("product", "person"):
            items = reference_images.get(key) or []
            if items:
                return items[0]
        return ""

    async def generate_video(
        self,
        prompt: str,
        style: str = "实景风",
        reference_images: Optional[Dict[str, List[str]]] = None,
        resolution: str = DEFAULT_RESOLUTION,
        fps: int = 30,
        duration: int = 5,
        aspect_ratio: str = DEFAULT_RATIO,
    ) -> dict[str, Any]:
        del fps  # 官方任务接口当前不使用该参数

        task_endpoint = self._resolve_task_endpoint()
        prompt_text = f"{style}，{prompt}".strip("，")
        payload: dict[str, Any] = {
            "model": self._resolve_model(),
            "content": [
                {
                    "type": "text",
                    "text": prompt_text,
                }
            ],
            "resolution": resolution or DEFAULT_RESOLUTION,
            "ratio": aspect_ratio or DEFAULT_RATIO,
            "duration": max(2, min(12, int(duration))),
            "watermark": False,
        }

        reference_image = self._normalize_reference_image(reference_images)
        if reference_image:
            payload["content"].append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": reference_image,
                    },
                }
            )

        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0), follow_redirects=True) as client:
            response = await client.post(task_endpoint, headers=self._headers(), json=payload)
            response.raise_for_status()
            data = response.json()

        return {
            "task_id": data.get("id") or data.get("task_id"),
            "status": "processing",
            "raw": data,
        }

    async def check_status(self, task_id: str) -> dict[str, Any]:
        task_endpoint = self._resolve_task_endpoint()
        status_url = f"{task_endpoint.rstrip('/')}/{task_id}"

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=15.0), follow_redirects=True) as client:
            response = await client.get(status_url, headers=self._headers())
            response.raise_for_status()
            data = response.json()

        raw_status = str(data.get("status") or data.get("state") or "").lower()
        if raw_status.endswith("succeeded") or raw_status in {"success", "succeeded", "completed"}:
            status = "completed"
        elif raw_status.endswith("failed") or raw_status.endswith("expired") or raw_status.endswith("cancelled") or raw_status.endswith("canceled"):
            status = "failed"
        else:
            status = "processing"

        content = data.get("content") or {}
        video_url = ""
        if isinstance(content, dict):
            video_url = str(content.get("video_url") or content.get("videoUrl") or "").strip()

        return {
            "task_id": task_id,
            "status": status,
            "progress": 100 if status == "completed" else 50,
            "video_url": video_url,
            "raw": data,
        }

    async def download_video(self, video_url: str, save_path: str) -> str:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0), follow_redirects=True) as client:
            response = await client.get(video_url)
            response.raise_for_status()

        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, "wb") as file_obj:
            file_obj.write(response.content)

        return save_path


seedance_client = SeedanceClient()
