"""
数据库连接模块
使用 SQLAlchemy 管理 SQLite 数据库连接，提供依赖注入。
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from config import settings

# 创建数据库引擎（SQLite 需要 check_same_thread=False）
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

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
