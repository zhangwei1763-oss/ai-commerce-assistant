"""
短信路由模块
处理短信验证码发送和验证
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    generate_user_id
)
from services.sms_service import SmsService

router = APIRouter(prefix="/api/sms", tags=["短信"])


# ---- 请求/响应模型 ----
class SendCodeRequest(BaseModel):
    """发送验证码请求"""
    phone: str = Field(..., pattern=r'^\d{11}$', description="11位手机号")


class VerifyCodeRequest(BaseModel):
    """验证码验证请求"""
    phone: str = Field(..., pattern=r'^\d{11}$', description="11位手机号")
    code: str = Field(..., pattern=r'^\d{6}$', description="6位验证码")


class PhoneRegisterRequest(BaseModel):
    """手机号注册请求"""
    phone: str = Field(..., pattern=r'^\d{11}$', description="11位手机号")
    code: str = Field(..., pattern=r'^\d{6}$', description="6位验证码")
    password: str = Field(..., min_length=6, max_length=50, description="密码（至少6位）")
    username: str = Field("", description="可选昵称")


# ---- API 端点 ----
@router.post("/send-code")
async def send_verification_code(
    request: SendCodeRequest,
    db: Session = Depends(get_db)
):
    """
    发送短信验证码

    - **phone**: 11位手机号

    注意：
    - 1分钟内只能发送一次
    - 验证码5分钟内有效
    - 开发环境可能使用模拟发送
    """
    code = await SmsService.send_verification_code(db, request.phone)

    # 开发环境下返回验证码（生产环境应移除）
    return {
        "ok": True,
        "message": "验证码已发送",
        # 开发模式下返回验证码，生产环境应移除下一行
        "dev_code": code
    }


@router.post("/verify-code")
async def verify_code(
    request: VerifyCodeRequest,
    db: Session = Depends(get_db)
):
    """
    验证短信验证码

    - **phone**: 手机号
    - **code**: 6位验证码
    """
    is_valid = SmsService.verify_code(db, request.phone, request.code)

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误或已过期"
        )

    return {"ok": True, "message": "验证码正确"}


@router.post("/register-phone")
async def register_with_phone(
    request: PhoneRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    手机号验证码注册

    - **phone**: 11位手机号
    - **code**: 6位验证码
    - **password**: 密码（至少6位）
    - **username**: 可选昵称
    """
    # 验证验证码
    is_valid = SmsService.verify_code(db, request.phone, request.code)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误或已过期"
        )

    # 检查手机号是否已注册
    existing_user = db.query(User).filter(User.phone == request.phone).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该手机号已被注册"
        )

    # 创建新用户
    user = User(
        id=generate_user_id(),
        phone=request.phone,
        password_hash=get_password_hash(request.password),
        username=request.username or None,
        is_active=True,
        is_admin=False
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # 生成 access token
    from config import settings
    from datetime import timedelta
    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "ok": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "phone": user.phone,
            "username": user.username,
            "is_active": user.is_active,
            "is_admin": user.is_admin
        }
    }
