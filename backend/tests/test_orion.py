import uuid

import pytest
from fastapi.testclient import TestClient

from app import api_orion
from app.config import settings
from app.db import init_db
from app.main import app

init_db()


def _pilot() -> tuple[TestClient, str]:
    c = TestClient(app)
    cs = f"OR-{uuid.uuid4().hex[:6]}"
    r = c.post("/api/pilots/register", json={"callsign": cs, "pin": "4321"})
    c.cookies.set("st_token", r.cookies["st_token"])
    return c, cs


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(settings, "orion_admin_token", "adm-test-token")
    monkeypatch.setattr(settings, "orion_chat_rate_per_min", 1000)
    api_orion._hits.clear()


ADM = {"X-Orion-Admin": "adm-test-token"}


def test_color_for_continuous() -> None:
    assert api_orion.color_for(0) == "#d96a5f"
    assert api_orion.color_for(100) == "#6fbf73"
    assert api_orion.color_for(12.5) not in ("#d96a5f", "#e39355")
    assert api_orion.color_for("x") == "#d96a5f"


def test_guide_default_anon() -> None:
    c = TestClient(app)
    cfg = c.get("/api/orion/config").json()
    assert cfg["mode"] == "guide" and cfg["byo_storage"] == "client"
    r = c.post("/api/orion/chat", json={"text": "как включить радио?"}).json()
    assert r["mode_used"] == "guide" and "Радио" in r["reply"]


def test_byo_fallback_and_key_not_stored(monkeypatch) -> None:
    c, _ = _pilot()
    assert c.put("/api/orion/mode", json={"mode": "byo"}).status_code == 200
    seen = {}

    def fake(provider, base, model, key, history, text, images, vision, check_url):
        seen["key"] = key
        return "ответ агента"

    monkeypatch.setattr(api_orion, "call_provider", fake)
    body = {"text": "привет", "byo": {"base_url": "https://api.example.com/v1", "model": "m"}}
    r = c.post("/api/orion/chat", json=body, headers={"X-Orion-Key": "sk-secret-123"}).json()
    assert r["reply"] == "ответ агента" and r["mode_used"] == "byo" and seen["key"] == "sk-secret-123"
    # без ключа — фолбэк в гида
    r = c.post("/api/orion/chat", json=body).json()
    assert r["fallback"] is True and r["mode_used"] == "guide" and r["reason"] == "byo_not_configured"
    # ошибка провайдера — фолбэк
    def boom(*a, **k):
        raise api_orion.ProviderError("http_500")
    monkeypatch.setattr(api_orion, "call_provider", boom)
    r = c.post("/api/orion/chat", json=body, headers={"X-Orion-Key": "sk-secret-123"}).json()
    assert r["fallback"] and r["reason"] == "http_500"
    msgs = c.get("/api/orion/messages").json()["items"]
    assert msgs and all("sk-secret" not in m["text"] for m in msgs)


def test_byo_url_guard(monkeypatch) -> None:
    monkeypatch.setattr(settings, "orion_byo_allow_http", False)
    monkeypatch.setattr(settings, "orion_byo_allow_private", False)
    with pytest.raises(api_orion.ProviderError):
        api_orion._safe_url("http://example.com")
    with pytest.raises(api_orion.ProviderError):
        api_orion._safe_url("https://127.0.0.1/v1")


def test_hosted_gate(monkeypatch) -> None:
    c, cs = _pilot()
    monkeypatch.setattr(settings, "orion_hosted_enabled", True)
    monkeypatch.setattr(settings, "orion_llm_base_url", "https://llm.example.com/v1")
    monkeypatch.setattr(settings, "orion_llm_model", "m")
    monkeypatch.setattr(settings, "orion_llm_api_key", "k")
    hosted = {m["id"]: m for m in c.get("/api/orion/config").json()["modes"]}["hosted"]
    assert not hosted["available"] and hosted["reason"] == "supporter_only"
    assert c.put("/api/orion/mode", json={"mode": "hosted"}).status_code == 403
    assert c.post("/api/orion/admin/role", json={"callsign": cs, "role": "supporter"}).status_code == 403
    assert c.post("/api/orion/admin/role", json={"callsign": cs, "role": "supporter"}, headers=ADM).status_code == 200
    assert c.put("/api/orion/mode", json={"mode": "hosted"}).status_code == 200
    monkeypatch.setattr(api_orion, "call_provider", lambda *a, **k: "hosted ok")
    assert c.post("/api/orion/chat", json={"text": "hi"}).json()["mode_used"] == "hosted"
    # админ выключил — фолбэк
    c.put("/api/orion/admin/settings", json={"hosted_enabled": False}, headers=ADM)
    assert c.post("/api/orion/chat", json={"text": "hi"}).json()["mode_used"] == "guide"
    c.put("/api/orion/admin/settings", json={"hosted_enabled": True}, headers=ADM)


def test_contributor_skeleton(monkeypatch) -> None:
    c, cs = _pilot()
    monkeypatch.setattr(settings, "orion_contrib_enabled", False)
    assert c.post("/api/orion/proposals", json={"title": "x"}).status_code == 403
    monkeypatch.setattr(settings, "orion_contrib_enabled", True)
    assert c.post("/api/orion/proposals", json={"title": "x"}).json()["detail"] == "contributor_only"
    c.post("/api/orion/admin/role", json={"callsign": cs, "role": "contributor"}, headers=ADM)
    monkeypatch.setattr(settings, "orion_contrib_rate_per_hour", 1)
    p = c.post("/api/orion/proposals", json={"title": "Кнопка", "description": "d"}).json()
    assert p["status"] == "queued" and p["branch"].startswith("orion/proposal-") and p["task_id"]
    assert c.post("/api/orion/proposals", json={"title": "y"}).status_code == 429
    au = c.get("/api/orion/admin/audit", headers=ADM).json()["items"]
    assert any(a["action"] == "proposal.create" for a in au)


def test_tasks_and_archive() -> None:
    c, _ = _pilot()
    t = c.post("/api/orion/tasks", json={"title": "T", "steps": [{"title": "a", "weight": 1},
                                                                   {"title": "b", "weight": 3}]}).json()
    assert t["percent"] == 0 and t["color"] == "#d96a5f"
    t = c.post(f"/api/orion/tasks/{t['id']}/step", json={"index": 1}).json()
    assert t["state"] == "working" and t["percent"] == 75.0
    t = c.post(f"/api/orion/tasks/{t['id']}/finish", json={"state": "done"}).json()
    assert t["percent"] == 100 and t["color"] == "#6fbf73"
    assert any(x["id"] == t["id"] for x in c.get("/api/orion/tasks").json()["items"])
    c.post("/api/orion/chat", json={"text": "расскажи про скорочтение пожалуйста"})
    a = c.get("/api/orion/archive", params={"q": "скорочтение"}).json()["items"]
    assert a and a[0]["match"].lower() == "скорочтение"
