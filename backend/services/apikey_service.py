"""
API Key 服务模块
处理用户 API Key 的增删改查
"""

from typing import Optional, List
import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models import User, UserApiKey
from auth.security import encrypt_api_key, decrypt_api_key, generate_api_key_id

logger = logging.getLogger(__name__)


class ApiKeyService:
    """API Key 服务类"""

    # 支持的 API 提供商
    VALID_PROVIDERS = [
        "GEMINI",
        "DOUBAO",
        "SILICONFLOW",
        "ALIYUN_BAILIAN",
        "OPENAI",
        "DEEPSEEK",
        "CUSTOM_TEXT",
        "SEEDANCE",
        "CUSTOM_VIDEO",
    ]

    @staticmethod
    def create_api_key(
        db: Session,
        user_id: str,
        provider: str,
        api_key: str,
        api_endpoint: Optional[str] = None,
        model_name: Optional[str] = None
    ) -> UserApiKey:
        """创建新的 API Key"""
        # 验证 provider
        if provider not in ApiKeyService.VALID_PROVIDERS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的提供商，支持的提供商：{', '.join(ApiKeyService.VALID_PROVIDERS)}"
            )

        # 检查是否已存在相同 provider 的 key（一个用户每个 provider 只能有一个 key）
        existing = db.query(UserApiKey).filter(
            UserApiKey.user_id == user_id,
            UserApiKey.provider == provider
        ).first()

        if existing:
            # 更新现有 key
            existing.api_key = encrypt_api_key(api_key)
            existing.api_endpoint = api_endpoint
            existing.model_name = model_name
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return existing

        # 创建新 key
        key = UserApiKey(
            id=generate_api_key_id(),
            user_id=user_id,
            provider=provider,
            api_key=encrypt_api_key(api_key),
            api_endpoint=api_endpoint,
            model_name=model_name,
            is_active=True
        )
        db.add(key)
        db.commit()
        db.refresh(key)
        return key

    @staticmethod
    def get_user_api_keys(db: Session, user_id: str) -> List[UserApiKey]:
        """获取用户的所有 API Key"""
        return db.query(UserApiKey).filter(UserApiKey.user_id == user_id).all()

    @staticmethod
    def get_user_api_key_by_provider(
        db: Session,
        user_id: str,
        provider: str
    ) -> Optional[UserApiKey]:
        """获取用户指定 provider 的 API Key"""
        return db.query(UserApiKey).filter(
            UserApiKey.user_id == user_id,
            UserApiKey.provider == provider,
            UserApiKey.is_active == True
        ).first()

    @staticmethod
    def decrypt_api_key_obj(api_key_obj: UserApiKey) -> dict:
        """解密 API Key 对象用于返回"""
        return {
            "id": api_key_obj.id,
            "provider": api_key_obj.provider,
            "api_key": decrypt_api_key(api_key_obj.api_key),
            "api_endpoint": api_key_obj.api_endpoint or "",
            "model_name": api_key_obj.model_name or "",
            "is_active": api_key_obj.is_active,
            "created_at": api_key_obj.created_at.isoformat(),
            "updated_at": api_key_obj.updated_at.isoformat()
        }

    @staticmethod
    def try_decrypt_api_key_obj(api_key_obj: UserApiKey) -> Optional[dict]:
        """尝试解密 API Key 对象，失败时跳过旧坏数据"""
        try:
            return ApiKeyService.decrypt_api_key_obj(api_key_obj)
        except Exception as exc:
            logger.warning(
                "Failed to decrypt api key %s for user %s: %s",
                api_key_obj.id,
                api_key_obj.user_id,
                exc,
            )
            return None

    @staticmethod
    def delete_api_key(db: Session, key_id: str, user_id: str) -> bool:
        """删除 API Key"""
        key = db.query(UserApiKey).filter(
            UserApiKey.id == key_id,
            UserApiKey.user_id == user_id
        ).first()

        if not key:
            return False

        db.delete(key)
        db.commit()
        return True
