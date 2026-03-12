"""
第 3 步首帧图生成服务。
根据视频脚本和参考图调用生图模型，并把结果落到当前存储后端。
"""

from __future__ import annotations

import os
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.volcengine_image import decode_generated_image_b64, generate_seedream_images
from auth.dependencies import get_optional_user
from models import User
from services.storage_service import storage_service

router = APIRouter()


class FrameImageGenerateRequest(BaseModel):
    apiKey: str = ""
    provider: str = "SEEDREAM"
    apiEndpoint: str = ""
    modelName: str = ""
    prompt: str = ""
    scriptTitle: str = ""
    referenceImages: list[str] = Field(default_factory=list)


async def _download_image_bytes(source: str) -> bytes:
    if source.startswith("/storage/"):
        local_path = storage_service.download_to_local(source, preferred_name=f"frame_{uuid4().hex[:8]}.png")
        with open(local_path, "rb") as file_obj:
            return file_obj.read()

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True) as client:
        response = await client.get(source)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"生成结果下载失败（HTTP {response.status_code}）")
    return response.content


def _store_frame_bytes(data: bytes, owner_prefix: str) -> str:
    stored = storage_service.store_bytes(
        category="frame-images",
        filename=f"{owner_prefix}_{uuid4().hex[:8]}.png",
        data=data,
        content_type="image/png",
    )
    return stored.public_url


@router.post("/generate-frame-image")
async def generate_frame_image(
    request: FrameImageGenerateRequest,
    current_user: User | None = Depends(get_optional_user),
):
    api_key = request.apiKey.strip()
    prompt = request.prompt.strip()
    model_name = request.modelName.strip()
    reference_images = [
        item.strip()
        for item in request.referenceImages
        if isinstance(item, str) and item.strip()
    ][:4]

    if not api_key:
        raise HTTPException(status_code=400, detail="缺少生图 API Key")
    if not model_name:
        raise HTTPException(status_code=400, detail="缺少生图模型名称")
    if not prompt:
        raise HTTPException(status_code=400, detail="缺少首帧图提示词")
    if not reference_images:
        raise HTTPException(status_code=400, detail="请至少提供一张人物图或产品图作为参考")

    try:
        assets = await generate_seedream_images(
            api_key=api_key,
            provider=request.provider,
            api_endpoint=request.apiEndpoint,
            model_name=model_name,
            prompt=prompt,
            count=1,
            user=current_user.id if current_user else "ai-commerce-assistant",
            reference_images=reference_images,
        )
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    first_asset = assets[0] if assets else None
    if first_asset is None:
        raise HTTPException(status_code=502, detail="首帧图生成成功，但未返回图片")

    if first_asset.b64_json:
        data = decode_generated_image_b64(first_asset.b64_json)
    elif first_asset.url:
        data = await _download_image_bytes(first_asset.url)
    else:
        raise HTTPException(status_code=502, detail="首帧图生成成功，但未返回可用图片")

    owner_prefix = current_user.id if current_user else "frame"
    image_url = _store_frame_bytes(data, owner_prefix)

    return {
        "ok": True,
        "imageUrl": image_url,
        "revisedPrompt": first_asset.revised_prompt or "",
        "prompt": prompt,
        "provider": request.provider.strip(),
        "scriptTitle": request.scriptTitle.strip(),
    }
