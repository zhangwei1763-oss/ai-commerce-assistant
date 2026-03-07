"""
管理员路由模块
处理管理员相关的用户管理请求
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth.dependencies import get_admin_user
from services.user_service import UserService

router = APIRouter(prefix="/api/admin", tags=["管理员"])


# ---- 请求/响应模型 ----
class UserListResponse(BaseModel):
    """用户列表响应"""
    id: str
    email: str
    username: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    is_admin: bool
    created_at: str
    last_login: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    """用户更新请求"""
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


class UserStatsResponse(BaseModel):
    """用户统计响应"""
    total_users: int
    active_users: int
    admin_users: int
    new_users_today: int


# ---- API 端点 ----
@router.get("/users", response_model=List[UserListResponse])
async def list_users(
    skip: int = Query(0, ge=0, description="跳过记录数"),
    limit: int = Query(100, ge=1, le=100, description="返回记录数"),
    is_active: Optional[bool] = Query(None, description="筛选活跃状态"),
    search: Optional[str] = Query(None, description="搜索邮箱或用户名"),
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取用户列表

    需要管理员权限
    """
    query = db.query(User)

    # 筛选条件
    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    # 搜索
    if search:
        query = query.filter(
            (User.email.ilike(f"%{search}%")) |
            (User.username.ilike(f"%{search}%"))
        )

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
            last_login=user.last_login.isoformat() if user.last_login else None
        )
        for user in users
    ]


@router.get("/users/{user_id}", response_model=UserListResponse)
async def get_user(
    user_id: str,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取指定用户详情

    需要管理员权限
    """
    user = UserService.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    return UserListResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        phone=user.phone,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at.isoformat(),
        last_login=user.last_login.isoformat() if user.last_login else None
    )


@router.put("/users/{user_id}", response_model=UserListResponse)
async def update_user(
    user_id: str,
    request: UserUpdateRequest,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    更新用户状态

    需要管理员权限
    - is_active: 启用/禁用用户
    - is_admin: 设置/取消管理员
    """
    user = UserService.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 不允许修改自己的管理员状态
    if user.id == current_admin.id and request.is_admin is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能取消自己的管理员权限"
        )

    # 更新字段
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
        last_login=user.last_login.isoformat() if user.last_login else None
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    删除用户

    需要管理员权限
    注意：不能删除自己
    """
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己"
        )

    user = UserService.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    db.delete(user)
    db.commit()
    return None


@router.get("/stats", response_model=UserStatsResponse)
async def get_user_stats(
    current_admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取用户统计信息

    需要管理员权限
    """
    from datetime import datetime, timedelta

    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    admin_users = db.query(User).filter(User.is_admin == True).count()

    # 今日新增用户
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    new_users_today = db.query(User).filter(User.created_at >= today).count()

    return UserStatsResponse(
        total_users=total_users,
        active_users=active_users,
        admin_users=admin_users,
        new_users_today=new_users_today
    )
