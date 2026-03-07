"""
文件处理工具模块
提供文件存储、路径管理、MD5计算等通用工具函数。
"""

import os
import hashlib
import shutil
import re
from datetime import datetime
from config import settings


def generate_date_path(base_dir: str) -> str:
    """
    基于当前日期生成存储子目录，如 /videos/2025/02/25/
    自动创建目录。
    """
    now = datetime.now()
    date_path = os.path.join(base_dir, now.strftime("%Y/%m/%d"))
    os.makedirs(date_path, exist_ok=True)
    return date_path


def calculate_md5(file_path: str) -> str:
    """计算文件的MD5值，用于去重校验"""
    md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            md5.update(chunk)
    return md5.hexdigest()


def get_file_size_str(file_path: str) -> str:
    """获取友好的文件大小字符串，如 '5.2MB'"""
    size_bytes = os.path.getsize(file_path)
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f}MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f}GB"


def safe_filename(name: str) -> str:
    """
    将字符串转为安全文件名。
    保留中文、字母、数字和下划线，移除其他特殊字符。
    """
    cleaned = re.sub(r'[^\w\u4e00-\u9fff\-]', '_', name)
    cleaned = re.sub(r'_+', '_', cleaned)
    return cleaned.strip('_')


def ensure_dir(dir_path: str):
    """确保目录存在，不存在则创建"""
    os.makedirs(dir_path, exist_ok=True)


def copy_file(src: str, dst: str) -> str:
    """复制文件，自动创建目标目录"""
    ensure_dir(os.path.dirname(dst))
    shutil.copy2(src, dst)
    return dst
