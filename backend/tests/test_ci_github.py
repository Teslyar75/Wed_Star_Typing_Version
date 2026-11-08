"""Страховка, чтобы GitHub CI не краснел из-за досева и портов Docker."""

from __future__ import annotations

from pathlib import Path

from app.api_english import _ensure_seeded_for
from app.db import SessionLocal, engine


ROOT = Path(__file__).resolve().parents[2]


def test_compose_web_port_interpolated() -> None:
    text = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert '"${WEB_PORT:-80}:80"' in text
    assert '"${WEB_HTTPS_PORT:-443}:443"' in text


def test_start_sh_drops_caddy_before_8080_retry() -> None:
    text = (ROOT / "start.sh").read_text(encoding="utf-8")
    assert "docker compose rm -f caddy" in text
    busy = text.index("port is already allocated")
    rm = text.index("docker compose rm -f caddy")
    retry = text.index("PORT=8080")
    assert busy < rm < retry


def test_sqlite_uses_null_pool() -> None:
    from sqlalchemy.pool import NullPool

    if str(engine.url).startswith("sqlite"):
        assert isinstance(engine.pool, NullPool)
    else:
        assert engine.pool._pre_ping is True  # noqa: SLF001


def test_ensure_seeded_skips_when_ci(monkeypatch) -> None:
    """В GitHub Actions CI=1 — досев на запросе не должен трогать БД."""
    monkeypatch.setenv("CI", "1")
    db = SessionLocal()
    try:
        # ранний return: без таблиц не упадём (иначе был бы OperationalError).
        _ensure_seeded_for(db, 1000, need_dev=True)
    finally:
        db.close()


def test_e2e_seed_is_tiny_and_done() -> None:
    from app.api_english import FALLBACK_SEED, VocabWord, _seed_vocab_body
    from app.db import SessionLocal, engine

    VocabWord.__table__.create(bind=engine, checkfirst=True)
    db = SessionLocal()
    try:
        first = _seed_vocab_body(db, 20000, 400, e2e=True)
        assert first["done"] is True
        assert 1 <= first["total"] <= len(FALLBACK_SEED)
        second = _seed_vocab_body(db, 20580, 200, e2e=True)
        assert second["done"] is True
        assert second["total"] == first["total"]
    finally:
        db.close()
