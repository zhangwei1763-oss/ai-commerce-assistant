"""
配置管理模块
使用 pydantic-settings 统一管理所有配置项，支持 .env 文件覆盖。
"""

import os
import secrets
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """全局配置"""

    # ---- 豆包API配置 ----
    DOUBAO_API_KEY: str = "your_doubao_api_key"
    DOUBAO_API_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    DOUBAO_MODEL: str = "ep-202502xxxxx"

    # ---- Seedance API配置 ----
    SEEDANCE_API_KEY: str = "your_seedance_api_key"
    SEEDANCE_API_URL: str = "https://api.seedance.com/v1"

    # ---- 文件存储路径 ----
    STORAGE_DIR: str = "./storage"
    VIDEO_DIR: str = "./storage/videos"
    IMAGE_DIR: str = "./storage/images"
    EXPORT_DIR: str = "./storage/exports"

    # ---- 数据库配置 ----
    DATABASE_URL: str = "sqlite:///./ai_douyin_helper.db"

    # ---- CORS跨域配置 ----
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:1420",
        "http://localhost:3000",
    ]

    # ---- JWT 认证配置 ----
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # ---- API Key 加密配置 ----
    # 生产环境应从环境变量读取
    API_KEY_ENCRYPTION_KEY: str = secrets.token_urlsafe(32)

    # ---- 短信服务配置（阿里云） ----
    ALIYUN_ACCESS_KEY_ID: str = ""
    ALIYUN_ACCESS_KEY_SECRET: str = ""
    ALIYUN_SMS_SIGN_NAME: str = ""
    ALIYUN_SMS_TEMPLATE_CODE: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def init_storage_dirs(self):
        """启动时自动创建所有存储目录"""
        for dir_path in [self.STORAGE_DIR, self.VIDEO_DIR, self.IMAGE_DIR, self.EXPORT_DIR]:
            os.makedirs(dir_path, exist_ok=True)


# 全局单例
settings = Settings()
