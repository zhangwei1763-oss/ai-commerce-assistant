"""
图片处理工具模块
提供Base64解码、缩略图生成、关键帧提取等功能。
"""

import os
import base64
import uuid
from datetime import datetime
from typing import Optional, List

from config import settings
from utils.file_handler import ensure_dir


def decode_base64_image(base64_data: str, save_dir: Optional[str] = None) -> str:
    """
    将Base64编码的图片解码并保存到本地。

    参数:
        base64_data: Base64编码的图片数据（可带 data:image/xxx;base64, 前缀）
        save_dir: 保存目录，默认使用配置中的图片目录

    返回:
        保存后的本地文件路径
    """
    if save_dir is None:
        save_dir = settings.IMAGE_DIR

    ensure_dir(save_dir)

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
    file_path = os.path.join(save_dir, filename)

    # 解码并保存
    image_bytes = base64.b64decode(base64_data)
    with open(file_path, "wb") as f:
        f.write(image_bytes)

    return file_path


def generate_thumbnail(video_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    从视频中提取第一帧作为缩略图。
    依赖 OpenCV。

    参数:
        video_path: 视频文件路径
        output_dir: 缩略图保存目录

    返回:
        缩略图路径，失败返回 None
    """
    try:
        import cv2
    except ImportError:
        return None

    if output_dir is None:
        output_dir = os.path.join(settings.STORAGE_DIR, "thumbnails")

    ensure_dir(output_dir)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    ret, frame = cap.read()
    cap.release()

    if not ret:
        return None

    # 生成缩略图路径（与视频同名 .jpg）
    video_basename = os.path.splitext(os.path.basename(video_path))[0]
    thumb_path = os.path.join(output_dir, f"{video_basename}_thumb.jpg")

    cv2.imwrite(thumb_path, frame)
    return thumb_path


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
    ensure_dir(output_dir)

    keyframe_paths = []
    video_basename = os.path.splitext(os.path.basename(video_path))[0]

    for idx, pos in enumerate(frame_positions):
        cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
        ret, frame = cap.read()
        if ret:
            path = os.path.join(output_dir, f"{video_basename}_kf{idx}.jpg")
            cv2.imwrite(path, frame)
            keyframe_paths.append(path)

    cap.release()
    return keyframe_paths


def image_to_base64(image_path: str) -> str:
    """将本地图片转为Base64字符串"""
    with open(image_path, "rb") as f:
        data = f.read()
    ext = os.path.splitext(image_path)[1].lstrip(".")
    if ext == "jpg":
        ext = "jpeg"
    return f"data:image/{ext};base64,{base64.b64encode(data).decode()}"
