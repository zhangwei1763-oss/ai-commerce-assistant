"""
视频生成服务
处理 Seedance 视频生成、状态轮询和视频列表（接口9-11）
"""

import os
import uuid
import json
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Script, Video
from api.seedance import seedance_client
from config import settings
from utils.file_handler import generate_date_path, get_file_size_str
from utils.image_handler import generate_thumbnail

router = APIRouter()


class VideoGenerateRequest(BaseModel):
    script_ids: List[str]
    visual_style: str = "实景风"
    reference_images: Optional[Dict[str, List[str]]] = None
    output_format: Dict = {"resolution": "1080x1920", "fps": 30, "duration": 15}


@router.post("/generate")
async def generate_videos(request: VideoGenerateRequest, db: Session = Depends(get_db)):
    """
    【接口9】调用 Seedance 批量提交视频生成任务。
    每条脚本对应一个异步任务，返回所有任务ID供前端轮询。
    """
    task_list = []

    for script_id in request.script_ids:
        script = db.query(Script).filter(Script.id == script_id).first()
        if not script:
            continue

        # 拼接画面提示词
        visual_prompts = json.loads(script.visual_prompts) if script.visual_prompts else []
        prompt_text = "\n".join(visual_prompts)

        try:
            # 提交 Seedance 任务
            result = await seedance_client.generate_video(
                prompt=prompt_text,
                style=request.visual_style,
                reference_images=request.reference_images,
                resolution=request.output_format.get("resolution", "1080x1920"),
                fps=request.output_format.get("fps", 30),
                duration=request.output_format.get("duration", 15),
            )
            task_id = result.get("task_id", uuid.uuid4().hex)

        except Exception:
            # 若 Seedance 未配置，使用模拟 task_id 以保证开发可用
            task_id = f"mock_{uuid.uuid4().hex[:12]}"

        # 创建视频记录，初始状态为 pending
        video_id = f"video_{uuid.uuid4().hex[:8]}"
        video = Video(
            id=video_id,
            script_id=script_id,
            product_id=script.product_id,
            seedance_task_id=task_id,
            filename=f"{script_id}_{request.visual_style}_{request.output_format.get('duration', 15)}s.mp4",
            resolution=request.output_format.get("resolution", "1080x1920"),
            duration=request.output_format.get("duration", 15),
            visual_style=request.visual_style,
            status="pending",
            progress=0,
        )
        db.add(video)

        task_list.append({
            "video_id": video_id,
            "script_id": script_id,
            "task_id": task_id,
            "status": "pending"
        })

    db.commit()
    return {
        "success": True,
        "tasks": task_list,
        "total_count": len(task_list)
    }


@router.get("/status/{task_id}")
async def get_video_status(task_id: str, db: Session = Depends(get_db)):
    """
    【接口10】查询视频生成状态并更新数据库。
    前端可每隔5秒轮询该接口，直到状态变为 completed 或 failed。
    """
    video = db.query(Video).filter(Video.seedance_task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="任务未找到")

    # 模拟任务：直接返回当前数据库状态
    if task_id.startswith("mock_"):
        return {
            "task_id": task_id,
            "video_id": video.id,
            "status": video.status,
            "progress": video.progress,
            "video_url": None
        }

    try:
        result = await seedance_client.check_status(task_id)
        status = result.get("status", "pending")
        progress = result.get("progress", 0)
        video_url = result.get("video_url")

        # 更新数据库记录
        video.status = status
        video.progress = progress

        if status == "completed" and video_url:
            # 下载视频到本地
            save_dir = generate_date_path(settings.VIDEO_DIR)
            local_path = os.path.join(save_dir, video.filename)

            downloaded_path = await seedance_client.download_video(video_url, local_path)
            video.local_path = downloaded_path
            video.file_size = get_file_size_str(downloaded_path)

            # 提取缩略图
            thumb_path = generate_thumbnail(downloaded_path)
            if thumb_path:
                video.thumbnail = thumb_path

        db.commit()

        return {
            "task_id": task_id,
            "video_id": video.id,
            "status": status,
            "progress": progress,
            "video_url": video_url,
            "local_path": video.local_path
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"状态查询失败: {str(e)}")


@router.get("/list")
async def list_videos(product_id: str, db: Session = Depends(get_db)):
    """【接口11】获取指定产品下的所有已生成视频"""
    videos = (
        db.query(Video)
        .filter(Video.product_id == product_id)
        .order_by(Video.created_at.desc())
        .all()
    )

    return {
        "success": True,
        "videos": [
            {
                "video_id": v.id,
                "script_id": v.script_id,
                "filename": v.filename,
                "local_path": v.local_path,
                "thumbnail": v.thumbnail,
                "duration": v.duration,
                "resolution": v.resolution,
                "file_size": v.file_size,
                "visual_style": v.visual_style,
                "status": v.status,
                "progress": v.progress,
                "created_at": v.created_at,
            }
            for v in videos
        ]
    }
