"""
数据库连接模块
使用 SQLAlchemy 管理 SQLite / PostgreSQL 数据库连接，提供依赖注入。
"""

from sqlalchemy import create_engine, inspect, text
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
    from services.license_key_service import ensure_bootstrap_admin_key
    Base.metadata.create_all(bind=engine)
    _ensure_runtime_schema()
    db = SessionLocal()
    try:
        ensure_bootstrap_admin_key(db)
    finally:
        db.close()


def _ensure_runtime_schema():
    """为无迁移脚本的轻量部署补齐关键列。"""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "scripts" in table_names:
        script_columns = {column["name"] for column in inspector.get_columns("scripts")}
        if "character_id" not in script_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE scripts ADD COLUMN character_id VARCHAR"))

    if "character_images" in table_names:
        character_columns = {column["name"] for column in inspector.get_columns("character_images")}
        if "group_name" not in character_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE character_images ADD COLUMN group_name VARCHAR"))

    if "license_keys" in table_names:
        license_columns = {column["name"] for column in inspector.get_columns("license_keys")}
        statements = []
        if "note" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN note TEXT")
        if "duration_days" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN duration_days INTEGER")
        if "expires_at" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN expires_at DATETIME")
        if "activated_at" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN activated_at DATETIME")
        if "last_used_at" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN last_used_at DATETIME")
        if "activation_count" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN activation_count INTEGER DEFAULT 0")
        if "is_admin" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN is_admin BOOLEAN DEFAULT 0")
        if "bound_user_id" not in license_columns:
            statements.append("ALTER TABLE license_keys ADD COLUMN bound_user_id VARCHAR")
        if statements:
            with engine.begin() as conn:
                for statement in statements:
                    conn.execute(text(statement))


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
