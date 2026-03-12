"""
管理员路由。
当前后台聚焦卡密管理，同时保留基础用户管理接口。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.dependencies import get_admin_user
from database import get_db
from models import LicenseKey, User
from services.license_key_service import (
    build_stats,
    generate_license_keys,
    list_license_keys,
    serialize_license_key,
    update_license_key,
)
from services.user_service import UserService

router = APIRouter(prefix="/api/admin", tags=["管理员"])


class UserListResponse(BaseModel):
    id: str
    email: str
    username: str | None = None
    phone: str | None = None
    is_active: bool
    is_admin: bool
    created_at: str
    last_login: str | None = None


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None


class UserStatsResponse(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    new_users_today: int
    total_license_keys: int
    active_license_keys: int
    disabled_license_keys: int
    used_license_keys: int
    expired_license_keys: int


class LicenseKeyResponse(BaseModel):
    id: str
    card_key: str
    masked_card_key: str
    name: str | None = None
    note: str | None = None
    status: str
    duration_days: int | None = None
    expires_at: str | None = None
    activated_at: str | None = None
    last_used_at: str | None = None
    activation_count: int
    is_admin: bool
    bound_user_id: str | None = None
    bound_user_display_name: str | None = None
    created_at: str
    updated_at: str


class GenerateLicenseKeysRequest(BaseModel):
    quantity: int = Field(default=1, ge=1, le=200)
    name_prefix: str | None = None
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    note: str | None = None
    is_admin: bool = False


class UpdateLicenseKeyRequest(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=1000)
    status: str | None = None
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    is_admin: bool | None = None


@router.get("/users", response_model=list[UserListResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    is_active: bool | None = Query(None),
    search: str | None = Query(None),
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if search:
        like_value = f"%{search}%"
        query = query.filter((User.email.ilike(like_value)) | (User.username.ilike(like_value)))

    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return [
        UserListResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            phone=user.phone,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at.isoformat(),
            last_login=user.last_login.isoformat() if user.last_login else None,
        )
        for user in users
    ]


@router.put("/users/{user_id}", response_model=UserListResponse)
async def update_user(
    user_id: str,
    request: UserUpdateRequest,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user = UserService.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.id == current_admin.id and request.is_admin is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能取消自己的管理员权限")

    if request.is_active is not None:
        user.is_active = request.is_active
    if request.is_admin is not None:
        user.is_admin = request.is_admin
    db.commit()
    db.refresh(user)
    return UserListResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        phone=user.phone,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at.isoformat(),
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除自己")
    user = UserService.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    db.delete(user)
    db.commit()
    return None


@router.get("/stats", response_model=UserStatsResponse)
async def get_user_stats(
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    return UserStatsResponse(**build_stats(db))


@router.get("/license-keys", response_model=list[LicenseKeyResponse])
async def get_license_keys(
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    return [LicenseKeyResponse(**serialize_license_key(item)) for item in list_license_keys(db)]


@router.post("/license-keys/generate")
async def create_license_keys(
    request: GenerateLicenseKeysRequest,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    items = generate_license_keys(
        db,
        quantity=request.quantity,
        name_prefix=request.name_prefix or "",
        duration_days=request.duration_days,
        note=request.note or "",
        is_admin=request.is_admin,
    )
    return {
        "ok": True,
        "items": [serialize_license_key(item) for item in items],
    }


@router.put("/license-keys/{license_key_id}", response_model=LicenseKeyResponse)
async def edit_license_key(
    license_key_id: str,
    request: UpdateLicenseKeyRequest,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    item = db.query(LicenseKey).filter(LicenseKey.id == license_key_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="卡密不存在")
    updated = update_license_key(
        db,
        item,
        name=request.name,
        note=request.note,
        status=request.status,
        duration_days=request.duration_days,
        is_admin=request.is_admin,
    )
    return LicenseKeyResponse(**serialize_license_key(updated))


@router.delete("/license-keys/{license_key_id}")
async def remove_license_key(
    license_key_id: str,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    item = db.query(LicenseKey).filter(LicenseKey.id == license_key_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="卡密不存在")
    db.delete(item)
    db.commit()
    return {"ok": True}
