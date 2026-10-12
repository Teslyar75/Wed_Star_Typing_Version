"""SQLAlchemy engine / session (SQLite по умолчанию, Postgres через DATABASE_URL)."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def _engine_url() -> str:
    return settings.database_url


engine = create_engine(
    _engine_url(),
    connect_args={"check_same_thread": False} if _engine_url().startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401
    from app import pilots as _pilots  # noqa: F401
    from app import sessions as _sessions  # noqa: F401
    from app import translate_cache as _tr  # noqa: F401
    from app import api_english as _en  # noqa: F401
    from app import api_speedread as _sr  # noqa: F401
    from app import api_missions as _mi  # noqa: F401
    from app import api_library as _lib  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _sqlite_ensure_columns()


def _sqlite_ensure_columns() -> None:
    """Лёгкие ALTER для уже существующих SQLite-файлов (create_all не добавляет колонки)."""
    if not _engine_url().startswith("sqlite"):
        return
    from sqlalchemy import text

    alters = [
        ("card_progress", "bin", "VARCHAR(32) DEFAULT 'inbox'"),
        ("card_progress", "english_xp", "INTEGER DEFAULT 0"),
    ]
    with engine.begin() as conn:
        for table, col, typedef in alters:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            names = {r[1] for r in rows}
            if col not in names:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}"))
