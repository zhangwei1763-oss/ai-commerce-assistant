"""
人物图片服务与路由。
负责人物图生成、保存、上传、查询和软删除。
"""

from __future__ import annotations

import os
from datetime import datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from api.volcengine_image import decode_generated_image_b64, generate_seedream_images
from auth.dependencies import get_current_user
from database import get_db
from models import CharacterGroup, CharacterImage, User
from services.storage_service import storage_service

router = APIRouter(prefix="/api/characters", tags=["人物图片"])

MAX_UPLOAD_SIZE = 10 * 1024 * 1024
DEFAULT_IMAGE_SIZE = ""

STYLE_PRESET_PROMPTS: dict[str, str] = {
    "专业主播": "专业电商主播，正面半身，直播间打光，镜头感强，适合带货海报与视频参考",
    "亲和型": "亲和自然的带货主播，面带微笑，贴近生活的直播间氛围，真实写实风格",
    "时尚型": "时尚达人风电商主播，精致妆造，高级感布光，适合美妆服饰类带货",
    "活力型": "年轻活力型带货主播，姿态自然有感染力，明快色彩，适合零食日用品种草",
}


class GeneratedCharacterCandidate(BaseModel):
    storage_key: str
    public_url: str
    revised_prompt: str = ""
    file_size: int | None = None
    image_width: int | None = None
    image_height: int | None = None


class GenerateCharacterRequest(BaseModel):
    apiKey: str = ""
    provider: str = "SEEDREAM"
    apiEndpoint: str = ""
    modelName: str = ""
    stylePreset: str = "专业主播"
    customPrompt: str = ""
    count: int = Field(default=1, ge=1, le=4)
    size: str = DEFAULT_IMAGE_SIZE


class SaveCharacterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    groupName: str = Field(default="", max_length=50)
    description: str = Field(default="", max_length=500)
    stylePreset: str = ""
    promptText: str = ""
    imageStorageKey: str = Field(..., min_length=1)
    imagePublicUrl: str = Field(..., min_length=1)
    fileSize: int | None = None
    imageWidth: int | None = None
    imageHeight: int | None = None


class UpdateCharacterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    groupName: str = Field(default="", max_length=50)
    description: str = Field(default="", max_length=500)


class CharacterResponse(BaseModel):
    id: str
    name: str
    group_name: str
    description: str
    style_preset: str
    prompt_text: str
    image_storage_key: str
    image_public_url: str
    image_width: int | None
    image_height: int | None
    file_size: int | None
    created_at: str
    updated_at: str


class CharacterListResponse(BaseModel):
    items: list[CharacterResponse]
    total: int
    limit: int
    offset: int


class CharacterGroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class CharacterGroupResponse(BaseModel):
    id: str
    name: str
    usage_count: int
    created_at: str
    updated_at: str


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _normalize_group_name(value: str | None) -> str:
    return _normalize_text(value)


def _compose_prompt(style_preset: str, custom_prompt: str) -> str:
    style_text = STYLE_PRESET_PROMPTS.get(style_preset, "")
    custom_text = _normalize_text(custom_prompt)
    prompt_parts = [part for part in (style_text, custom_text) if part]
    if not prompt_parts:
        raise HTTPException(status_code=400, detail="请至少选择一个风格或填写自定义提示词")
    return "，".join(prompt_parts)


def _to_character_response(character: CharacterImage) -> CharacterResponse:
    return CharacterResponse(
        id=character.id,
        name=character.name,
        group_name=character.group_name or "",
        description=character.description or "",
        style_preset=character.style_preset or "",
        prompt_text=character.prompt_text or "",
        image_storage_key=character.image_storage_key,
        image_public_url=character.image_public_url or "",
        image_width=character.image_width,
        image_height=character.image_height,
        file_size=character.file_size,
        created_at=character.created_at.isoformat(),
        updated_at=character.updated_at.isoformat(),
    )


def _to_group_response(group: CharacterGroup, usage_count: int) -> CharacterGroupResponse:
    return CharacterGroupResponse(
        id=group.id,
        name=group.name,
        usage_count=usage_count,
        created_at=group.created_at.isoformat(),
        updated_at=group.updated_at.isoformat(),
    )


def _ensure_group_exists(db: Session, user_id: str, group_name: str) -> str:
    normalized = _normalize_group_name(group_name)
    if not normalized:
        return ""

    existing = db.query(CharacterGroup).filter(
        CharacterGroup.user_id == user_id,
        CharacterGroup.name == normalized,
    ).first()
    if existing:
        return existing.name

    group = CharacterGroup(
        id=f"cgrp_{uuid4().hex[:8]}",
        user_id=user_id,
        name=normalized,
    )
    db.add(group)
    db.flush()
    return group.name


def _list_group_usage(db: Session, user_id: str) -> list[CharacterGroupResponse]:
    groups = db.query(CharacterGroup).filter(CharacterGroup.user_id == user_id).order_by(CharacterGroup.created_at.asc()).all()
    usage_rows = db.query(
        CharacterImage.group_name,
        func.count(CharacterImage.id),
    ).filter(
        CharacterImage.user_id == user_id,
        CharacterImage.is_deleted == False,
        CharacterImage.group_name.isnot(None),
        CharacterImage.group_name != "",
    ).group_by(CharacterImage.group_name).all()
    usage_map = {str(name): int(count) for name, count in usage_rows if name}
    return [_to_group_response(group, usage_map.get(group.name, 0)) for group in groups]


@router.get("/groups", response_model=list[CharacterGroupResponse])
async def list_character_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _list_group_usage(db, current_user.id)


@router.post("/groups", response_model=CharacterGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_character_group(
    request: CharacterGroupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    normalized_name = _normalize_group_name(request.name)
    existing = db.query(CharacterGroup).filter(
        CharacterGroup.user_id == current_user.id,
        CharacterGroup.name == normalized_name,
    ).first()
    if existing:
        usage = db.query(func.count(CharacterImage.id)).filter(
            CharacterImage.user_id == current_user.id,
            CharacterImage.is_deleted == False,
            CharacterImage.group_name == existing.name,
        ).scalar() or 0
        return _to_group_response(existing, int(usage))

    group = CharacterGroup(
        id=f"cgrp_{uuid4().hex[:8]}",
        user_id=current_user.id,
        name=normalized_name,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _to_group_response(group, 0)


@router.delete("/groups/{group_id}")
async def delete_character_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(CharacterGroup).filter(
        CharacterGroup.id == group_id,
        CharacterGroup.user_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="分组不存在")

    affected = db.query(CharacterImage).filter(
        CharacterImage.user_id == current_user.id,
        CharacterImage.group_name == group.name,
        CharacterImage.is_deleted == False,
    ).update({CharacterImage.group_name: ""}, synchronize_session=False)

    db.delete(group)
    db.commit()
    return {"ok": True, "affected": int(affected)}


async def _download_remote_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True) as client:
        response = await client.get(url)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"生成结果下载失败（HTTP {response.status_code}）")
    return response.content


def _store_character_bytes(data: bytes, filename: str) -> GeneratedCharacterCandidate:
    stored = storage_service.store_bytes(
        category="characters",
        filename=filename,
        data=data,
        content_type="image/png",
    )
    return GeneratedCharacterCandidate(
        storage_key=stored.key,
        public_url=stored.public_url,
        file_size=len(data),
    )


@router.post("/generate")
async def generate_character(
    request: GenerateCharacterRequest,
    current_user: User = Depends(get_current_user),
):
    api_key = _normalize_text(request.apiKey)
    if not api_key:
        raise HTTPException(status_code=400, detail="请先在设置中配置生图 API Key")

    prompt = _compose_prompt(request.stylePreset, request.customPrompt)
    try:
        assets = await generate_seedream_images(
            api_key=api_key,
            provider=request.provider,
            api_endpoint=request.apiEndpoint,
            model_name=request.modelName,
            prompt=prompt,
            count=request.count,
            size=request.size,
            user=current_user.id,
        )
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    candidates: list[GeneratedCharacterCandidate] = []
    for index, asset in enumerate(assets, start=1):
        filename = f"{current_user.id}_{uuid4().hex[:8]}_{index}.png"
        if asset.b64_json:
            data = decode_generated_image_b64(asset.b64_json)
        elif asset.url:
            data = await _download_remote_bytes(asset.url)
        else:
            continue
        stored = _store_character_bytes(data, filename)
        stored.revised_prompt = asset.revised_prompt
        candidates.append(stored)

    if not candidates:
        raise HTTPException(status_code=502, detail="图片生成成功，但未返回可保存的图片")

    return {
        "ok": True,
        "prompt": prompt,
        "stylePreset": request.stylePreset,
        "images": [item.model_dump() for item in candidates],
    }


@router.post("/save", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def save_character(
    request: SaveCharacterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    character = CharacterImage(
        id=f"char_{uuid4().hex[:8]}",
        user_id=current_user.id,
        name=_normalize_text(request.name),
        group_name=_ensure_group_exists(db, current_user.id, request.groupName),
        description=_normalize_text(request.description),
        style_preset=_normalize_text(request.stylePreset),
        prompt_text=_normalize_text(request.promptText),
        image_storage_key=_normalize_text(request.imageStorageKey),
        image_public_url=_normalize_text(request.imagePublicUrl),
        image_width=request.imageWidth,
        image_height=request.imageHeight,
        file_size=request.fileSize,
    )
    db.add(character)
    db.commit()
    db.refresh(character)
    return _to_character_response(character)


@router.post("/upload", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def upload_character(
    file: UploadFile = File(...),
    name: str = Form(...),
    groupName: str = Form(""),
    description: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少上传文件")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传文件为空")
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="图片不能超过 10MB")

    ext = os.path.splitext(file.filename)[1] or ".png"
    stored = storage_service.store_bytes(
        category="characters",
        filename=f"{uuid4().hex[:8]}{ext}",
        data=content,
        content_type=file.content_type or "image/png",
    )
    character = CharacterImage(
        id=f"char_{uuid4().hex[:8]}",
        user_id=current_user.id,
        name=_normalize_text(name) or os.path.splitext(file.filename)[0],
        group_name=_ensure_group_exists(db, current_user.id, groupName),
        description=_normalize_text(description),
        style_preset="本地上传",
        prompt_text="",
        image_storage_key=stored.key,
        image_public_url=stored.public_url,
        file_size=len(content),
    )
    db.add(character)
    db.commit()
    db.refresh(character)
    return _to_character_response(character)


@router.get("", response_model=CharacterListResponse)
async def list_characters(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CharacterImage).filter(
        CharacterImage.user_id == current_user.id,
        CharacterImage.is_deleted == False,
    )
    total = query.count()
    items = query.order_by(CharacterImage.created_at.desc()).offset(offset).limit(limit).all()
    return CharacterListResponse(
        items=[_to_character_response(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    character = db.query(CharacterImage).filter(
        CharacterImage.id == character_id,
        CharacterImage.user_id == current_user.id,
        CharacterImage.is_deleted == False,
    ).first()
    if not character:
        raise HTTPException(status_code=404, detail="人物图片不存在")
    return _to_character_response(character)


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    request: UpdateCharacterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    character = db.query(CharacterImage).filter(
        CharacterImage.id == character_id,
        CharacterImage.user_id == current_user.id,
        CharacterImage.is_deleted == False,
    ).first()
    if not character:
        raise HTTPException(status_code=404, detail="人物图片不存在")

    character.name = _normalize_text(request.name)
    character.group_name = _ensure_group_exists(db, current_user.id, request.groupName)
    character.description = _normalize_text(request.description)
    character.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(character)
    return _to_character_response(character)


@router.delete("/{character_id}")
async def delete_character(
    character_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    character = db.query(CharacterImage).filter(
        CharacterImage.id == character_id,
        CharacterImage.user_id == current_user.id,
        CharacterImage.is_deleted == False,
    ).first()
    if not character:
        raise HTTPException(status_code=404, detail="人物图片不存在")

    character.is_deleted = True
    character.deleted_at = datetime.utcnow()
    character.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
