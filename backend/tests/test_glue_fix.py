"""Порт tests/test_glue_fix.py (десктоп). Склейки слов: корень (фильтры не сращивают слова) и кнопка «Проверить ИИ»."""
from pathlib import Path

import pytest

from app import glue_fix
from app.text_processing import process_text

DATA = Path(__file__).parent / "data"


def words(t):
    return t.split()


@pytest.mark.parametrize("src,expect", [
    ("of vague distaste--this was", "of vague distaste this was"),
    ("the Ministry of Truth---Ministry, in Newspeak", "the ministry of truth ministry in newspeak"),
    ("live--did live", "live did live"),
    ("nine-\nteenth century", "nineteenth century"),
    ("about forty-\nfive", "about forty-five"),
    ("сло-\nво за словом", "слово за словом"),
    ("он сказал—и ушёл", "он сказал и ушёл"),
    ("конец строки.\nНачало", "конец строки начало"),
    ("end.\r\nStart", "end start"),
    ("end,\tStart", "end start"),
])
def test_filters_never_glue(src, expect):
    assert process_text(src, glue=False) == expect
    assert process_text(src, glue=True) == expect


def test_line_ends_after_punctuation_keep_space():
    src = "It was cold.\nWinston ran;\nhe stopped!\n«Да,» — сказал он.\nПотом"
    out = process_text(src)
    assert out == "it was cold winston ran he stopped да сказал он потом"


@pytest.mark.parametrize("glued,split", [
    ("nineteenthcentury", "nineteenth century"),
    ("distastethis", "distaste this"),
    ("1984was", "1984 was"),
    ("appendixwas", "appendix was"),
    ("presumablysince", "presumably since"),
    ("ивот", "и вот"),
    ("непонял", "не понял"),
])
def test_lexicon_splits(glued, split):
    text = f"the text {glued} goes on" if glued.isascii() else f"тут {glued} дальше"
    assert split in glue_fix.repair(text)[0]


@pytest.mark.parametrize("word", ["telescreen telescreen telescreen", "pillowed", "sleepiest", "nothing", "another",
                                  "meagreness", "1984", "4th", "forty-five", "don't",
                                  "погода", "подруга", "узнал", "человечество"])
def test_real_words_untouched(word):
    text = f"x {word} y" if " " not in word else word
    assert glue_fix.repair(text)[0] == text


def test_book_words_trusted():
    text = "doublethink is doublethink and doublethink again"
    assert glue_fix.repair(text)[1] == []


def test_orwell_pipeline_has_no_glue():
    src = (DATA / "orwell_1984_ch1.txt").read_text(encoding="utf-8")
    out = process_text(src, glue=True)
    assert "distastethis" not in out and "fortyfive" not in out
    old = process_text(src.replace("-", ""), glue=False)  # как резал старый фильтр
    assert "fortyfive" in old
    fixed, fixes = glue_fix.repair(old)
    assert "forty five" in fixed
    assert len(fixes) >= 3


def test_russian_and_other_sample():
    ru = ("Он посмотрел в окно.\nДождь шёл—не переставая.\nИвот наконец-то\nпришло утро; "
          "все спали…\nА потом—тишина.")
    out = process_text(ru, glue=True)
    assert out == "он посмотрел в окно дождь шёл не переставая и вот наконец-то пришло утро все спали а потом тишина"
    en = "Call me Ishmael.\nSome years ago--never mind how long precisely--having little money"
    assert process_text(en, glue=True) == ("call me ishmael some years ago never mind how long precisely "
                                "having little money")


def test_remap_index():
    text = "aa distastethis bb"
    new, fixes = glue_fix.repair(text)
    assert new == "aa distaste this bb"
    i = text.index("bb")
    assert new[glue_fix.remap_index(text, fixes, i):].startswith("bb")


# --- ложные разрезы: настоящие слова и авторские сложные слова не трогаем ---
import pytest as _pt
from app import glue_fix as _g


@_pt.mark.parametrize("word", ["dogeared", "execrate", "matchwood", "concertinalike", "goodwise",
                               "speedwise", "overfulfilment", "underheated", "malreported"])
def test_false_split_guard(word):
    assert _g.find(f"he said {word} and left") == []


def test_no_one_letter_fragments():
    sp = _g.find("a selfabasement x")
    assert all(" a " not in f" {f.split} " for f in sp)
    assert _g.segment("dogeared", "en") != ["do", "geared"]


def test_newspeak_family_and_productive_prefix():
    text = ("goodthink goodthinkful goodthinker minitrue minipax miniluv miniplenty "
            "the party said goodthink is good")
    assert not any(f.token.startswith("mini") or f.token.startswith("goodthink") for f in _g.find(text))


def test_repeated_glue_split_when_spaced_form_present():
    text = "the nineteenthcentury " * 4 + "in the nineteenth century"
    assert _g.find(text) and all(f.split == "nineteenth century" for f in _g.find(text))

def test_glue_fix_api_saves_prepared():
    import os
    os.environ.setdefault("DATABASE_URL", "sqlite:///./test_star_typing.db")
    from fastapi.testclient import TestClient
    from app.db import init_db, SessionLocal
    from app.main import app
    from app.models import TextDoc
    init_db()
    c = TestClient(app)
    r = c.post("/api/texts", json={"title": "G", "lang": "en", "content": "It was forty-\nfive. Distaste--this was it."})
    tid = r.json()["id"]
    body = c.get(f"/api/texts/{tid}/prepared").json()["body"]
    assert "forty-five" in body and "distaste this" in body
    with SessionLocal() as db:  # как книга, подготовленная старым фильтром
        d = db.get(TextDoc, tid)
        d.prepared = "one nineteenthcentury house and distastethis end"
        d.prep_opts = '{"lower": true, "punct": true, "spaces": true, "glue": true}'
        db.commit()
    j = c.post("/api/texts/glue-fix", json={"text_id": tid}).json()
    assert j["count"] == 2 and j["saved"]
    assert c.get(f"/api/texts/{tid}/prepared").json()["body"] == "one nineteenth century house and distaste this end"
    assert c.post("/api/texts/glue-fix", json={"text_id": tid}).json()["count"] == 0
    j = c.post("/api/texts/glue-fix", json={"text": "свой текст ивот 1984was"}).json()
    assert j["count"] >= 1 and j["examples"]


def test_prepare_text_api_own_text():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    j = c.post("/api/texts/prepare-text", json={"text": "Hello—world, forty-\nfive; 1984was it.", "opts": {}}).json()
    assert j["text"] == "hello world forty-five 1984 was it" and j["count"] == 1
    j = c.post("/api/texts/prepare-text", json={"text": "1984was", "opts": {"glue": False}}).json()
    assert j["text"] == "1984was" and j["count"] == 0
