"""Автообновление: план pull без обращения к git."""
import os

from tools_loader import load_updater


def test_plan_update_paths(monkeypatch):
    mod = load_updater()
    monkeypatch.delenv("WEB_NO_AUTOUPDATE", raising=False)
    assert mod.plan_update("master", False, "aaa", "bbb") == "pull"
    assert mod.plan_update("master", False, "aaa", "aaa") == "up_to_date"
    assert mod.plan_update("agent/x", False, "aaa", "bbb") == "skip_branch"
    assert mod.plan_update("master", True, "aaa", "bbb") == "skip_dirty"
    assert mod.plan_update("master", False, "aaa", "") == "skip_remote"
    monkeypatch.setenv("WEB_NO_AUTOUPDATE", "1")
    assert mod.plan_update("master", False, "aaa", "bbb") == "skip_env"
