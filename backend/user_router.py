"""
用户路由模块
处理用户 API Key 管理等请求
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth.dependencies import get_current_user
from services.apikey_service import ApiKeyService

router = APIRouter(prefix="/api/user", tags=["用户"])


# ---- 请求/响应模型 ----
class CreateApiKeyRequest(BaseModel):
    """创建 API Key 请求"""
    provider: str = Field(..., description="API 提供商：GEMINI, DOUBAO, SEEDANCE")
    api_key: str = Field(..., description="API Key")
    api_endpoint: str = Field("", description="API 端点（可选）")
    model_name: str = Field("", description="模型名称（可选）")


class ApiKeyResponse(BaseModel):
    """API Key 响应"""
    id: str
    provider: str
    api_key: str
    api_endpoint: str
    model_name: str
    is_active: bool
    created_at: str
    updated_at: str


# ---- API 端点 ----
@router.get("/apikeys", response_model=List[ApiKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    获取用户的所有 API Keys

    需要认证：Bearer Token
    """
    keys = ApiKeyService.get_user_api_keys(db, current_user.id)
    return [ApiKeyResponse(**ApiKeyService.decrypt_api_key_obj(key)) for key in keys]


@router.post("/apikeys", response_model=ApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_api_key(
    request: CreateApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    创建或更新 API Key

    - 如果已存在相同 provider 的 key，则更新
    - 如果不存在，则创建新的

    需要认证：Bearer Token
    """
    key = ApiKeyService.create_api_key(
        db=db,
        user_id=current_user.id,
        provider=request.provider.upper(),
        api_key=request.api_key,
        api_endpoint=request.api_endpoint or None,
        model_name=request.model_name or None
    )
    return ApiKeyResponse(**ApiKeyService.decrypt_api_key_obj(key))


@router.delete("/apikeys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    删除 API Key

    需要认证：Bearer Token
    """
    success = ApiKeyService.delete_api_key(db, key_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key 不存在"
        )
    return None


@router.get("/profile")
async def get_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    获取用户资料

    需要认证：Bearer Token
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "is_active": current_user.is_active,
        "is_admin": current_user.is_admin,
        "created_at": current_user.created_at.isoformat(),
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None
    }
