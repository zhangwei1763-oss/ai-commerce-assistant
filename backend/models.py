"""
数据模型定义
包含用户表、产品、脚本、视频、爆款分析等核心表
"""

from datetime import datetime
import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(String, primary_key=True)                    # user_001
    email = Column(String, unique=True, nullable=False, index=True)
    phone = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=False)           # bcrypt 加密
    username = Column(String)                                # 可选昵称
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)                # 管理员标识
    last_login = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    api_keys = relationship("UserApiKey", back_populates="user", cascade="all, delete-orphan")
    prompt_templates = relationship("PromptTemplate", back_populates="user", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="user", cascade="all, delete-orphan")
    scripts = relationship("Script", back_populates="user", cascade="all, delete-orphan")
    videos = relationship("Video", back_populates="user", cascade="all, delete-orphan")
    viral_analyses = relationship("ViralAnalysis", back_populates="user", cascade="all, delete-orphan")
    characters = relationship("CharacterImage", back_populates="user", cascade="all, delete-orphan")
    character_groups = relationship("CharacterGroup", back_populates="user", cascade="all, delete-orphan")
    license_keys = relationship("LicenseKey", foreign_keys="LicenseKey.bound_user_id", back_populates="bound_user")


class UserApiKey(Base):
    """用户 API Key 表（加密存储）"""
    __tablename__ = "user_api_keys"

    id = Column(String, primary_key=True)                    # key_001
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False)                # DOUBAO / SILICONFLOW / ALIYUN_BAILIAN / OPENAI / DEEPSEEK / SEEDANCE / ...
    api_key = Column(Text, nullable=False)                   # AES 加密存储
    api_endpoint = Column(String)                            # 可选自定义端点
    model_name = Column(String)                              # 可选模型名
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="api_keys")


class PromptTemplate(Base):
    """用户提示词模板表"""
    __tablename__ = "prompt_templates"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="prompt_templates")


class SmsVerification(Base):
    """短信验证码表"""
    __tablename__ = "sms_verifications"

    id = Column(String, primary_key=True)                    # sms_001
    phone = Column(String, nullable=False, index=True)
    code = Column(String, nullable=False)                    # 6 位验证码
    verified = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class EmailVerification(Base):
    """邮箱验证码表"""
    __tablename__ = "email_verifications"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, index=True)
    code = Column(String, nullable=False)
    verified = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Product(Base):
    """产品信息表"""
    __tablename__ = "products"

    id = Column(String, primary_key=True)                    # prod_20250225_001
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    product_name = Column(String, nullable=False)
    core_selling_points = Column(Text)
    main_pain_points = Column(Text)
    price_advantage = Column(String)
    target_audience = Column(String)
    product_images = Column(Text)
    confirmed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="products")


class Script(Base):
    """带货脚本表"""
    __tablename__ = "scripts"

    id = Column(String, primary_key=True)                    # script_001
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(String, nullable=False)
    character_id = Column(String, ForeignKey("character_images.id"), nullable=True, index=True)
    script_type = Column(String, default="normal")
    hook_type = Column(String)
    audience = Column(String)
    hook_text = Column(Text)
    product_text = Column(Text)
    cta_text = Column(Text)
    visual_prompts = Column(Text)
    total_word_count = Column(Integer)
    styles = Column(String)
    duration = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="scripts")
    character = relationship("CharacterImage", back_populates="scripts")


class Video(Base):
    """视频信息表"""
    __tablename__ = "videos"

    id = Column(String, primary_key=True)                    # video_001
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    script_id = Column(String)
    product_id = Column(String)
    seedance_task_id = Column(String)
    filename = Column(String)
    local_path = Column(String)
    thumbnail = Column(String)
    duration = Column(Integer)
    resolution = Column(String)
    file_size = Column(String)
    visual_style = Column(String)
    status = Column(String, default="pending")
    progress = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="videos")


class ViralAnalysis(Base):
    """爆款分析记录表"""
    __tablename__ = "viral_analysis"

    id = Column(String, primary_key=True)                    # analysis_001
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(String, nullable=False)
    video_url = Column(String)
    hook_analysis = Column(Text)
    visual_analysis = Column(Text)
    conversion_logic = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="viral_analyses")


class CharacterImage(Base):
    """人物图片表"""
    __tablename__ = "character_images"

    id = Column(String, primary_key=True, default=lambda: f"char_{uuid.uuid4().hex[:8]}")
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    group_name = Column(String(100))
    description = Column(Text)
    style_preset = Column(String(50))
    prompt_text = Column(Text)
    image_storage_key = Column(String(500), nullable=False)
    image_public_url = Column(String(500))
    image_width = Column(Integer)
    image_height = Column(Integer)
    file_size = Column(Integer)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="characters")
    scripts = relationship("Script", back_populates="character")


class CharacterGroup(Base):
    """人物图片分组表"""
    __tablename__ = "character_groups"

    id = Column(String, primary_key=True, default=lambda: f"cgrp_{uuid.uuid4().hex[:8]}")
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="character_groups")


class LicenseKey(Base):
    """卡密表"""
    __tablename__ = "license_keys"

    id = Column(String, primary_key=True, default=lambda: f"lic_{uuid.uuid4().hex[:8]}")
    card_key = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(100))
    note = Column(Text)
    status = Column(String(20), default="active", nullable=False)
    duration_days = Column(Integer, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    activated_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    activation_count = Column(Integer, default=0, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    bound_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bound_user = relationship("User", foreign_keys=[bound_user_id], back_populates="license_keys")
