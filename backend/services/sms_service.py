"""
短信服务模块
支持阿里云短信发送
"""

import random
import string
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models import SmsVerification
from config import settings


class SmsService:
    """短信服务类"""

    # 验证码有效期（分钟）
    CODE_EXPIRE_MINUTES = 5
    # 验证码长度
    CODE_LENGTH = 6

    @staticmethod
    def generate_code() -> str:
        """生成 6 位数字验证码"""
        return ''.join(random.choices(string.digits, k=SmsService.CODE_LENGTH))

    @staticmethod
    def create_verification(db: Session, phone: str) -> SmsVerification:
        """创建验证码记录"""
        from auth.security import generate_sms_id

        # 删除该手机号之前的未使用验证码
        db.query(SmsVerification).filter(
            SmsVerification.phone == phone,
            SmsVerification.verified == False
        ).delete()

        code = SmsService.generate_code()
        expires_at = datetime.utcnow() + timedelta(minutes=SmsService.CODE_EXPIRE_MINUTES)

        verification = SmsVerification(
            id=generate_sms_id(),
            phone=phone,
            code=code,
            verified=False,
            expires_at=expires_at
        )

        db.add(verification)
        db.commit()
        db.refresh(verification)

        return verification

    @staticmethod
    def verify_code(db: Session, phone: str, code: str) -> bool:
        """验证验证码"""
        verification = db.query(SmsVerification).filter(
            SmsVerification.phone == phone,
            SmsVerification.code == code,
            SmsVerification.verified == False
        ).first()

        if not verification:
            return False

        # 检查是否过期
        if datetime.utcnow() > verification.expires_at:
            return False

        # 标记为已使用
        verification.verified = True
        db.commit()

        return True

    @staticmethod
    async def send_verification_code(db: Session, phone: str) -> str:
        """发送验证码"""
        # 检查是否频繁请求（1分钟内只能发送一次）
        from datetime import datetime, timedelta

        recent_verification = db.query(SmsVerification).filter(
            SmsVerification.phone == phone,
            SmsVerification.created_at >= datetime.utcnow() - timedelta(minutes=1)
        ).first()

        if recent_verification:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="请求过于频繁，请 1 分钟后再试"
            )

        # 创建验证码记录
        verification = SmsService.create_verification(db, phone)

        # 发送短信
        try:
            code = await SmsService._send_aliyun_sms(phone, verification.code)
            return code
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"短信发送失败: {str(e)}"
            )

    @staticmethod
    async def _send_aliyun_sms(phone: str, code: str) -> str:
        """调用阿里云短信服务发送验证码"""
        try:
            from aliyunsdkcore.client import AcsClient
            from aliyunsdkdysmsapi.request.v20170525 import SendSmsRequest
            import json

            # 检查配置
            if not all([settings.ALIYUN_ACCESS_KEY_ID, settings.ALIYUN_ACCESS_KEY_SECRET,
                       settings.ALIYUN_SMS_SIGN_NAME, settings.ALIYUN_SMS_TEMPLATE_CODE]):
                # 如果未配置，返回模拟验证码（用于开发测试）
                print(f"[SMS] 模拟发送验证码到 {phone}: {code}")
                return code

            # 创建阿里云客户端
            client = AcsClient(
                settings.ALIYUN_ACCESS_KEY_ID,
                settings.ALIYUN_ACCESS_KEY_SECRET,
                'cn-hangzhou'
            )

            # 创建请求
            request = SendSmsRequest.SendSmsRequest()
            request.set_PhoneNumbers(phone)
            request.set_SignName(settings.ALIYUN_SMS_SIGN_NAME)
            request.set_TemplateCode(settings.ALIYUN_SMS_TEMPLATE_CODE)
            request.set_TemplateParam(json.dumps({'code': code}))

            # 发送短信
            response = client.do_action_with_exception(request)
            result = json.loads(response.decode('utf-8'))

            if result.get('Code') == 'OK':
                return code
            else:
                raise Exception(f"阿里云短信错误: {result.get('Message')}")

        except ImportError:
            # 阿里云 SDK 未安装，模拟发送
            print(f"[SMS] 模拟发送验证码到 {phone}: {code}")
            return code
