"""
图片处理工具模块
提供Base64解码、缩略图生成、关键帧提取等功能。
"""

import os
import base64
import uuid
from typing import Optional, List

from config import settings
from services.storage_service import storage_service


def decode_base64_image(base64_data: str, save_dir: Optional[str] = None) -> str:
    """
    将Base64编码的图片解码并保存到当前配置的存储后端。

    参数:
        base64_data: Base64编码的图片数据（可带 data:image/xxx;base64, 前缀）
        save_dir: 保存目录，默认使用配置中的图片目录

    返回:
        保存后的存储引用（本地 /storage 路径或 Supabase 公网 URL）
    """
    # 移除 data:image/xxx;base64, 前缀
    if "," in base64_data:
        header, base64_data = base64_data.split(",", 1)
        # 从头部提取扩展名
        if "png" in header:
            ext = "png"
        elif "gif" in header:
            ext = "gif"
        elif "webp" in header:
            ext = "webp"
        else:
            ext = "jpg"
    else:
        ext = "jpg"

    # 生成唯一文件名
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"

    # 解码并保存
    image_bytes = base64.b64decode(base64_data)
    category = storage_service.category_from_local_dir(save_dir) or "images"
    stored = storage_service.store_bytes(
        category=category,
        filename=filename,
        data=image_bytes,
        content_type=f"image/{'jpeg' if ext == 'jpg' else ext}",
    )
    return stored.reference


def generate_thumbnail(video_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    从视频中提取第一帧作为缩略图。
    依赖 OpenCV。

    参数:
        video_path: 视频文件路径
        output_dir: 缩略图保存目录

    返回:
        缩略图存储引用，失败返回 None
    """
    try:
        import cv2
    except ImportError:
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    ret, frame = cap.read()
    cap.release()

    if not ret:
        return None

    # 生成缩略图路径（与视频同名 .jpg）
    video_basename = os.path.splitext(os.path.basename(video_path))[0]
    success, encoded = cv2.imencode(".jpg", frame)
    if not success:
        return None

    category = storage_service.category_from_local_dir(output_dir) or "thumbnails"
    stored = storage_service.store_bytes(
        category=category,
        filename=f"{video_basename}_thumb.jpg",
        data=encoded.tobytes(),
        content_type="image/jpeg",
    )
    return stored.reference


def extract_keyframes(video_path: str, count: int = 5) -> List[str]:
    """
    从视频中均匀提取多个关键帧。

    参数:
        video_path: 视频文件路径
        count: 需要提取的帧数

    返回:
        关键帧图片路径列表
    """
    try:
        import cv2
    except ImportError:
        return []

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        cap.release()
        return []

    # 计算需要捕获的帧位置
    interval = max(total_frames // count, 1)
    frame_positions = [i * interval for i in range(count)]

    output_dir = os.path.join(settings.STORAGE_DIR, "keyframes")
    keyframe_paths = []
    video_basename = os.path.splitext(os.path.basename(video_path))[0]

    for idx, pos in enumerate(frame_positions):
        cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
        ret, frame = cap.read()
        if ret:
            success, encoded = cv2.imencode(".jpg", frame)
            if not success:
                continue
            stored = storage_service.store_bytes(
                category=storage_service.category_from_local_dir(output_dir) or "keyframes",
                filename=f"{video_basename}_kf{idx}.jpg",
                data=encoded.tobytes(),
                content_type="image/jpeg",
            )
            keyframe_paths.append(stored.reference)

    cap.release()
    return keyframe_paths


def image_to_base64(image_path: str) -> str:
    """将本地图片转为Base64字符串"""
    local_path = storage_service.download_to_local(image_path, preferred_name=os.path.basename(image_path))
    with open(local_path, "rb") as f:
        data = f.read()
    ext = os.path.splitext(local_path)[1].lstrip(".")
    if ext == "jpg":
        ext = "jpeg"
    return f"data:image/{ext};base64,{base64.b64encode(data).decode()}"
