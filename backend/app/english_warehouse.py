"""Склад карточек — порт desktop english/warehouse.py (десктоп) один в один.

Прогон: слово + отмеченные предложения (каждое ≥ FLIP_OK), средняя ≥ PASS_QUALITY.
Нужно N качественных прогонов → автоматически в «Отработано» (без ручной кнопки).
Состояние карточки хранится JSON-ом в card_progress.wh_run:
  {"current": {key: score}, "passes": [...], "sel": [bool...], "best": {key: score}, "awards": [...]}
"""
from __future__ import annotations

import datetime as dt
import json

SENT_PASS = 60
FLIP_OK = 80
PASS_QUALITY = 85
MAX_DIFF = 3
PASS_CHOICES = (1, 2, 3, 5)
DEFAULT_PASSES = 2
WORD_KEY = -1


def load_state(raw: str | None) -> dict:
    try:
        st = json.loads(raw or "{}")
    except ValueError:
        st = {}
    if not isinstance(st, dict):
        st = {}
    if not isinstance(st.get("current"), dict):
        st["current"] = {}
    if not isinstance(st.get("passes"), list):
        st["passes"] = []
    if not isinstance(st.get("best"), dict):
        st["best"] = {}
    if not isinstance(st.get("awards"), list):
        st["awards"] = []
    return st


def dump_state(st: dict) -> str:
    return json.dumps(st, ensure_ascii=False)


def award_once(st: dict, key: str) -> bool:
    """Как progress.award_once: один раз на ключ."""
    if key in st["awards"]:
        return False
    st["awards"].append(key)
    return True


def stars_for_avg(avg: float) -> int:
    """Как в миссиях: ★ ≥60%, ★★ ≥80%, ★★★ ≥95%."""
    if avg >= 95:
        return 3
    if avg >= 80:
        return 2
    if avg >= 60:
        return 1
    return 0


def selection(st: dict, n: int) -> list[bool]:
    raw = st.get("sel")
    if not isinstance(raw, list) or len(raw) != n:
        st["sel"] = [True] * n
        return [True] * n
    return [bool(x) for x in raw]


def set_selection(st: dict, sel: list[bool]) -> list[bool]:
    sel = [bool(x) for x in sel]
    if not sel or not any(sel):
        sel = [True] + [False] * (len(sel) - 1)  # хотя бы одно
    st["sel"] = sel
    return sel


def current_scores(st: dict) -> dict[int, int]:
    out: dict[int, int] = {}
    for k, v in (st.get("current") or {}).items():
        try:
            out[int(k)] = int(v or 0)
        except (TypeError, ValueError):
            continue
    return out


def save_current(st: dict, scores: dict[int, int]) -> None:
    st["current"] = {str(k): int(v) for k, v in scores.items() if int(v or 0) > 0}


def is_run_complete(scores: dict[int, int], sel: list[bool]) -> bool:
    if int(scores.get(WORD_KEY, 0) or 0) < FLIP_OK:
        return False
    if not any(sel):
        return False
    return all(int(scores.get(i, 0) or 0) >= FLIP_OK for i, on in enumerate(sel) if on)


def run_average(scores: dict[int, int], sel: list[bool]) -> float:
    parts = [int(scores.get(WORD_KEY, 0) or 0)]
    parts += [int(scores.get(i, 0) or 0) for i, on in enumerate(sel) if on]
    return round(sum(parts) / len(parts), 1) if parts else 0.0


def next_active(scores: dict[int, int], sel: list[bool], cur: int) -> int:
    """После зачёта — первое отмеченное предложение, ещё не закрытое (как десктоп on_speech)."""
    for j, on in enumerate(sel):
        if on and scores.get(j, 0) < FLIP_OK:
            return j
    return cur


def record_sentence(st: dict, slug: str, si: int, score: int, *, ok: bool, today: str) -> int:
    """XP раз в день на slug+индекс при успехе (3)."""
    key = f"{slug}:{si}"
    st["best"][str(si)] = max(int(st["best"].get(str(si), 0) or 0), score)
    st["flips"] = int(st.get("flips", 0) or 0) + 1
    if ok:
        st["ok"] = int(st.get("ok", 0) or 0) + 1
        if award_once(st, f"warehouse:{key}:{today}"):
            return 3
    return 0


def finish_pass(card, st: dict, slug: str, scores: dict[int, int], sel: list[bool], default_goal: int,
                today: str | None = None) -> dict:
    """Порт warehouse.finish_pass. card — CardProgress (wh_* поля). status: incomplete|weak|pass|cleared."""
    today = today or dt.date.today().isoformat()
    if not is_run_complete(scores, sel):
        save_current(st, scores)
        return {"status": "incomplete"}
    avg = run_average(scores, sel)
    stars = stars_for_avg(avg)
    score_map = {str(WORD_KEY): int(scores.get(WORD_KEY, 0) or 0)}
    for i, on in enumerate(sel):
        if on:
            score_map[str(i)] = int(scores.get(i, 0) or 0)
    goal = int(card.wh_goal or default_goal or DEFAULT_PASSES)
    if avg < PASS_QUALITY:
        st["current"] = {}
        return {"status": "weak", "avg": avg, "stars": stars, "done": len(st["passes"]), "goal": goal}
    st["passes"].append({"avg": avg, "stars": stars, "scores": score_map, "day": today})
    st["current"] = {}
    done = len(st["passes"])
    card.wh_runs = done
    xp = 2 if award_once(st, f"warehouse:pass:{slug}:{done}:{today}") else 0
    if done < goal:
        return {"status": "pass", "avg": avg, "stars": stars, "done": done, "goal": goal, "xp": xp}
    avgs = [float(p.get("avg") or 0) for p in st["passes"]]
    final_avg = round(sum(avgs) / len(avgs), 1) if avgs else avg
    final_stars = max(int(p.get("stars") or 0) for p in st["passes"])
    prev = st.get("cleared") if isinstance(st.get("cleared"), dict) else None
    prev_stars = int((prev or {}).get("stars", 0) or 0)
    first = prev is None
    st["cleared"] = {
        "stars": max(prev_stars, final_stars),
        "avg": max(float((prev or {}).get("avg", 0) or 0), final_avg),
        "scores": st["passes"][-1].get("scores") or score_map,
        "day": today,
        "passes": done,
    }
    card.wh_stars = st["cleared"]["stars"]
    card.wh_avg = st["cleared"]["avg"]
    card.wh_state = "done"
    st["passes"] = []
    c_xp = 0
    improved = final_stars > prev_stars
    if improved:
        gain = 5 * (final_stars - prev_stars)
        if award_once(st, f"warehouse:clear:{slug}:{final_stars}"):
            c_xp = gain
        elif first and award_once(st, f"warehouse:clear:{slug}"):
            c_xp = 5 * final_stars
    return {"status": "cleared", "avg": card.wh_avg, "stars": card.wh_stars, "done": done, "goal": goal,
            "xp": xp + c_xp, "improved": improved or first}


def clear_run_progress(st: dict) -> None:
    """Сброс прогонов/текущих баллов/лучших (возврат на склад)."""
    st["current"] = {}
    st["passes"] = []
    st["best"] = {}
    st.pop("cleared", None)
