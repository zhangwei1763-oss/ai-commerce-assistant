"""
认证路由模块
处理用户注册、登录、登出等认证相关请求
"""

from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    generate_user_id
)
from auth.dependencies import get_current_user
from config import settings
from services.email_service import EmailService

router = APIRouter(prefix="/api/auth", tags=["认证"])


# ---- 请求/响应模型 ----
class UserRegisterRequest(BaseModel):
    """用户注册请求"""
    email: EmailStr
    code: str = Field(..., pattern=r'^\d{6}$')
    password: str = Field(..., min_length=6, max_length=50)
    username: Optional[str] = None


class EmailCodeRequest(BaseModel):
    """邮箱验证码发送请求"""
    email: EmailStr


class UserLoginRequest(BaseModel):
    """用户登录请求"""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """用户信息响应"""
    id: str
    email: str
    username: Optional[str] = None
    is_active: bool
    is_admin: bool

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token 响应"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RegisterResponse(BaseModel):
    """注册成功响应"""
    ok: bool = True
    message: str = "注册成功，请前往登录"


# ---- API 端点 ----
@router.post("/send-email-code")
async def send_email_code(
    request: EmailCodeRequest,
    db: Session = Depends(get_db)
):
    """
    发送邮箱验证码
    """
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册"
        )

    code = await EmailService.send_verification_code(db, request.email)
    response = {
        "ok": True,
        "message": "验证码已发送",
    }
    if not all([
        settings.SMTP_HOST,
        settings.SMTP_USERNAME,
        settings.SMTP_PASSWORD,
        settings.SMTP_FROM_EMAIL,
    ]):
        response["dev_code"] = code
    return response


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_email(
    request: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    邮箱注册

    - **email**: 邮箱地址（唯一）
    - **code**: 邮箱验证码
    - **password**: 密码（至少 6 位）
    - **username**: 可选昵称
    """
    # 检查邮箱是否已存在
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册"
        )

    if not EmailService.verify_code(db, request.email, request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱验证码错误或已过期"
        )

    # 创建新用户
    user = User(
        id=generate_user_id(),
        email=request.email,
        password_hash=get_password_hash(request.password),
        username=request.username,
        is_active=True,
        is_admin=False
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return RegisterResponse(
        ok=True,
        message="注册成功，请前往登录"
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: UserLoginRequest,
    db: Session = Depends(get_db)
):
    """
    用户登录

    - **email**: 邮箱地址
    - **password**: 密码
    """
    # 查找用户
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误"
        )

    # 验证密码
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误"
        )

    # 检查用户状态
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用"
        )

    # 生成 access token
    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户信息

    需要认证：Bearer Token
    """
    return UserResponse.model_validate(current_user)


@router.post("/logout")
async def logout():
    """
    用户登出

    注意：JWT 是无状态的，客户端只需删除本地存储的 token 即可
    """
    return {"message": "登出成功"}
