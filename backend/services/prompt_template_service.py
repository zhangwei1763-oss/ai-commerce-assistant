"""
提示词模板服务模块
处理用户提示词模板的增删改查。
"""

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from auth.security import generate_prompt_template_id
from models import PromptTemplate


class PromptTemplateService:
    """提示词模板服务类"""

    @staticmethod
    def list_user_prompt_templates(db: Session, user_id: str) -> List[PromptTemplate]:
        return db.query(PromptTemplate).filter(
            PromptTemplate.user_id == user_id
        ).order_by(PromptTemplate.updated_at.desc()).all()

    @staticmethod
    def get_user_prompt_template(
        db: Session,
        user_id: str,
        template_id: str,
    ) -> Optional[PromptTemplate]:
        return db.query(PromptTemplate).filter(
            PromptTemplate.id == template_id,
            PromptTemplate.user_id == user_id,
        ).first()

    @staticmethod
    def create_prompt_template(
        db: Session,
        user_id: str,
        name: str,
        content: str,
    ) -> PromptTemplate:
        template = PromptTemplate(
            id=generate_prompt_template_id(),
            user_id=user_id,
            name=name,
            content=content,
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return template

    @staticmethod
    def update_prompt_template(
        db: Session,
        user_id: str,
        template_id: str,
        name: str,
        content: str,
    ) -> PromptTemplate:
        template = PromptTemplateService.get_user_prompt_template(db, user_id, template_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="提示词模板不存在",
            )

        template.name = name
        template.content = content
        db.commit()
        db.refresh(template)
        return template

    @staticmethod
    def delete_prompt_template(db: Session, user_id: str, template_id: str) -> bool:
        template = PromptTemplateService.get_user_prompt_template(db, user_id, template_id)
        if not template:
            return False

        db.delete(template)
        db.commit()
        return True
