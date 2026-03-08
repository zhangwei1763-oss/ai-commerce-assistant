"""
AI 提供商目录
统一管理文本/视频能力的 provider 标识、默认端点与默认模型。
"""

from __future__ import annotations

from typing import Literal

from config import settings

Capability = Literal["text", "video"]

TEXT_PROVIDER_DEFAULT_ENDPOINTS: dict[str, str] = {
    "DOUBAO": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    "SILICONFLOW": "https://api.siliconflow.cn/v1/chat/completions",
    "ALIYUN_BAILIAN": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    "OPENAI": "https://api.openai.com/v1/chat/completions",
    "DEEPSEEK": "https://api.deepseek.com/chat/completions",
    "CUSTOM_TEXT": "",
    "GEMINI": "",
}

TEXT_PROVIDER_DEFAULT_MODELS: dict[str, str] = {
    "DOUBAO": "",
    "SILICONFLOW": "Qwen/Qwen2.5-72B-Instruct",
    "ALIYUN_BAILIAN": "qwen-plus",
    "OPENAI": "gpt-4.1-mini",
    "DEEPSEEK": "deepseek-chat",
    "CUSTOM_TEXT": "",
    "GEMINI": "",
}

VIDEO_PROVIDER_DEFAULT_ENDPOINTS: dict[str, str] = {
    "SEEDANCE": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    "CUSTOM_VIDEO": "",
}

VIDEO_PROVIDER_DEFAULT_MODELS: dict[str, str] = {
    "SEEDANCE": "doubao-seedance-1-0-lite-i2v-250428",
    "CUSTOM_VIDEO": "",
}

TEXT_PROVIDER_IDS = set(TEXT_PROVIDER_DEFAULT_ENDPOINTS.keys())
VIDEO_PROVIDER_IDS = set(VIDEO_PROVIDER_DEFAULT_ENDPOINTS.keys())


def is_text_provider(provider: str | None) -> bool:
    return (provider or "").strip().upper() in TEXT_PROVIDER_IDS


def is_video_provider(provider: str | None) -> bool:
    return (provider or "").strip().upper() in VIDEO_PROVIDER_IDS


def normalize_provider(provider: str | None, capability: Capability) -> str:
    normalized = (provider or "").strip().upper()
    if capability == "text":
        return normalized if normalized in TEXT_PROVIDER_IDS else "DOUBAO"
    return normalized if normalized in VIDEO_PROVIDER_IDS else "SEEDANCE"


def resolve_text_endpoint(provider: str | None, api_endpoint: str | None) -> str:
    explicit = (api_endpoint or "").strip()
    if explicit:
        return explicit
    normalized = normalize_provider(provider, "text")
    return TEXT_PROVIDER_DEFAULT_ENDPOINTS.get(normalized, "")


def resolve_text_model(provider: str | None, model_name: str | None) -> str:
    explicit = (model_name or "").strip()
    if explicit:
        return explicit

    normalized = normalize_provider(provider, "text")
    if normalized == "DOUBAO":
        return (
            settings.ARK_TEXT_MODEL.strip()
            or settings.ARK_MODEL.strip()
            or settings.DOUBAO_MODEL.strip()
        )
    return TEXT_PROVIDER_DEFAULT_MODELS.get(normalized, "")


def resolve_video_endpoint(provider: str | None, api_endpoint: str | None) -> str:
    explicit = (api_endpoint or "").strip()
    if explicit:
        return explicit
    normalized = normalize_provider(provider, "video")
    return VIDEO_PROVIDER_DEFAULT_ENDPOINTS.get(normalized, "")


def resolve_video_model(provider: str | None, model_name: str | None) -> str:
    explicit = (model_name or "").strip()
    if explicit:
        return explicit

    normalized = normalize_provider(provider, "video")
    if normalized == "SEEDANCE":
        return settings.ARK_VIDEO_MODEL.strip() or settings.ARK_MODEL.strip() or VIDEO_PROVIDER_DEFAULT_MODELS["SEEDANCE"]
    return VIDEO_PROVIDER_DEFAULT_MODELS.get(normalized, "")
