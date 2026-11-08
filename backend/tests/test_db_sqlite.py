from sqlalchemy import text

from app.db import engine


def test_sqlite_wal_and_busy_timeout() -> None:
    if not str(engine.url).startswith("sqlite"):
        return
    with engine.connect() as conn:
        mode = conn.execute(text("PRAGMA journal_mode")).scalar()
        busy = conn.execute(text("PRAGMA busy_timeout")).scalar()
    assert str(mode).lower() == "wal"
    assert int(busy) >= 30_000
