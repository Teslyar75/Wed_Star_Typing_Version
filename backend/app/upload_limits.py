"""Лимиты размера загрузок: потоковое чтение с обрывом → 413."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile

from app.config import settings


async def read_upload_limited(
    file: UploadFile,
    *,
    max_bytes: int | None = None,
    label: str = "file",
) -> bytes:
    """Читать UploadFile чанками; при превышении — HTTP 413."""
    limit = int(max_bytes if max_bytes is not None else settings.upload_max_book_bytes)
    if limit <= 0:
        raise HTTPException(413, f"{label} too large")
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                413,
                f"{label} too large (max {limit} bytes)",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def assert_text_len(text: str, *, max_chars: int | None = None, label: str = "text") -> None:
    limit = int(max_chars if max_chars is not None else settings.upload_max_text_chars)
    if len(text or "") > limit:
        raise HTTPException(413, f"{label} too long (max {limit} characters)")
