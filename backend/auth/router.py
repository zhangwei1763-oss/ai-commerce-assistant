"""
认证路由。
当前仅保留卡密登录、获取当前用户和登出。
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from auth.security import create_access_token
from config import settings
from database import get_db
from models import User
from services.license_key_service import activate_card_login, get_license_for_user, mask_card_key

router = APIRouter(prefix="/api/auth", tags=["认证"])


class CardLoginRequest(BaseModel):
    card_key: str = Field(..., min_length=4, max_length=64)


class UserResponse(BaseModel):
    id: str
    email: str
    username: str | None = None
    display_name: str | None = None
    is_active: bool
    is_admin: bool
    license_key_masked: str | None = None
    license_key_name: str | None = None
    license_expires_at: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


def build_user_response(user: User, license_key=None) -> UserResponse:
    display_name = user.username or (license_key.name if license_key else None)
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=display_name,
        is_active=user.is_active,
        is_admin=user.is_admin,
        license_key_masked=mask_card_key(license_key.card_key) if license_key else None,
        license_key_name=license_key.name if license_key else None,
        license_expires_at=license_key.expires_at.isoformat() if license_key and license_key.expires_at else None,
    )


@router.post("/card-login", response_model=TokenResponse)
async def card_login(
    request: CardLoginRequest,
    db: Session = Depends(get_db),
):
    try:
        user, license_key = activate_card_login(db, request.card_key)
    except LookupError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except PermissionError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error

    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return TokenResponse(
        access_token=access_token,
        user=build_user_response(user, license_key),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_user_response(current_user, get_license_for_user(db, current_user.id))


@router.post("/logout")
async def logout():
    return {"message": "登出成功"}
