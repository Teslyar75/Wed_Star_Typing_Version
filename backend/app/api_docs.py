"""Документы пилота: список, CRUD, автосохранение с rev, снимки версий, корзина,
шаблоны, экспорт/импорт.

Изоляция только по cookie-пилоту (get_current_pilot). Поля pilot_id из тела не читаем.
Смысл десктопа stamina/docs*.py (v3.8.3). PDF — браузерный Print→PDF (см. docs_io).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_current_pilot
from app.db import Base, get_db
from app import docs_io
from app.pilots import Pilot

router = APIRouter(prefix="/api/docs", tags=["docs"])

VERSION_EVERY = timedelta(minutes=10)
VERSION_KEEP = 20
TITLE_MAX = 512
BODY_MAX = 1_500_000
IMPORT_MAX = 8_000_000

SORT_KEYS = ("updated", "created", "title")


class PilotDoc(Base):
    __tablename__ = "pilot_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(TITLE_MAX), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    rev: Mapped[int] = mapped_column(Integer, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PilotDocVersion(Base):
    __tablename__ = "pilot_doc_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("pilot_docs.id", ondelete="CASCADE"), index=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    rev: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(TITLE_MAX), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(default="", max_length=TITLE_MAX)
    body: str = Field(default="", max_length=BODY_MAX)


class DocSaveIn(DocIn):
    rev: int = Field(ge=1)


class RestoreIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version_id: int


def _words(body: str) -> int:
    return len(body.split()) if body.strip() else 0


def _out(row: PilotDoc) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "body": row.body,
        "rev": row.rev,
        "words": _words(row.body),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _list_item(r: PilotDoc) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "rev": r.rev,
        "words": _words(r.body),
        "snippet": " ".join((r.body or "").split())[:120],
        "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _owned(db: Session, pilot: Pilot, doc_id: int, *, allow_trashed: bool = False) -> PilotDoc:
    row = db.get(PilotDoc, doc_id)
    if row is None or row.pilot_id != pilot.id:
        raise HTTPException(404, "document not found")
    if row.deleted_at is not None and not allow_trashed:
        raise HTTPException(404, "document not found")
    return row


def _snapshot(db: Session, row: PilotDoc, *, force: bool = False) -> None:
    last = (
        db.query(PilotDocVersion)
        .filter(PilotDocVersion.doc_id == row.id, PilotDocVersion.pilot_id == row.pilot_id)
        .order_by(PilotDocVersion.created_at.desc(), PilotDocVersion.id.desc())
        .first()
    )
    now = datetime.now(timezone.utc)
    if last and not force:
        at = last.created_at
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        if now - at < VERSION_EVERY:
            return
    db.add(
        PilotDocVersion(
            doc_id=row.id,
            pilot_id=row.pilot_id,
            rev=row.rev,
            title=row.title,
            body=row.body,
        )
    )
    db.flush()
    extra = (
        db.query(PilotDocVersion)
        .filter(PilotDocVersion.doc_id == row.id, PilotDocVersion.pilot_id == row.pilot_id)
        .order_by(PilotDocVersion.created_at.desc(), PilotDocVersion.id.desc())
        .offset(VERSION_KEEP)
        .all()
    )
    for old in extra:
        db.delete(old)


def _match_query(row: PilotDoc, q: str) -> bool:
    words = q.lower().split()
    if not words:
        return True
    hay = f"{row.title}\n{row.body}".lower()
    return all(w in hay for w in words)


def _sort_rows(rows: list[PilotDoc], sort: str) -> list[PilotDoc]:
    if sort == "title":
        return sorted(rows, key=lambda r: (r.title or "").casefold())
    if sort == "created":
        return sorted(
            rows,
            key=lambda r: (r.created_at or datetime.min.replace(tzinfo=timezone.utc), r.id),
            reverse=True,
        )
    return sorted(
        rows,
        key=lambda r: (r.updated_at or datetime.min.replace(tzinfo=timezone.utc), r.id),
        reverse=True,
    )


@router.get("/templates")
def list_templates(lang: str = Query(default="ru")) -> dict:
    """Шаблоны как desktop docs_templates — ключи стабильные, подписи по lang."""
    L = (lang or "ru").lower()[:2]
    labels = {
        "ru": {
            "meeting": ("Заметки встречи", "Встреча", "Участники", "Обсудили", "Решения", "Задачи"),
            "todo": ("Список дел", "Дела"),
            "book": ("Конспект книги", "Конспект", "Автор", "Главное", "Цитаты", "Мои мысли"),
            "diary": ("Дневник", "", "Что было", "Что получилось", "Что завтра"),
            "table": ("Таблица", "Таблица", "Что", "Сколько", "Заметка"),
        },
        "en": {
            "meeting": ("Meeting notes", "Meeting", "Attendees", "Discussed", "Decisions", "Tasks"),
            "todo": ("To-do list", "Tasks"),
            "book": ("Book notes", "Notes", "Author", "Key points", "Quotes", "My thoughts"),
            "diary": ("Diary", "", "What happened", "What worked", "Tomorrow"),
            "table": ("Table", "Table", "What", "How many", "Note"),
        },
        "uk": {
            "meeting": ("Нотатки зустрічі", "Зустріч", "Учасники", "Обговорили", "Рішення", "Завдання"),
            "todo": ("Список справ", "Справи"),
            "book": ("Конспект книги", "Конспект", "Автор", "Головне", "Цитати", "Мої думки"),
            "diary": ("Щоденник", "", "Що було", "Що вийшло", "Що завтра"),
            "table": ("Таблиця", "Таблиця", "Що", "Скільки", "Нотатка"),
        },
        "de": {
            "meeting": ("Besprechungsnotizen", "Besprechung", "Teilnehmer", "Besprochen", "Beschlüsse", "Aufgaben"),
            "todo": ("Aufgabenliste", "Aufgaben"),
            "book": ("Buchnotizen", "Notizen", "Autor", "Wesentliches", "Zitate", "Meine Gedanken"),
            "diary": ("Tagebuch", "", "Was war", "Was gelang", "Morgen"),
            "table": ("Tabelle", "Tabelle", "Was", "Wieviel", "Notiz"),
        },
    }
    pack = labels.get(L) or labels["en"]
    m = pack["meeting"]
    t = pack["todo"]
    b = pack["book"]
    d = pack["diary"]
    tb = pack["table"]
    items = [
        {
            "id": "meeting",
            "label": m[0],
            "title": m[1],
            "body": f"## {m[2]}\n- \n\n## {m[3]}\n- \n\n## {m[4]}\n- \n\n## {m[5]}\n- [ ] \n",
        },
        {"id": "todo", "label": t[0], "title": t[1], "body": "- [ ] \n- [ ] \n- [ ] \n"},
        {
            "id": "book",
            "label": b[0],
            "title": b[1],
            "body": f"**{b[2]}:** \n\n## {b[3]}\n- \n\n## {b[4]}\n> \n\n## {b[5]}\n",
        },
        {
            "id": "diary",
            "label": d[0],
            "title": d[1],
            "body": f"## {d[2]}\n\n## {d[3]}\n- \n\n## {d[4]}\n- [ ] \n",
        },
        {
            "id": "table",
            "label": tb[0],
            "title": tb[1],
            "body": f"| {tb[2]} | {tb[3]} | {tb[4]} |\n|---|---|---|\n| | | |\n| | | |\n",
        },
    ]
    return {"items": items}


@router.get("")
def list_docs(
    trash: bool = Query(default=False),
    sort: str = Query(default="updated"),
    q: str = Query(default=""),
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    if sort not in SORT_KEYS:
        sort = "updated"
    rows = db.query(PilotDoc).filter(PilotDoc.pilot_id == pilot.id).all()
    if trash:
        rows = [r for r in rows if r.deleted_at is not None]
        rows = sorted(
            rows,
            key=lambda r: (r.deleted_at or datetime.min.replace(tzinfo=timezone.utc), r.id),
            reverse=True,
        )
    else:
        rows = [r for r in rows if r.deleted_at is None]
        rows = _sort_rows(rows, sort)
    if q.strip():
        rows = [r for r in rows if _match_query(r, q)]
    return {"items": [_list_item(r) for r in rows], "sort": sort, "trash": trash}


@router.post("")
def create_doc(
    body: DocIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    row = PilotDoc(pilot_id=pilot.id, title=body.title.strip(), body=body.body, rev=1)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.post("/import")
async def import_doc(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    name = file.filename or "doc.txt"
    raw = await file.read()
    if len(raw) > IMPORT_MAX:
        raise HTTPException(413, "file too large")
    try:
        title, body = docs_io.import_bytes(name, raw)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"import failed: {e}") from e
    if len(body) > BODY_MAX:
        raise HTTPException(413, "body too large")
    row = PilotDoc(pilot_id=pilot.id, title=(title or "")[:TITLE_MAX], body=body, rev=1)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/{doc_id}")
def get_doc(doc_id: int, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    return _out(_owned(db, pilot, doc_id))


@router.put("/{doc_id}")
def save_doc(
    doc_id: int,
    body: DocSaveIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    row = _owned(db, pilot, doc_id)
    if body.rev != row.rev:
        raise HTTPException(status_code=409, detail={"code": "conflict", "doc": _out(row)})
    _snapshot(db, row, force=False)
    row.title = body.title.strip()
    row.body = body.body
    row.rev = row.rev + 1
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{doc_id}")
def trash_doc(doc_id: int, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    row = _owned(db, pilot, doc_id)
    row.deleted_at = datetime.now(timezone.utc)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "deleted_at": row.deleted_at.isoformat()}


@router.post("/{doc_id}/restore-trash")
def restore_trash(doc_id: int, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    row = _owned(db, pilot, doc_id, allow_trashed=True)
    if row.deleted_at is None:
        return _out(row)
    row.deleted_at = None
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{doc_id}/purge")
def purge_doc(doc_id: int, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    row = _owned(db, pilot, doc_id, allow_trashed=True)
    if row.deleted_at is None:
        raise HTTPException(400, "purge: only from trash")
    db.query(PilotDocVersion).filter(PilotDocVersion.doc_id == row.id).delete()
    db.delete(row)
    db.commit()
    return {"ok": True, "id": doc_id}


@router.get("/{doc_id}/export")
def export_doc(
    doc_id: int,
    fmt: str = Query(default="md"),
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> Response:
    row = _owned(db, pilot, doc_id)
    kind = (fmt or "md").lower()
    if kind == "pdf":
        # Ближайший веб-эквивалент — Print→PDF; HTML отдаём как printable.
        data = docs_io.export_html(row.title, row.body)
        filename = _safe_filename(row.title, "html")
        return Response(
            content=data,
            media_type="text/html; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
                "X-Docs-Export-Note": "pdf-via-print",
            },
        )
    if kind not in docs_io.EXPORT_KINDS:
        raise HTTPException(400, f"fmt must be one of {docs_io.EXPORT_KINDS + ('pdf',)}")
    makers = {
        "txt": (docs_io.export_txt, "text/plain; charset=utf-8", "txt"),
        "md": (docs_io.export_md, "text/markdown; charset=utf-8", "md"),
        "html": (docs_io.export_html, "text/html; charset=utf-8", "html"),
        "docx": (
            docs_io.export_docx,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "docx",
        ),
        "stdoc": (docs_io.export_stdoc, "application/zip", "stdoc"),
    }
    fn, mime, ext = makers[kind]
    if kind == "stdoc":
        data = fn(
            row.title,
            row.body,
            created=row.created_at.isoformat() if row.created_at else None,
            modified=row.updated_at.isoformat() if row.updated_at else None,
        )
    else:
        data = fn(row.title, row.body)
    filename = _safe_filename(row.title, ext)
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/{doc_id}/versions")
def list_versions(
    doc_id: int, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)
) -> dict:
    row = _owned(db, pilot, doc_id)
    vers = (
        db.query(PilotDocVersion)
        .filter(PilotDocVersion.doc_id == row.id, PilotDocVersion.pilot_id == pilot.id)
        .order_by(PilotDocVersion.created_at.desc(), PilotDocVersion.id.desc())
        .limit(VERSION_KEEP)
        .all()
    )
    return {
        "items": [
            {
                "id": v.id,
                "rev": v.rev,
                "title": v.title,
                "words": _words(v.body),
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in vers
        ]
    }


@router.post("/{doc_id}/restore")
def restore_version(
    doc_id: int,
    body: RestoreIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    row = _owned(db, pilot, doc_id)
    ver = db.get(PilotDocVersion, body.version_id)
    if ver is None or ver.doc_id != row.id or ver.pilot_id != pilot.id:
        raise HTTPException(404, "version not found")
    _snapshot(db, row, force=True)
    row.title = ver.title
    row.body = ver.body
    row.rev = row.rev + 1
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _out(row)


def _safe_filename(title: str, ext: str) -> str:
    keep = "".join(ch if ch.isalnum() or ch in " -_" else " " for ch in title).strip()
    base = re.sub(r"\s+", " ", keep)[:48] or "doc"
    return f"{base}.{ext}"
