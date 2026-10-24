"""Зеркало десктопных тестов склада (warehouse.finish_pass / record_sentence / score_word)."""
from types import SimpleNamespace

from app import english_warehouse as wh
from app.english_score import score_word, verdict


def _card(goal=2):
    return SimpleNamespace(wh_goal=goal, wh_runs=0, wh_stars=0, wh_avg=0.0, wh_state="shelf")


def test_constants_match_desktop():
    assert (wh.FLIP_OK, wh.PASS_QUALITY, wh.MAX_DIFF, wh.WORD_KEY) == (80, 85, 3, -1)
    assert wh.PASS_CHOICES == (1, 2, 3, 5) and wh.DEFAULT_PASSES == 2


def test_stars_for_avg():
    assert [wh.stars_for_avg(x) for x in (59, 60, 80, 95)] == [0, 1, 2, 3]


def test_run_complete_needs_word_and_selected():
    sel = [True, False]
    assert not wh.is_run_complete({0: 90}, sel)
    assert not wh.is_run_complete({-1: 90, 0: 79}, sel)
    assert wh.is_run_complete({-1: 80, 0: 80}, sel)
    assert wh.run_average({-1: 80, 0: 90, 1: 10}, sel) == 85.0


def test_selection_keeps_one():
    st = wh.load_state("")
    assert wh.selection(st, 3) == [True, True, True]
    assert wh.set_selection(st, [False, False, False]) == [True, False, False]


def test_weak_pass_cleared():
    st, card = wh.load_state(""), _card(goal=2)
    sel = [True]
    assert wh.finish_pass(card, st, "x", {-1: 80}, sel, 2)["status"] == "incomplete"
    r = wh.finish_pass(card, st, "x", {-1: 80, 0: 84}, sel, 2, today="2026-01-01")
    assert r["status"] == "weak" and st["current"] == {}
    r = wh.finish_pass(card, st, "x", {-1: 90, 0: 90}, sel, 2, today="2026-01-01")
    assert r["status"] == "pass" and r["done"] == 1 and r["xp"] == 2
    r = wh.finish_pass(card, st, "x", {-1: 100, 0: 100}, sel, 2, today="2026-01-01")
    assert r["status"] == "cleared" and card.wh_state == "done"
    assert r["avg"] == 95.0 and r["stars"] == 3 and r["xp"] == 2 + 15
    assert st["passes"] == []


def test_record_sentence_xp_once_per_day():
    st = wh.load_state("")
    assert wh.record_sentence(st, "x", 0, 90, ok=True, today="d") == 3
    assert wh.record_sentence(st, "x", 0, 95, ok=True, today="d") == 0
    assert wh.record_sentence(st, "x", 0, 50, ok=False, today="e") == 0
    assert st["best"]["0"] == 95


def test_score_word_and_verdict():
    assert score_word("run", ["he ran fast"]) == 100  # неправильная форма
    assert score_word("cat", ["kat"], ["kat"]) == 100  # sounds_like
    assert score_word("house", ["mouse"]) == 80
    assert score_word("house", []) == 0
    assert verdict(85) == ("ОТЛИЧНО", "green")
    assert verdict(60) == ("ХОРОШО", "amber")
    assert verdict(59) == ("ЕЩЁ РАЗ", "red")
