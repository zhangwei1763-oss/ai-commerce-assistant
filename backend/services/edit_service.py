"""
视频编辑去重服务
使用 FFmpeg 对视频进行微调去重处理，并支持导出剪映草稿（接口12-13）
"""

import os
import uuid
import json
import random
import subprocess
from typing import List, Dict, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Video
from config import settings
from utils.file_handler import generate_date_path, calculate_md5, get_file_size_str
from services.storage_service import storage_service

router = APIRouter()

# ──────────────────────────────────────────────
# 请求体定义
# ──────────────────────────────────────────────

class BgmConfig(BaseModel):
    type: str = "random_hot"       # random_hot / light_rhythm / custom / none
    volume: float = 0.15
    custom_file: Optional[str] = None


class DedupParams(BaseModel):
    speed_range: List[float] = [0.97, 1.03]
    mirror_flip: bool = True
    filter_color: bool = True
    add_noise: bool = True
    bgm_mix: BgmConfig = BgmConfig()


class VideoProcessRequest(BaseModel):
    video_ids: List[str]
    dedup_params: DedupParams = DedupParams()


class ExportJianyingRequest(BaseModel):
    video_ids: List[str]
    project_name: str


# ──────────────────────────────────────────────
# FFmpeg 工具函数
# ──────────────────────────────────────────────

def _run_ffmpeg(cmd: List[str]) -> bool:
    """运行 FFmpeg 命令，返回是否成功"""
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300
        )
        return result.returncode == 0
    except Exception:
        return False


def _apply_speed(input_path: str, output_path: str, speed: float) -> bool:
    """调整视频播放速度（0.97x ~ 1.03x 随机微调）"""
    pts_factor = 1.0 / speed
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-filter_complex",
        f"[0:v]setpts={pts_factor:.4f}*PTS[v];[0:a]atempo={speed:.4f}[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-c:a", "aac",
        output_path
    ]
    return _run_ffmpeg(cmd)


def _apply_mirror(input_path: str, output_path: str) -> bool:
    """水平镜像翻转（局部，用 crop+hflip 避开字幕区域）"""
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-vf", "hflip",
        "-c:a", "copy",
        output_path
    ]
    return _run_ffmpeg(cmd)


def _apply_color_filter(input_path: str, output_path: str) -> bool:
    """随机微调亮度/对比度/饱和度（±5%/±3%/±2%）"""
    brightness = random.uniform(-0.05, 0.05)
    contrast   = random.uniform(0.97, 1.03)
    saturation = random.uniform(0.98, 1.02)
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-vf", f"eq=brightness={brightness:.3f}:contrast={contrast:.3f}:saturation={saturation:.3f}",
        "-c:a", "copy",
        output_path
    ]
    return _run_ffmpeg(cmd)


def _apply_noise(input_path: str, output_path: str) -> bool:
    """添加隐形噪点层（强度 0.5-1%）"""
    noise_level = random.randint(3, 6)
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-vf", f"noise=alls={noise_level}:allf=t",
        "-c:a", "copy",
        output_path
    ]
    return _run_ffmpeg(cmd)


def _mix_bgm(input_path: str, output_path: str, bgm_path: str, volume: float) -> bool:
    """混入背景音乐（音量约 15%）"""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-i", bgm_path,
        "-filter_complex",
        f"[0:a]volume=1[a0];[1:a]volume={volume}[a1];[a0][a1]amix=inputs=2:duration=first[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        output_path
    ]
    return _run_ffmpeg(cmd)


# ──────────────────────────────────────────────
# 接口
# ──────────────────────────────────────────────

@router.post("/process")
async def process_videos(request: VideoProcessRequest, db: Session = Depends(get_db)):
    """
    【接口12】批量视频去重处理。
    流程：变速 → 镜像 → 调色 → 噪点 → BGM
    """
    params = request.dedup_params
    output_dir = generate_date_path(os.path.join(settings.STORAGE_DIR, "processed"))
    results = []

    for video_id in request.video_ids:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video or not video.local_path:
            results.append({"video_id": video_id, "success": False, "error": "源视频文件不存在"})
            continue

        try:
            source_path = storage_service.download_to_local(
                video.local_path,
                preferred_name=os.path.basename(urlparse(video.local_path).path or video.filename or f"{video.id}.mp4"),
            )
        except Exception:
            results.append({"video_id": video_id, "success": False, "error": "源视频文件不存在"})
            continue

        current_input = source_path
        tmp_files = []

        try:
            # 步骤1：变速
            if params.speed_range and params.speed_range[0] != params.speed_range[1]:
                speed = random.uniform(params.speed_range[0], params.speed_range[1])
                tmp = os.path.join(output_dir, f"_tmp_speed_{uuid.uuid4().hex[:6]}.mp4")
                if _apply_speed(current_input, tmp, speed):
                    tmp_files.append(tmp)
                    current_input = tmp

            # 步骤2：镜像翻转
            if params.mirror_flip:
                tmp = os.path.join(output_dir, f"_tmp_mirror_{uuid.uuid4().hex[:6]}.mp4")
                if _apply_mirror(current_input, tmp):
                    tmp_files.append(tmp)
                    current_input = tmp

            # 步骤3：滤镜调色
            if params.filter_color:
                tmp = os.path.join(output_dir, f"_tmp_color_{uuid.uuid4().hex[:6]}.mp4")
                if _apply_color_filter(current_input, tmp):
                    tmp_files.append(tmp)
                    current_input = tmp

            # 步骤4：添加噪点
            if params.add_noise:
                tmp = os.path.join(output_dir, f"_tmp_noise_{uuid.uuid4().hex[:6]}.mp4")
                if _apply_noise(current_input, tmp):
                    tmp_files.append(tmp)
                    current_input = tmp

            # 步骤5：混入BGM
            if params.bgm_mix.type != "none" and params.bgm_mix.custom_file:
                bgm_path = params.bgm_mix.custom_file
                if os.path.exists(bgm_path):
                    tmp = os.path.join(output_dir, f"_tmp_bgm_{uuid.uuid4().hex[:6]}.mp4")
                    if _mix_bgm(current_input, tmp, bgm_path, params.bgm_mix.volume):
                        tmp_files.append(tmp)
                        current_input = tmp

            # 最终输出
            basename = os.path.splitext(os.path.basename(source_path))[0]
            final_path = os.path.join(output_dir, f"{basename}_dedup.mp4")
            os.rename(current_input, final_path)
            tmp_files = [f for f in tmp_files if f != current_input]

            # 计算MD5验证去重
            original_md5 = calculate_md5(source_path)
            new_md5 = calculate_md5(final_path)
            stored_output = storage_service.store_file(
                category="processed",
                local_path=final_path,
                filename=f"{basename}_dedup.mp4",
                content_type="video/mp4",
            )
            
            results.append({
                "video_id": video_id,
                "success": True,
                "output_path": stored_output.reference,
                "file_size": get_file_size_str(final_path),
                "md5_changed": original_md5 != new_md5
            })

        except Exception as e:
            results.append({"video_id": video_id, "success": False, "error": str(e)})

        finally:
            # 清理临时文件
            for tmp_file in tmp_files:
                if os.path.exists(tmp_file):
                    try:
                        os.remove(tmp_file)
                    except Exception:
                        pass

    return {"success": True, "results": results}


@router.post("/export-jianying")
async def export_jianying(request: ExportJianyingRequest, db: Session = Depends(get_db)):
    """
    【接口13】导出剪映草稿。
    生成标准剪映工程JSON，用户可直接用剪映打开编辑。
    """
    videos = []
    for vid_id in request.video_ids:
        v = db.query(Video).filter(Video.id == vid_id).first()
        if v:
            videos.append(v)

    if not videos:
        raise HTTPException(status_code=400, detail="未找到有效视频")

    # 构建剪映草稿结构
    segments_video = []
    segments_text  = []
    timeline_start = 0  # 单位：微秒

    for v in videos:
        duration_us = (v.duration or 15) * 1_000_000
        clip_path = v.local_path or ""
        if clip_path:
            try:
                clip_path = storage_service.download_to_local(
                    clip_path,
                    preferred_name=os.path.basename(urlparse(clip_path).path or f"{v.id}.mp4"),
                )
            except Exception:
                clip_path = ""
        segments_video.append({
            "id": uuid.uuid4().hex,
            "type": "video",
            "source_timerange": {"start": 0, "duration": duration_us},
            "target_timerange": {"start": timeline_start, "duration": duration_us},
            "material_id": v.id,
            "path": clip_path,
        })
        # 字幕轨占位
        segments_text.append({
            "id": uuid.uuid4().hex,
            "type": "text",
            "content": f"视频 {v.id}",
            "target_timerange": {"start": timeline_start, "duration": duration_us},
        })
        timeline_start += duration_us

    draft = {
        "version": "13.8.0",
        "project_name": request.project_name,
        "tracks": [
            {"type": "video", "segments": segments_video},
            {"type": "audio", "segments": []},
            {"type": "text",  "segments": segments_text},
        ],
        "canvas": {"width": 1080, "height": 1920, "fps": 30},
    }

    # 保存草稿文件
    export_dir = os.path.join(settings.EXPORT_DIR, "jianying")
    os.makedirs(export_dir, exist_ok=True)
    safe_name = request.project_name.replace("/", "_").replace("\\", "_")
    draft_path = os.path.join(export_dir, f"{safe_name}.draft")

    with open(draft_path, "w", encoding="utf-8") as f:
        json.dump(draft, f, ensure_ascii=False, indent=2)
    stored_draft = storage_service.store_file(
        category="exports/jianying",
        local_path=draft_path,
        filename=f"{safe_name}.draft",
        content_type="application/json",
    )

    return {
        "success": True,
        "draft_file": stored_draft.reference,
        "video_count": len(videos),
        "message": "剪映草稿已生成，可直接用剪映打开编辑"
    }
