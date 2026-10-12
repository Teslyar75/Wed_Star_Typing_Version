import os

from app.translate_cache import stub_translate, uplink_translate


def test_stub_prefix() -> None:
    assert stub_translate("hello", "en", "ru").startswith("[ru] ")


def test_uplink_offline_env(monkeypatch) -> None:
    monkeypatch.setenv("TRANSLATE_OFFLINE", "1")
    assert uplink_translate("hello world", "en", "ru") == "[ru] hello world"


def test_same_lang_passthrough(monkeypatch) -> None:
    monkeypatch.delenv("TRANSLATE_OFFLINE", raising=False)
    assert uplink_translate("same", "en", "en") == "same"
