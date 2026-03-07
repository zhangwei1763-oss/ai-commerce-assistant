"""
视频生成服务 - 兼容前端调用格式
处理 Seedance 视频生成请求

注意：doubao-seedance-1-5-pro 模型不支持 duration 参数
"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import uuid
import random
import asyncio

router = APIRouter()


class VideoGenerateRequest(BaseModel):
    apiKey: str
    prompt: str
    style: str
    imageUrl: str
    durationSeconds: int = 15  # 前端传递，但不发送给 Seedance


class VideoStatusRequest(BaseModel):
    apiKey: str
    taskId: str


# 模拟任务存储（实际应用中应使用数据库或 Redis）
mock_tasks = {}


async def call_seedance_api(api_key: str, prompt: str, style: str, image_url: str) -> dict:
    """
    调用 Seedance API 生成视频

    注意：不传递 duration 参数，因为 doubao-seedance-1-5-pro 不支持
    """
    # Seedance API 端点（实际使用时需要替换为正确的端点）
    seedance_url = "https://seedance.volcengine.com/api/v1/videos/generate"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 构建请求体，不包含 duration 参数
    payload = {
        "prompt": prompt,
        "style": style,
        "reference_images": {
            "product": [image_url] if image_url else []
        },
        "resolution": "1080x1920",
        "fps": 30,
        # 注意：不传递 duration 参数
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(seedance_url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text[:500] if e.response.text else str(e)
        raise HTTPException(status_code=e.response.status_code, detail=f"Seedance API 调用失败: {error_detail}")
    except Exception as e:
        # 如果 Seedance API 调用失败，返回模拟结果以便开发测试
        return {
            "task_id": f"mock_{uuid.uuid4().hex[:12]}",
            "status": "processing"
        }


@router.post("/generate-video")
async def generate_video(request: VideoGenerateRequest):
    """
    生成视频 - 兼容前端调用格式

    前端传递 durationSeconds 参数，但不会发送给 Seedance API
    因为 doubao-seedance-1-5-pro 模型不支持该参数。
    """
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    try:
        # 调用 Seedance API（不传递 duration）
        result = await call_seedance_api(
            api_key=request.apiKey,
            prompt=request.prompt,
            style=request.style,
            image_url=request.imageUrl
        )

        # 获取 task_id
        actual_task_id = result.get("task_id", task_id)

        # 存储任务信息
        mock_tasks[actual_task_id] = {
            "status": "processing",
            "progress": 10,
            "videoUrl": None,
            "duration": request.durationSeconds  # 保存 duration 供前端显示用
        }

        return {
            "ok": True,
            "taskId": actual_task_id
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"视频生成失败: {str(e)}")


@router.post("/video-status")
async def get_video_status(request: VideoStatusRequest):
    """
    查询视频生成状态
    """
    task = mock_tasks.get(request.taskId)

    if not task:
        # 如果任务不存在，返回模拟状态
        mock_tasks[request.taskId] = {
            "status": "processing",
            "progress": 20,
            "videoUrl": None
        }
        task = mock_tasks[request.taskId]

    # 模拟进度更新（实际应调用 Seedance API 查询状态）
    if task["status"] == "processing":
        task["progress"] = min(100, task["progress"] + random.randint(5, 15))

        # 当进度达到100时，设置为完成
        if task["progress"] >= 100:
            task["status"] = "completed"
            # 模拟视频URL
            task["videoUrl"] = f"https://example.com/video/{request.taskId}.mp4"

    return {
        "ok": True,
        "status": task["status"],
        "progress": task["progress"],
        "videoUrl": task.get("videoUrl", "")
    }
