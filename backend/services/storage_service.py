"""
统一存储服务
支持本地文件系统和 Supabase Storage 两种后端。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import mimetypes
import os
import shutil
import uuid
from urllib.parse import quote, urlparse

import httpx

from config import settings
from utils.file_handler import ensure_dir, generate_date_path, safe_filename


@dataclass
class StoredFile:
    key: str
    reference: str
    public_url: str
    local_path: str | None = None


class StorageService:
    def __init__(self):
        self.backend = (settings.STORAGE_BACKEND or "local").strip().lower()
        self.supabase_url = settings.SUPABASE_URL.rstrip("/")
        self.supabase_bucket = (settings.SUPABASE_STORAGE_BUCKET or "ai-douyin-helper").strip()

    def is_supabase(self) -> bool:
        return self.backend == "supabase"

    def is_local(self) -> bool:
        return not self.is_supabase()

    def category_from_local_dir(self, local_dir: str | None) -> str | None:
        if not local_dir:
            return None
        storage_root = os.path.abspath(settings.STORAGE_DIR)
        target_dir = os.path.abspath(local_dir)
        try:
            if os.path.commonpath([storage_root, target_dir]) != storage_root:
                return None
        except ValueError:
            return None
        rel_path = os.path.relpath(target_dir, storage_root).replace(os.sep, "/").strip("./")
        return rel_path.strip("/") or None

    def build_object_key(self, category: str, filename: str) -> str:
        normalized_category = category.strip("/") or "misc"
        name, ext = os.path.splitext(filename)
        safe_name = safe_filename(name) or f"file_{uuid.uuid4().hex[:8]}"
        date_path = datetime.utcnow().strftime("%Y/%m/%d")
        return f"{normalized_category}/{date_path}/{safe_name}{ext}"

    def public_url_for_key(self, key: str) -> str:
        normalized_key = key.lstrip("/")
        if self.is_supabase():
            if not self.supabase_url:
                raise RuntimeError("缺少 SUPABASE_URL，无法生成对象存储地址")
            return (
                f"{self.supabase_url}/storage/v1/object/public/"
                f"{self.supabase_bucket}/{quote(normalized_key, safe='/')}"
            )

        base_url = settings.STORAGE_PUBLIC_BASE_URL.rstrip("/")
        path = f"/storage/{normalized_key}"
        return f"{base_url}{path}" if base_url else path

    def local_path_for_key(self, key: str) -> str:
        return os.path.join(settings.STORAGE_DIR, *key.strip("/").split("/"))

    def _guess_content_type(self, filename: str, content_type: str | None = None) -> str:
        if content_type:
            return content_type
        guessed, _ = mimetypes.guess_type(filename)
        return guessed or "application/octet-stream"

    def _derive_key_from_existing_local_path(self, local_path: str) -> str | None:
        storage_root = os.path.abspath(settings.STORAGE_DIR)
        abs_path = os.path.abspath(local_path)
        try:
            if os.path.commonpath([storage_root, abs_path]) != storage_root:
                return None
        except ValueError:
            return None
        rel_path = os.path.relpath(abs_path, storage_root).replace(os.sep, "/")
        return rel_path.strip("/")

    def _upload_bytes_to_supabase(self, key: str, data: bytes, content_type: str) -> None:
        service_role_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
        if not self.supabase_url or not service_role_key or not self.supabase_bucket:
            raise RuntimeError("Supabase Storage 未配置完整，请检查 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET")

        upload_url = (
            f"{self.supabase_url}/storage/v1/object/"
            f"{self.supabase_bucket}/{quote(key.lstrip('/'), safe='/')}"
        )
        headers = {
            "Authorization": f"Bearer {service_role_key}",
            "apikey": service_role_key,
            "x-upsert": "true",
            "Content-Type": content_type,
        }

        with httpx.Client(timeout=300.0) as client:
            response = client.post(upload_url, headers=headers, content=data)
        if response.status_code >= 400:
            try:
                error_body = response.json()
            except Exception:
                error_body = response.text
            raise RuntimeError(f"Supabase Storage 上传失败: {error_body}")

    def store_bytes(
        self,
        category: str,
        filename: str,
        data: bytes,
        content_type: str | None = None,
        key: str | None = None,
    ) -> StoredFile:
        object_key = key or self.build_object_key(category, filename)
        final_content_type = self._guess_content_type(filename, content_type)

        if self.is_supabase():
            self._upload_bytes_to_supabase(object_key, data, final_content_type)
            public_url = self.public_url_for_key(object_key)
            return StoredFile(
                key=object_key,
                reference=public_url,
                public_url=public_url,
                local_path=None,
            )

        local_path = self.local_path_for_key(object_key)
        ensure_dir(os.path.dirname(local_path))
        with open(local_path, "wb") as file_obj:
            file_obj.write(data)

        public_url = self.public_url_for_key(object_key)
        return StoredFile(
            key=object_key,
            reference=public_url,
            public_url=public_url,
            local_path=local_path,
        )

    def store_file(
        self,
        category: str,
        local_path: str,
        filename: str | None = None,
        content_type: str | None = None,
        key: str | None = None,
    ) -> StoredFile:
        target_filename = filename or os.path.basename(local_path)
        object_key = key or self._derive_key_from_existing_local_path(local_path) or self.build_object_key(category, target_filename)

        if self.is_supabase():
            with open(local_path, "rb") as file_obj:
                return self.store_bytes(
                    category=category,
                    filename=target_filename,
                    data=file_obj.read(),
                    content_type=content_type,
                    key=object_key,
                )

        target_path = self.local_path_for_key(object_key)
        ensure_dir(os.path.dirname(target_path))
        if os.path.abspath(local_path) != os.path.abspath(target_path):
            shutil.copy2(local_path, target_path)

        public_url = self.public_url_for_key(object_key)
        return StoredFile(
            key=object_key,
            reference=public_url,
            public_url=public_url,
            local_path=target_path,
        )

    def _resolve_local_storage_url(self, source: str) -> str | None:
        parsed = urlparse(source)
        path = parsed.path if parsed.scheme in ("http", "https") else source
        if path.startswith("/storage/"):
            rel_path = path.removeprefix("/storage/")
            return self.local_path_for_key(rel_path)
        return None

    def download_to_local(self, source: str, preferred_name: str | None = None) -> str:
        if not source:
            raise FileNotFoundError("文件地址为空")

        local_storage_path = self._resolve_local_storage_url(source)
        if local_storage_path and os.path.exists(local_storage_path):
            return local_storage_path

        if os.path.exists(source):
            return source

        parsed = urlparse(source)
        if parsed.scheme not in ("http", "https"):
            raise FileNotFoundError(f"文件不存在: {source}")

        temp_dir = generate_date_path(settings.TEMP_DIR)
        raw_name = preferred_name or os.path.basename(parsed.path) or f"remote_{uuid.uuid4().hex[:8]}"
        name, ext = os.path.splitext(raw_name)
        safe_name = safe_filename(name) or f"remote_{uuid.uuid4().hex[:8]}"
        target_path = os.path.join(temp_dir, f"{safe_name}{ext}")

        with httpx.Client(timeout=300.0, follow_redirects=True) as client:
            response = client.get(source)
        response.raise_for_status()
        with open(target_path, "wb") as file_obj:
            file_obj.write(response.content)
        return target_path


storage_service = StorageService()
