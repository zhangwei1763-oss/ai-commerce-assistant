"""
数据模型定义
包含四张核心表：产品、脚本、视频、爆款分析
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Product(Base):
    """产品信息表"""
    __tablename__ = "products"

    id = Column(String, primary_key=True)                    # prod_20250225_001
    product_name = Column(String, nullable=False)            # 产品名称
    core_selling_points = Column(Text)                       # 核心卖点
    main_pain_points = Column(Text)                          # 主要痛点
    price_advantage = Column(String)                         # 价格优势
    target_audience = Column(String)                         # 目标人群
    product_images = Column(Text)                            # 产品图片（JSON字符串）
    confirmed = Column(Boolean, default=False)               # 是否已由AI确认
    created_at = Column(DateTime, default=datetime.utcnow)


class Script(Base):
    """带货脚本表"""
    __tablename__ = "scripts"

    id = Column(String, primary_key=True)                    # script_001
    product_id = Column(String, nullable=False)              # 关联产品ID
    script_type = Column(String, default="normal")           # normal / matrix / viral
    hook_type = Column(String)                               # 钩子类型
    audience = Column(String)                                # 目标人群
    hook_text = Column(Text)                                 # 钩子文案
    product_text = Column(Text)                              # 产品文案
    cta_text = Column(Text)                                  # 逼单文案
    visual_prompts = Column(Text)                            # 画面提示词（JSON字符串）
    total_word_count = Column(Integer)                       # 口播总字数
    styles = Column(String)                                  # 文案风格（逗号分隔）
    duration = Column(Integer)                               # 脚本时长（秒）
    created_at = Column(DateTime, default=datetime.utcnow)


class Video(Base):
    """视频信息表"""
    __tablename__ = "videos"

    id = Column(String, primary_key=True)                    # video_001
    script_id = Column(String)                               # 关联脚本ID
    product_id = Column(String)                              # 关联产品ID
    seedance_task_id = Column(String)                        # Seedance任务ID
    filename = Column(String)                                # 文件名
    local_path = Column(String)                              # 本地存储路径
    thumbnail = Column(String)                               # 缩略图路径
    duration = Column(Integer)                               # 视频时长（秒）
    resolution = Column(String)                              # 分辨率
    file_size = Column(String)                               # 文件大小
    visual_style = Column(String)                            # 视觉风格
    status = Column(String, default="pending")               # pending/processing/completed/failed
    progress = Column(Integer, default=0)                    # 生成进度（0-100）
    created_at = Column(DateTime, default=datetime.utcnow)


class ViralAnalysis(Base):
    """爆款分析记录表"""
    __tablename__ = "viral_analysis"

    id = Column(String, primary_key=True)                    # analysis_001
    product_id = Column(String, nullable=False)              # 关联产品ID
    video_url = Column(String)                               # 爆款视频链接
    hook_analysis = Column(Text)                             # 钩子分析（JSON）
    visual_analysis = Column(Text)                           # 视觉分析（JSON）
    conversion_logic = Column(Text)                          # 转化逻辑（JSON）
    created_at = Column(DateTime, default=datetime.utcnow)
