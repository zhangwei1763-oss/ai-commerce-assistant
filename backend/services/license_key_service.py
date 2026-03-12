"""
卡密服务。
负责卡密生成、登录绑定、后台统计和管理员首张卡密自举。
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from auth.security import generate_user_id, get_password_hash
from config import settings
from models import LicenseKey, User

CARD_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CARD_KEY_PATTERN = re.compile(r"^[A-Z0-9]{16}$")


def normalize_card_key(raw_value: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]", "", (raw_value or "").strip().upper())
    if not CARD_KEY_PATTERN.fullmatch(normalized):
        raise ValueError("卡密格式不正确")
    return "-".join(normalized[index : index + 4] for index in range(0, 16, 4))


def mask_card_key(card_key: str) -> str:
    parts = (card_key or "").split("-")
    if len(parts) != 4:
        return card_key
    return f"{parts[0]}-****-****-{parts[-1]}"


def generate_card_key() -> str:
    raw = "".join(secrets.choice(CARD_KEY_ALPHABET) for _ in range(16))
    return "-".join(raw[index : index + 4] for index in range(0, 16, 4))


def _now() -> datetime:
    return datetime.utcnow()


def _is_expired(item: LicenseKey, now: datetime | None = None) -> bool:
    current = now or _now()
    return bool(item.expires_at and item.expires_at <= current)


def _sync_bound_user_state(item: LicenseKey) -> None:
    if item.bound_user is None:
        return
    item.bound_user.is_admin = bool(item.is_admin)
    item.bound_user.is_active = item.status == "active" and not _is_expired(item)
    if item.name and not item.bound_user.username:
        item.bound_user.username = item.name


def _ensure_bound_user(db: Session, item: LicenseKey) -> User:
    if item.bound_user is not None:
        _sync_bound_user_state(item)
        return item.bound_user

    fallback_email = f"{item.id}@card.local"
    user = User(
        id=generate_user_id(),
        email=fallback_email,
        password_hash=get_password_hash(secrets.token_urlsafe(24)),
        username=item.name or mask_card_key(item.card_key),
        is_active=True,
        is_admin=bool(item.is_admin),
    )
    db.add(user)
    db.flush()
    item.bound_user_id = user.id
    item.bound_user = user
    return user


def serialize_license_key(item: LicenseKey) -> dict[str, Any]:
    return {
        "id": item.id,
        "card_key": item.card_key,
        "masked_card_key": mask_card_key(item.card_key),
        "name": item.name or "",
        "note": item.note or "",
        "status": item.status,
        "duration_days": item.duration_days,
        "expires_at": item.expires_at.isoformat() if item.expires_at else None,
        "activated_at": item.activated_at.isoformat() if item.activated_at else None,
        "last_used_at": item.last_used_at.isoformat() if item.last_used_at else None,
        "activation_count": int(item.activation_count or 0),
        "is_admin": bool(item.is_admin),
        "bound_user_id": item.bound_user_id,
        "bound_user_display_name": (
            item.bound_user.username
            if item.bound_user and item.bound_user.username
            else item.bound_user.email
            if item.bound_user and item.bound_user.email
            else None
        ),
        "created_at": item.created_at.isoformat() if item.created_at else "",
        "updated_at": item.updated_at.isoformat() if item.updated_at else "",
    }


def ensure_bootstrap_admin_key(db: Session) -> None:
    configured_key = (settings.BOOTSTRAP_ADMIN_CARD_KEY or "").strip().upper()
    if not configured_key:
        return

    try:
        normalized_key = normalize_card_key(configured_key)
    except ValueError:
        return

    existing = db.query(LicenseKey).filter(LicenseKey.card_key == normalized_key).first()
    if existing:
        changed = False
        if not existing.is_admin:
            existing.is_admin = True
            changed = True
        if existing.status != "active":
            existing.status = "active"
            changed = True
        if not existing.name:
            existing.name = settings.BOOTSTRAP_ADMIN_CARD_NAME.strip() or "系统管理员"
            changed = True
        if changed:
            _sync_bound_user_state(existing)
            db.commit()
        return

    item = LicenseKey(
        card_key=normalized_key,
        name=settings.BOOTSTRAP_ADMIN_CARD_NAME.strip() or "系统管理员",
        note="系统初始化管理员卡密",
        status="active",
        is_admin=True,
    )
    db.add(item)
    db.commit()


def activate_card_login(db: Session, raw_card_key: str) -> tuple[User, LicenseKey]:
    normalized_key = normalize_card_key(raw_card_key)
    item = db.query(LicenseKey).filter(LicenseKey.card_key == normalized_key).first()
    if item is None:
        raise LookupError("卡密不存在")
    if item.status != "active":
        raise PermissionError("卡密已停用")

    now = _now()
    if _is_expired(item, now):
        _sync_bound_user_state(item)
        db.commit()
        raise PermissionError("卡密已过期")

    user = _ensure_bound_user(db, item)
    if item.activated_at is None:
        item.activated_at = now
        if item.duration_days and item.duration_days > 0:
            item.expires_at = now + timedelta(days=int(item.duration_days))
    elif item.duration_days and item.duration_days > 0 and item.expires_at is None:
        item.expires_at = item.activated_at + timedelta(days=int(item.duration_days))

    if _is_expired(item, now):
        _sync_bound_user_state(item)
        db.commit()
        raise PermissionError("卡密已过期")

    item.last_used_at = now
    item.activation_count = int(item.activation_count or 0) + 1
    user.last_login = now
    _sync_bound_user_state(item)
    db.commit()
    db.refresh(user)
    db.refresh(item)
    return user, item


def get_license_for_user(db: Session, user_id: str) -> LicenseKey | None:
    return (
        db.query(LicenseKey)
        .filter(LicenseKey.bound_user_id == user_id)
        .order_by(LicenseKey.updated_at.desc())
        .first()
    )


def list_license_keys(db: Session) -> list[LicenseKey]:
    return db.query(LicenseKey).order_by(LicenseKey.created_at.desc()).all()


def build_stats(db: Session) -> dict[str, int]:
    now = _now()
    users = db.query(User).all()
    license_keys = db.query(LicenseKey).all()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    return {
        "total_users": len(users),
        "active_users": sum(1 for item in users if item.is_active),
        "admin_users": sum(1 for item in users if item.is_admin),
        "new_users_today": sum(1 for item in users if item.created_at and item.created_at >= today),
        "total_license_keys": len(license_keys),
        "active_license_keys": sum(
            1 for item in license_keys if item.status == "active" and not _is_expired(item, now)
        ),
        "disabled_license_keys": sum(1 for item in license_keys if item.status != "active"),
        "used_license_keys": sum(1 for item in license_keys if item.bound_user_id or int(item.activation_count or 0) > 0),
        "expired_license_keys": sum(1 for item in license_keys if _is_expired(item, now)),
    }


def generate_license_keys(
    db: Session,
    *,
    quantity: int,
    name_prefix: str = "",
    duration_days: int | None = None,
    note: str = "",
    is_admin: bool = False,
) -> list[LicenseKey]:
    count = max(1, min(200, int(quantity)))
    normalized_prefix = (name_prefix or "").strip()
    normalized_note = (note or "").strip()
    created: list[LicenseKey] = []

    for index in range(count):
        card_key = generate_card_key()
        while db.query(LicenseKey).filter(LicenseKey.card_key == card_key).first() is not None:
            card_key = generate_card_key()

        name = normalized_prefix
        if normalized_prefix and count > 1:
            name = f"{normalized_prefix}-{index + 1:03d}"

        item = LicenseKey(
            card_key=card_key,
            name=name,
            note=normalized_note,
            status="active",
            duration_days=duration_days,
            is_admin=bool(is_admin),
        )
        db.add(item)
        created.append(item)

    db.commit()
    for item in created:
        db.refresh(item)
    return created


def update_license_key(
    db: Session,
    item: LicenseKey,
    *,
    name: str | None = None,
    note: str | None = None,
    status: str | None = None,
    duration_days: int | None = None,
    is_admin: bool | None = None,
) -> LicenseKey:
    if name is not None:
        item.name = name.strip()
    if note is not None:
        item.note = note.strip()
    if status is not None:
        item.status = "active" if status == "active" else "disabled"
    if duration_days is not None:
        item.duration_days = duration_days
        if item.activated_at and duration_days > 0:
            item.expires_at = item.activated_at + timedelta(days=int(duration_days))
        elif duration_days <= 0:
            item.expires_at = None
    if is_admin is not None:
        item.is_admin = bool(is_admin)
    _sync_bound_user_state(item)
    db.commit()
    db.refresh(item)
    return item
