"""
邮箱验证码服务模块
支持 SMTP 邮件发送，未配置时回退到开发模式输出验证码。
"""

import random
import smtplib
import string
from datetime import datetime, timedelta
from email.message import EmailMessage

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import settings
from models import EmailVerification


class EmailService:
    """邮箱验证码服务类"""

    CODE_EXPIRE_MINUTES = 5
    CODE_LENGTH = 6

    @staticmethod
    def generate_code() -> str:
        return ''.join(random.choices(string.digits, k=EmailService.CODE_LENGTH))

    @staticmethod
    def create_verification(db: Session, email: str) -> EmailVerification:
        from auth.security import generate_email_verification_id

        db.query(EmailVerification).filter(
            EmailVerification.email == email,
            EmailVerification.verified == False,
        ).delete()

        verification = EmailVerification(
            id=generate_email_verification_id(),
            email=email,
            code=EmailService.generate_code(),
            verified=False,
            expires_at=datetime.utcnow() + timedelta(minutes=EmailService.CODE_EXPIRE_MINUTES),
        )
        db.add(verification)
        db.commit()
        db.refresh(verification)
        return verification

    @staticmethod
    def verify_code(db: Session, email: str, code: str) -> bool:
        verification = db.query(EmailVerification).filter(
            EmailVerification.email == email,
            EmailVerification.code == code,
            EmailVerification.verified == False,
        ).first()

        if not verification:
            return False
        if datetime.utcnow() > verification.expires_at:
            return False

        verification.verified = True
        db.commit()
        return True

    @staticmethod
    async def send_verification_code(db: Session, email: str) -> str:
        recent_verification = db.query(EmailVerification).filter(
            EmailVerification.email == email,
            EmailVerification.created_at >= datetime.utcnow() - timedelta(minutes=1),
        ).first()

        if recent_verification:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="请求过于频繁，请 1 分钟后再试",
            )

        verification = EmailService.create_verification(db, email)

        try:
            await EmailService._send_smtp_email(email, verification.code)
            return verification.code
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"邮件发送失败: {str(exc)}",
            )

    @staticmethod
    async def _send_smtp_email(email: str, code: str) -> None:
        if not all([
            settings.SMTP_HOST,
            settings.SMTP_USERNAME,
            settings.SMTP_PASSWORD,
            settings.SMTP_FROM_EMAIL,
        ]):
            print(f"[EMAIL] 模拟发送验证码到 {email}: {code}")
            return

        message = EmailMessage()
        message["Subject"] = "AI 带货助手邮箱验证码"
        message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        message["To"] = email
        message.set_content(
            f"您的 AI 带货助手验证码是：{code}\n\n"
            f"验证码 {EmailService.CODE_EXPIRE_MINUTES} 分钟内有效，请勿泄露给他人。"
        )

        if settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(message)
            return

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(message)
