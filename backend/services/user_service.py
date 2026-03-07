"""
用户服务模块
处理用户相关的业务逻辑
"""

from typing import Optional, List
from sqlalchemy.orm import Session
from models import User
from auth.security import get_password_hash


class UserService:
    """用户服务类"""

    @staticmethod
    def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
        """根据 ID 获取用户"""
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def get_user_by_phone(db: Session, phone: str) -> Optional[User]:
        """根据手机号获取用户"""
        return db.query(User).filter(User.phone == phone).first()

    @staticmethod
    def list_users(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None
    ) -> List[User]:
        """获取用户列表"""
        query = db.query(User)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        return query.offset(skip).limit(limit).all()

    @staticmethod
    def update_user_status(db: Session, user_id: str, is_active: bool) -> Optional[User]:
        """更新用户状态"""
        user = UserService.get_user_by_id(db, user_id)
        if user:
            user.is_active = is_active
            db.commit()
            db.refresh(user)
        return user

    @staticmethod
    def update_last_login(db: Session, user_id: str):
        """更新最后登录时间"""
        from datetime import datetime
        user = UserService.get_user_by_id(db, user_id)
        if user:
            user.last_login = datetime.utcnow()
            db.commit()
