"""
数据库连接模块
使用 SQLAlchemy 管理 SQLite / PostgreSQL 数据库连接，提供依赖注入。
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from config import settings


def _create_engine():
    """根据数据库类型创建引擎。"""
    engine_kwargs = {
        "echo": False,
        "pool_pre_ping": True,
    }

    if settings.DATABASE_URL.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}

    return create_engine(settings.DATABASE_URL, **engine_kwargs)


engine = _create_engine()

# 会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """初始化数据库，自动建表"""
    from models import Base
    Base.metadata.create_all(bind=engine)


def get_db():
    """
    FastAPI 依赖注入函数。
    每个请求获取一个独立的数据库会话，请求结束后自动关闭。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
