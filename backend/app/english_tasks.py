"""Генерация заданий миссий EN (порт stamina/english/tasks.py)."""

from __future__ import annotations

import random
import re
from typing import Any

MODES = {
    "random": ("СЛУЧАЙНАЯ", "M-RND", "Задания всех типов вперемешку"),
    "speaking": ("ГОВОРЕНИЕ", "M-SPK", "Скажи слово, прочитай предложение, переведи вслух"),
    "reading": ("ЧТЕНИЕ", "M-RDG", "Пропуск в предложении, перевод, смысл в контексте"),
    "questions": ("ВОПРОСЫ", "M-QST", "Определение ↔ слово, часть речи"),
}
TYPES = {
    "speaking": ["S1", "S2", "S3"],
    "reading": ["R1", "R2", "R3"],
    "questions": ["Q1", "Q2", "Q3", "Q4"],
}
TYPE_TITLE = {
    "S1": "СКАЖИ СЛОВО",
    "S2": "ПРОЧИТАЙ ПРЕДЛОЖЕНИЕ",
    "S3": "СКАЖИ ПО-АНГЛИЙСКИ",
    "R1": "ЗАПОЛНИ ПРОПУСК",
    "R2": "ВЫБЕРИ ПЕРЕВОД",
    "R3": "ЧТО ЗНАЧИТ СЛОВО В КОНТЕКСТЕ?",
    "Q1": "ОПРЕДЕЛЕНИЕ → СЛОВО",
    "Q2": "СЛОВО → ОПРЕДЕЛЕНИЕ",
    "Q3": "КАКАЯ ЭТО ЧАСТЬ РЕЧИ?",
    "Q4": "НАПИШИ СЛОВО",
}
POS_RU = {
    "noun": "существительное",
    "verb": "глагол",
    "adjective": "прилагательное",
    "adverb": "наречие",
    "pronoun": "местоимение",
    "preposition": "предлог",
    "conjunction": "союз",
    "interjection": "междометие",
    "determiner": "определитель",
}
POS_SHORT = {
    "noun": "NOUN",
    "verb": "VERB",
    "adjective": "ADJ",
    "adverb": "ADVERB",
    "pronoun": "PRONOUN",
    "preposition": "PREP",
    "conjunction": "CONJ",
}


def _sents(w: dict[str, Any]) -> list[dict[str, str]]:
    out = []
    for s in w.get("sentences") or []:
        if isinstance(s, dict) and (s.get("en") or "").strip():
            out.append({"en": s["en"].strip(), "ru": (s.get("ru") or "").strip()})
    if not out and w.get("example"):
        out.append({"en": w["example"], "ru": (w.get("example_ru") or "").strip()})
    return out


def _find_form(sentence: str, word: str) -> str | None:
    wl = word.lower()
    for m in re.finditer(r"[A-Za-z']+", sentence):
        if m.group(0).lower() == wl or m.group(0).lower().startswith(wl):
            return m.group(0)
    return None


class TaskFactory:
    def __init__(self, pool: list[dict[str, Any]], rng: random.Random | None = None) -> None:
        self.pool = pool or []
        self.rng = rng or random.Random()

    def distract(self, w: dict[str, Any], k: int = 3) -> list[dict[str, Any]]:
        same = [
            x
            for x in self.pool
            if x.get("id") != w.get("id") and (x.get("pos") or "") == (w.get("pos") or "")
        ]
        if len(same) < k:
            same = [x for x in self.pool if x.get("id") != w.get("id")]
        return self.rng.sample(same, min(k, len(same))) if same else []

    def make(self, w: dict[str, Any], ttype: str) -> dict[str, Any] | None:
        sents = _sents(w)
        t: dict[str, Any] = {
            "type": ttype,
            "title": TYPE_TITLE.get(ttype, ttype),
            "word_id": w["id"],
            "word": w.get("word") or "",
            "translation": w.get("translation") or w.get("ru") or "",
            "definition": w.get("definition") or "",
            "pos": w.get("pos") or "",
        }
        if ttype == "S1":
            return t
        if ttype in ("S2", "R3"):
            if not sents:
                return None
            s = self.rng.choice(sents)
            t["sentence"] = s
            if ttype == "R3":
                defs = [w.get("definition") or w.get("translation") or w["word"]]
                for x in self.distract(w, 2):
                    defs.append(x.get("definition") or x.get("translation") or x.get("word") or "")
                self.rng.shuffle(defs)
                ans = defs.index(w.get("definition") or w.get("translation") or w["word"]) if (
                    w.get("definition") or w.get("translation") or w["word"]
                ) in defs else 0
                t.update(options=defs, answer=ans)
            return t
        if ttype == "S3":
            ru = [s for s in sents if s.get("ru")]
            if not ru:
                return None
            t["sentence"] = self.rng.choice(ru)
            return t
        if ttype == "R1":
            cand = [s for s in sents if _find_form(s["en"], w["word"])]
            if not cand:
                return None
            s = self.rng.choice(cand)
            form = _find_form(s["en"], w["word"]) or w["word"]
            cloze = re.sub(r"\b" + re.escape(form) + r"\b", "_____", s["en"], count=1)
            opts = [w["word"]] + [x["word"] for x in self.distract(w, 3)]
            self.rng.shuffle(opts)
            t.update(sentence=s, cloze=cloze, options=opts, answer=opts.index(w["word"]))
            return t
        if ttype == "R2":
            ru = [s for s in sents if s.get("ru")]
            if not ru:
                return None
            s = self.rng.choice(ru)
            others: list[str] = []
            for x in self.rng.sample(self.pool, min(40, len(self.pool))):
                if x.get("id") == w.get("id"):
                    continue
                xs = _sents(x)
                with_ru = [y for y in xs if y.get("ru")]
                if with_ru:
                    others.append(with_ru[0]["ru"])
                if len(others) >= 2:
                    break
            if len(others) < 2:
                return None
            opts = [s["ru"]] + others
            self.rng.shuffle(opts)
            t.update(sentence=s, options=opts, answer=opts.index(s["ru"]))
            return t
        if ttype == "Q1":
            opts = [w["word"]] + [x["word"] for x in self.distract(w, 3)]
            self.rng.shuffle(opts)
            t.update(prompt=w.get("definition") or w.get("translation") or "", options=opts, answer=opts.index(w["word"]))
            return t
        if ttype == "Q2":
            correct = w.get("definition") or w.get("translation") or w["word"]
            opts = [correct] + [
                (x.get("definition") or x.get("translation") or x.get("word") or "") for x in self.distract(w, 3)
            ]
            self.rng.shuffle(opts)
            t.update(options=opts, answer=opts.index(correct))
            return t
        if ttype == "Q3":
            pos = w.get("pos") or ""
            if pos not in POS_RU:
                return None
            others = [p for p in ("noun", "verb", "adjective", "adverb", "preposition", "pronoun") if p != pos]
            opts_p = [pos] + self.rng.sample(others, min(3, len(others)))
            self.rng.shuffle(opts_p)
            labels = [f"{POS_RU[p]} ({POS_SHORT.get(p, p).lower()})" for p in opts_p]
            t.update(options=labels, answer=opts_p.index(pos))
            return t
        if ttype == "Q4":
            t["revealed"] = 1
            return t
        return None

    def build(self, mode: str, words: list[dict[str, Any]], *, speech_ok: bool = True) -> list[dict[str, Any]]:
        if mode == "random":
            types = TYPES["reading"] + TYPES["questions"] + (TYPES["speaking"] if speech_ok else [])
        else:
            types = list(TYPES.get(mode, TYPES["questions"]))
        out: list[dict[str, Any]] = []
        last = None
        k = 0
        for w in words:
            if mode == "random":
                order = [tt for tt in types if tt != last]
                self.rng.shuffle(order)
            else:
                order = [types[(k + j) % len(types)] for j in range(len(types))]
            task = None
            for tt in order:
                task = self.make(w, tt)
                if task:
                    break
            if task is None:
                task = self.make(w, "Q1") or self.make(w, "Q2") or self.make(w, "S1")
            if task:
                out.append(task)
                last = task["type"]
                k += 1
        return out
