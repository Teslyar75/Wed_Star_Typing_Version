"""Каталог учебных миссий печати (порт stamina/missions.py без i18n-зависимости)."""

from __future__ import annotations

import random
from typing import Any

WORDS_EN = """
a about after again air all also always am an and any are around as ask at
away back be because been before began being best better big black blue body
book both boy bring but by call came can car care carry change child city
close cold come could country cut dark day did do does dog done door down
draw dream during each early earth east eat end enough even ever every eye
face fall family far fast father feel few field find fine fire first fish
five fly follow food for form found four free friend from full game gave get
girl give glad go gold good got great green grow had half hand hard has have
he head hear heard help her here high hill him his hold home horse hot house
how idea if in into is it its jump just keep kind king knew know land large
last late laugh learn leave left less let life light like line list little
live long look lost love made make man many map mark may me mean men might
mile mind miss moon more most mother move much must my name near need never
new next night no north not note now number of off often oil old on once one
only open or order other our out over own page paper part pass past people
pick place plan plant play point press pull put quick quiet rain ran reach
read ready real red rest right river road rock room round run safe said same
sat saw say school sea second see seem self send set shall ship short should
show side sign simple since sing sit six size sky sleep slow small snow so
some song soon sound south space spell stand star start state stay step still
stop story street strong such sun sure swim table tail take talk tell ten
than that the their them then there these they thing think this those though
three through time to today together told too took top toward tree true try
turn two under until up upon us use very voice walk wall want warm was watch
water way we well went were west what wheel when where which while white who
whole why wide wild will wind window with without word work world would write
year yes yet you young your zero zone jazz quiz fuel orbit planet rocket comet
galaxy pilot signal radar engine launch crew deck hatch laser mission module
""".split()

WORDS_RU = """
а без более большой будет бы был была были было быть в вам вас ваш весь вдруг
ведь вес вода вот время все всегда всё вы где глаз год голова город да даже два
дверь дело день для до дом дорога друг думать душа его ее если есть ещё жизнь
жить за звезда земля знать и или им имя их к как какой когда кто куда ли лицо
лишь луна люди мать между меня мир мне много может можно мой мы на над надо нас
наш не него нет ни нибудь никогда ничего но новый ночь ну о об один она они оно
от опять перед по под после потом почему почти при про раз разве рука с сам свое
свой себе себя сейчас сказал сказала слово совсем так там твой тогда того тоже
только тот три тут ты у уж уже улица уметь хороший хотеть хоть чего чей через
что чтобы чуть чья эта эти это я язык ясный яркий юный яблоко якорь яхта
""".split()

PASS_ACCURACY = 92.0


def _m(mid: str, lang: str, num: int, title: str, sector: str, keys: str, new: str, goal: int) -> dict[str, Any]:
    return {
        "id": mid,
        "lang": lang,
        "num": num,
        "title": title,
        "sector": sector,
        "keys": keys,
        "new": new,
        "goal": goal,
        "kind": "drill",
    }


# Пока названия/секторы на русском для обеих раскладок (как десктопный UI ru).
# Позже — перевод по языку интерфейса, не по EN/RU клавиатуре.
_TITLES = [
    ("Стыковка", "Домашний ряд"),
    ("Орбита", "Домашний ряд"),
    ("Притяжение", "Домашний ряд"),
    ("Домашний ряд", "Домашний ряд"),
    ("Верхняя палуба I", "Верхний ряд"),
    ("Верхняя палуба II", "Верхний ряд"),
    ("Нижний отсек I", "Нижний ряд"),
    ("Нижний отсек II", "Нижний ряд"),
    ("Гиперпрыжок", "Все буквы"),
    ("Коды доступа", "Цифры"),
]
_EN = [
    (*_TITLES[0], "fj", "fj", 50),
    (*_TITLES[1], "fjdk", "dk", 60),
    (*_TITLES[2], "fjdksl", "sl", 70),
    (*_TITLES[3], "asdfghjkl", "agh", 80),
    (*_TITLES[4], "asdfghjkleiru", "eiru", 90),
    (*_TITLES[5], "asdfghjkleirutywoqp", "tywoqp", 100),
    (*_TITLES[6], "asdfghjkleirutywoqpvmcnb", "vmcnb", 110),
    (*_TITLES[7], "abcdefghijklmnopqrstuvwxyz", "xz", 120),
    (*_TITLES[8], "abcdefghijklmnopqrstuvwxyz", "", 140),
    (*_TITLES[9], "abcdefghijklmnopqrstuvwxyz0123456789", "0123456789", 110),
]
_RU = [
    (*_TITLES[0], "ао", "ао", 50),
    (*_TITLES[1], "аовл", "вл", 60),
    (*_TITLES[2], "аовлыд", "ыд", 70),
    (*_TITLES[3], "фывапролджэ", "фпржэ", 80),
    (*_TITLES[4], "фывапролджэкенг", "кенг", 90),
    (*_TITLES[5], "фывапролджэкенгуцшщйзхъ", "уцшщйзхъ", 100),
    (*_TITLES[6], "фывапролджэкенгуцшщйзхъмитьсб", "митьсб", 110),
    (*_TITLES[7], "абвгдеёжзийклмнопрстуфхцчшщъыьэюя", "ячюё", 120),
    (*_TITLES[8], "абвгдеёжзийклмнопрстуфхцчшщъыьэюя", "", 140),
    (*_TITLES[9], "абвгдеёжзийклмнопрстуфхцчшщъыьэюя0123456789", "0123456789", 110),
]

MISSIONS: list[dict[str, Any]] = []
for i, (title, sector, keys, new, goal) in enumerate(_EN, 1):
    MISSIONS.append(_m(f"en-{i:02d}", "en", i, title, sector, keys, new, goal))
for i, (title, sector, keys, new, goal) in enumerate(_RU, 1):
    MISSIONS.append(_m(f"ru-{i:02d}", "ru", i, title, sector, keys, new, goal))

MISSION_BY_ID = {m["id"]: m for m in MISSIONS}


def missions_for(lang: str) -> list[dict[str, Any]]:
    return [m for m in MISSIONS if m["lang"] == lang]


def next_mission(mid: str) -> dict[str, Any] | None:
    m = MISSION_BY_ID.get(mid)
    if not m:
        return None
    return MISSION_BY_ID.get(f"{m['lang']}-{m['num'] + 1:02d}")


def stars_for(acc: float, cpm: float, goal: float) -> int:
    if acc < PASS_ACCURACY:
        return 0
    if acc >= 98 and cpm >= goal * 1.25:
        return 3
    if acc >= 95 and cpm >= goal:
        return 2
    return 1


def xp_for_stars(stars: int, chars: int) -> int:
    if stars <= 0:
        return 0
    return max(5, chars // 20) + stars * 8


def _pseudo_word(rng: random.Random, letters: str, focus: str) -> str:
    n = rng.randint(2, 5)
    pool = letters + focus * 3 if focus else letters
    if not pool:
        pool = "abc"
    return "".join(rng.choice(pool) for _ in range(n))


def _build(rng: random.Random, words: list[str], letters: str, focus: str, length: int, real_share: float) -> str:
    out: list[str] = []
    size = 0
    focused = [w for w in words if focus and any(ch in w for ch in focus)]
    while size < length:
        if words and rng.random() < real_share:
            w = rng.choice(focused) if focused and rng.random() < 0.6 else rng.choice(words)
        else:
            w = _pseudo_word(rng, letters, focus)
        if out and w == out[-1]:
            continue
        out.append(w)
        size += len(w) + 1
    return " ".join(out)


def generate_mission_text(mission: dict[str, Any], rng: random.Random | None = None, length: int = 180) -> str:
    rng = rng or random.Random()
    letters = "".join(ch for ch in mission["keys"] if not ch.isdigit())
    source = WORDS_EN if mission["lang"] == "en" else WORDS_RU
    allowed = set(mission["keys"])
    words = [w for w in source if set(w) <= allowed]
    if mission["new"].isdigit():
        out: list[str] = []
        size = 0
        while size < length:
            w = str(rng.randint(1, 9999)) if rng.random() < 0.4 else (rng.choice(words) if words else "42")
            out.append(w)
            size += len(w) + 1
        return " ".join(out)
    real_share = 0.0 if len(words) < 6 else (0.9 if len(words) > 60 else 0.55)
    if not mission["new"]:
        real_share, length = 1.0, 260
    return _build(rng, words, letters or "asdf", mission["new"], length, real_share)


def generate_repair_text(weak: list[str], lang: str, rng: random.Random | None = None, length: int = 180) -> str:
    rng = rng or random.Random()
    source = WORDS_EN if lang == "en" else WORDS_RU
    focus = "".join(ch for ch in weak if ch.isalpha())
    if not focus:
        focus = "".join(weak) or ("fj" if lang == "en" else "ао")
    letters = "".join(sorted(set("".join(source))))
    words = [w for w in source if any(ch in w for ch in focus)]
    return _build(rng, words or source, letters, focus, length, 0.8)


# Звания (порт stamina/missions.RANKS) — имена стабильные RU, UI переводит при нужде.
RANKS: list[tuple[int, str]] = [
    (0, "Кадет"),
    (100, "Пилот-стажёр"),
    (300, "Мичман"),
    (700, "Лейтенант"),
    (1500, "Капитан-лейтенант"),
    (3000, "Капитан"),
    (6000, "Коммодор"),
    (12000, "Адмирал флота"),
]


def rank_for(xp: int) -> tuple[str, int, int | None]:
    """(звание, порог текущего, порог следующего или None)."""
    current = RANKS[0]
    nxt: int | None = None
    for i, (threshold, name) in enumerate(RANKS):
        if xp >= threshold:
            current = (threshold, name)
            nxt = RANKS[i + 1][0] if i + 1 < len(RANKS) else None
    return current[1], current[0], nxt
