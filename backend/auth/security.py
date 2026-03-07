"""
安全工具模块
包含密码加密、JWT 生成、API Key 加密等功能
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet
import base64
import hashlib

from config import settings


# ---- 密码加密 ----
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    # bcrypt 有 72 字节限制，先截断
    password_bytes = plain_password.encode('utf-8')[:72]
    return pwd_context.verify(password_bytes.decode('utf-8', errors='ignore'), hashed_password)


def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    # bcrypt 有 72 字节限制，先截断
    password_bytes = password.encode('utf-8')[:72]
    return pwd_context.hash(password_bytes.decode('utf-8', errors='ignore'))


# ---- JWT Token ----
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """解码 JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# ---- API Key 加密 ----
# 将密钥转换为 Fernet 兼容的格式
def _get_fernet_key(key: str) -> bytes:
    """将任意字符串转换为 Fernet 兼容的 32 字节密钥"""
    # 使用 SHA256 哈希确保得到 32 字节
    hash_digest = hashlib.sha256(key.encode()).digest()
    # Base64 编码为 Fernet 兼容格式
    return base64.urlsafe_b64encode(hash_digest)


_fernet = Fernet(_get_fernet_key(settings.API_KEY_ENCRYPTION_KEY))


def encrypt_api_key(api_key: str) -> str:
    """加密 API Key"""
    encrypted = _fernet.encrypt(api_key.encode())
    return base64.urlsafe_b64encode(encrypted).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """解密 API Key"""
    encrypted_bytes = base64.urlsafe_b64decode(encrypted_key.encode())
    decrypted = _fernet.decrypt(encrypted_bytes)
    return decrypted.decode()


# ---- 用户 ID 生成 ----
def generate_user_id() -> str:
    """生成用户 ID"""
    import time
    timestamp = int(time.time() * 1000)
    return f"user_{timestamp}"


def generate_api_key_id() -> str:
    """生成 API Key ID"""
    import time
    timestamp = int(time.time() * 1000)
    return f"key_{timestamp}"


def generate_sms_id() -> str:
    """生成短信验证码 ID"""
    import time
    timestamp = int(time.time() * 1000)
    return f"sms_{timestamp}"


def generate_email_verification_id() -> str:
    """生成邮箱验证码 ID"""
    import time
    timestamp = int(time.time() * 1000)
    return f"email_{timestamp}"


def generate_prompt_template_id() -> str:
    """生成提示词模板 ID"""
    import time
    timestamp = int(time.time() * 1000)
    return f"tpl_{timestamp}"
