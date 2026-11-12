"""SQLAlchemy engine / session (SQLite по умолчанию, Postgres через DATABASE_URL)."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings


class Base(DeclarativeBase):
    pass


def _engine_url() -> str:
    return settings.database_url


def _is_sqlite() -> bool:
    return _engine_url().startswith("sqlite")


# timeout — sqlite3 busy wait (сек): фон-досев словаря не должен ронять register/login.
# NullPool: sqlite + QueuePool(5+10) в e2e/UI держит JSON-досев и съедает пул.
_connect_args = {"check_same_thread": False, "timeout": 30} if _is_sqlite() else {}
_engine_kwargs: dict = {"connect_args": _connect_args, "pool_pre_ping": True}
if _is_sqlite():
    _engine_kwargs["poolclass"] = NullPool
engine = create_engine(_engine_url(), **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

if _is_sqlite():

    @event.listens_for(engine, "connect")
    def _sqlite_on_connect(dbapi_conn, _connection_record) -> None:  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.fetchall()
        cur.execute("PRAGMA busy_timeout=30000")
        cur.fetchall()
        cur.close()


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
    from app import api_radio as _radio  # noqa: F401
    from app import api_lounge as _lounge  # noqa: F401
    from app import api_import as _imp  # noqa: F401
    from app import api_portal as _portal  # noqa: F401
    from app import api_docs as _docs  # noqa: F401
    from app import api_comm as _comm  # noqa: F401
    from app import api_monkeytype as _mt  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_columns()


def _ensure_columns() -> None:
    """ALTER для уже существующих БД (create_all не добавляет колонки). SQLite + Postgres."""
    alters = [
        ("card_progress", "bin", "VARCHAR(32) DEFAULT 'inbox'"),
        ("card_progress", "english_xp", "INTEGER DEFAULT 0"),
        ("pilots", "avatar_data", "TEXT DEFAULT ''"),
        ("pilots", "is_guest", "BOOLEAN DEFAULT FALSE" if not _engine_url().startswith("sqlite") else "BOOLEAN DEFAULT 0"),
        ("texts", "prepared", "TEXT DEFAULT ''"),
        ("texts", "prep_opts", "VARCHAR(256) DEFAULT ''"),
        ("vocab_words", "slug", "VARCHAR(80) DEFAULT ''"),
        ("vocab_words", "rank", "INTEGER DEFAULT 0"),
        ("vocab_words", "meta", "TEXT DEFAULT ''"),
        ("card_progress", "known", "INTEGER DEFAULT 0"),
        ("card_progress", "my_tr", "VARCHAR(256) DEFAULT ''"),
        ("card_progress", "wh_state", "VARCHAR(16) DEFAULT ''"),
        ("card_progress", "wh_runs", "INTEGER DEFAULT 0"),
        ("card_progress", "wh_goal", "INTEGER DEFAULT 2"),
        ("card_progress", "wh_stars", "INTEGER DEFAULT 0"),
        ("orion_prefs", "active_agent", "VARCHAR(40) DEFAULT ''"),
        ("orion_agents", "note", "VARCHAR(200) DEFAULT ''"),
        ("orion_agents", "voice", "VARCHAR(16) DEFAULT 'ship'"),
        ("card_progress", "wh_run", "TEXT DEFAULT ''"),
        ("card_progress", "wh_avg", "DOUBLE PRECISION DEFAULT 0" if not _engine_url().startswith("sqlite") else "FLOAT DEFAULT 0"),
        ("card_progress", "wh_q", "TEXT DEFAULT ''"),
        ("pilot_docs", "deleted_at", "TIMESTAMP"),
        ("comm_messages", "images_json", "TEXT DEFAULT '[]'"),
    ]
    url = _engine_url()
    with engine.begin() as conn:
        if url.startswith("sqlite"):
            for table, col, typedef in alters:
                rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                names = {r[1] for r in rows}
                if col not in names:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}"))
            return

        # Postgres
        for table, col, typedef in alters:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = :c"
                ),
                {"t": table, "c": col},
            ).fetchone()
            if not exists:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{col}" {typedef}'))
