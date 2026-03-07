"""
一次性迁移 backend/storage 历史文件到 Supabase Storage，
并回填数据库中的旧本地路径。

用法示例：
  ./.venv/bin/python scripts/migrate_storage_to_supabase.py --dry-run
  STORAGE_BACKEND=supabase ./.venv/bin/python scripts/migrate_storage_to_supabase.py --yes
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Iterable

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config import settings
from database import SessionLocal, engine
from services.storage_service import storage_service


@dataclass
class FileMapping:
    absolute_path: str
    relative_key: str
    local_url: str
    target_url: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="迁移 backend/storage 历史文件到 Supabase，并回填数据库旧路径。"
    )
    parser.add_argument(
        "--storage-root",
        default=None,
        help="要扫描的存储根目录，默认使用 backend/storage。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只扫描和预览，不上传、不写数据库。",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="跳过执行前确认。",
    )
    return parser.parse_args()


def normalize_slashes(value: str) -> str:
    return value.replace("\\", "/")


def build_file_mappings(storage_root: Path) -> dict[str, FileMapping]:
    mappings: dict[str, FileMapping] = {}
    base_storage_url = settings.STORAGE_PUBLIC_BASE_URL.rstrip("/")

    for path in sorted(storage_root.rglob("*")):
        if not path.is_file():
            continue

        absolute_path = str(path.resolve())
        relative_key = normalize_slashes(str(path.relative_to(storage_root)))
        local_url = f"/storage/{relative_key}"
        target_url = storage_service.public_url_for_key(relative_key)

        entry = FileMapping(
            absolute_path=absolute_path,
            relative_key=relative_key,
            local_url=local_url,
            target_url=target_url,
        )

        for alias in {
            absolute_path,
            normalize_slashes(absolute_path),
            str(path),
            normalize_slashes(str(path)),
            local_url,
            relative_key,
            f"storage/{relative_key}",
            f"./storage/{relative_key}",
            f"{base_storage_url}{local_url}" if base_storage_url else "",
        }:
            if not alias:
                continue
            mappings[alias] = entry

    return mappings


def migrate_files(
    storage_root: Path,
    file_entries: Iterable[FileMapping],
    dry_run: bool,
) -> tuple[int, int, set[str]]:
    uploaded = 0
    failed = 0
    migrated_keys: set[str] = set()

    for entry in file_entries:
        if dry_run:
            migrated_keys.add(entry.relative_key)
            continue

        source_path = storage_root / entry.relative_key
        try:
            storage_service.store_file(
                category="legacy",
                local_path=str(source_path),
                filename=source_path.name,
                key=entry.relative_key,
            )
            uploaded += 1
            migrated_keys.add(entry.relative_key)
        except Exception as error:
            failed += 1
            print(f"[upload-failed] {entry.relative_key}: {error}")

    return uploaded, failed, migrated_keys


def resolve_new_url(value: str | None, mappings: dict[str, FileMapping]) -> tuple[str | None, bool]:
    if not value:
        return value, False

    normalized = normalize_slashes(value.strip())
    entry = mappings.get(normalized)
    if entry:
        return entry.target_url, entry.target_url != value

    return value, False


def update_products(db: Session, mappings: dict[str, FileMapping], dry_run: bool) -> tuple[int, int]:
    inspector = inspect(engine)
    if not inspector.has_table("products"):
        return 0, 0

    columns = {column["name"] for column in inspector.get_columns("products")}
    if "id" not in columns or "product_images" not in columns:
        return 0, 0

    updated_rows = 0
    updated_values = 0

    rows = db.execute(text("SELECT id, product_images FROM products")).mappings().all()
    for product in rows:
        if not product["product_images"]:
            continue

        try:
            images = json.loads(product["product_images"])
        except Exception:
            continue

        if not isinstance(images, list):
            continue

        next_images: list[str] = []
        changed = False
        for item in images:
            if not isinstance(item, str):
                next_images.append(item)
                continue
            next_value, was_changed = resolve_new_url(item, mappings)
            next_images.append(next_value or item)
            if was_changed:
                updated_values += 1
                changed = True

        if changed:
            updated_rows += 1
            if not dry_run:
                db.execute(
                    text("UPDATE products SET product_images = :product_images WHERE id = :id"),
                    {
                        "id": product["id"],
                        "product_images": json.dumps(next_images, ensure_ascii=False),
                    },
                )

    return updated_rows, updated_values


def update_videos(db: Session, mappings: dict[str, FileMapping], dry_run: bool) -> tuple[int, int]:
    inspector = inspect(engine)
    if not inspector.has_table("videos"):
        return 0, 0

    columns = {column["name"] for column in inspector.get_columns("videos")}
    selectable = [column for column in ("id", "local_path", "thumbnail") if column in columns]
    if "id" not in selectable or len(selectable) == 1:
        return 0, 0

    updated_rows = 0
    updated_values = 0

    rows = db.execute(text(f"SELECT {', '.join(selectable)} FROM videos")).mappings().all()
    for video in rows:
        changed = False

        next_local_path, local_changed = resolve_new_url(video.get("local_path"), mappings)
        next_thumbnail, thumb_changed = resolve_new_url(video.get("thumbnail"), mappings)

        update_payload = {"id": video["id"]}
        update_sets: list[str] = []

        if local_changed:
            updated_values += 1
            changed = True
            if not dry_run:
                update_payload["local_path"] = next_local_path
                update_sets.append("local_path = :local_path")

        if thumb_changed:
            updated_values += 1
            changed = True
            if not dry_run:
                update_payload["thumbnail"] = next_thumbnail
                update_sets.append("thumbnail = :thumbnail")

        if changed:
            updated_rows += 1
            if not dry_run and update_sets:
                db.execute(
                    text(f"UPDATE videos SET {', '.join(update_sets)} WHERE id = :id"),
                    update_payload,
                )

    return updated_rows, updated_values


def main() -> int:
    args = parse_args()
    storage_root = Path(args.storage_root).resolve() if args.storage_root else (BASE_DIR / "storage").resolve()

    if not storage_root.exists():
        print(f"存储目录不存在: {storage_root}")
        return 1

    mappings = build_file_mappings(storage_root)
    unique_entries = sorted({entry.relative_key: entry for entry in mappings.values()}.values(), key=lambda item: item.relative_key)
    print(f"扫描完成：发现 {len(unique_entries)} 个文件，目录 {storage_root}")

    if not args.dry_run and not storage_service.is_supabase():
        print("当前 STORAGE_BACKEND 不是 supabase。正式执行前请设置 STORAGE_BACKEND=supabase。")
        return 1

    if not args.dry_run and not args.yes:
        confirmation = input("将上传历史文件并回填数据库路径，继续吗？输入 yes 继续: ").strip().lower()
        if confirmation != "yes":
            print("已取消。")
            return 1

    uploaded, failed, migrated_keys = migrate_files(storage_root, unique_entries, dry_run=args.dry_run)
    effective_mappings = (
        mappings
        if args.dry_run
        else {alias: entry for alias, entry in mappings.items() if entry.relative_key in migrated_keys}
    )

    db = SessionLocal()
    try:
        product_rows, product_values = update_products(db, effective_mappings, dry_run=args.dry_run)
        video_rows, video_values = update_videos(db, effective_mappings, dry_run=args.dry_run)

        if args.dry_run:
            db.rollback()
        else:
            db.commit()
    finally:
        db.close()

    print(
        json.dumps(
            {
                "dryRun": args.dry_run,
                "storageBackend": storage_service.backend,
                "filesScanned": len(unique_entries),
                "filesUploaded": uploaded,
                "filesFailed": failed,
                "productsUpdated": product_rows,
                "productImageValuesUpdated": product_values,
                "videosUpdated": video_rows,
                "videoFieldsUpdated": video_values,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
