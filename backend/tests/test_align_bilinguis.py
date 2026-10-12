"""Критерий WEB_PLAN: ≥90% предложений выровнены на bilinguis-подобном фрагменте."""

from __future__ import annotations

from app.align import align_by_paragraphs, gale_church_align
from app.segment import split_paragraphs, split_sentences

# Публичный домен: фрагмент в духе bilinguis (EN ↔ RU), 1:1 по смыслу.
EN = """\
Alice was beginning to get very tired of sitting by her sister on the bank.
She had nothing to do.
Once or twice she had peeped into the book her sister was reading.
But it had no pictures or conversations in it.
"And what is the use of a book," thought Alice, "without pictures or conversations?"

So she was considering in her own mind whether the pleasure of making a daisy-chain would be worth the trouble.
Suddenly a White Rabbit with pink eyes ran close by her.
There was nothing so very remarkable in that.
But when the Rabbit actually took a watch out of its waistcoat-pocket, Alice started to her feet.
It flashed across her mind that she had never seen a rabbit with either a waistcoat-pocket or a watch to take out of it.

Burning with curiosity, she ran across the field after it.
She was just in time to see it pop down a large rabbit-hole under the hedge.
In another moment down went Alice after it, never once considering how in the world she was to get out again.
The rabbit-hole went straight on like a tunnel for some way.
Then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself.
"""

RU = """\
Алисе уже надоело сидеть без дела рядом с сестрой на берегу.
Делать было нечего.
Раз-другой она заглянула в книгу, которую читала сестра.
Но в ней не было ни картинок, ни разговоров.
«И какой толк в книге, — подумала Алиса, — без картинок и разговоров?»

Итак, она размышляла, стоит ли затевать венок из маргариток.
Вдруг мимо пробежал Белый Кролик с розовыми глазами.
В этом не было ничего особенно удивительного.
Но когда Кролик достал часы из жилетного кармана, Алиса вскочила на ноги.
Ей вдруг пришло в голову, что она никогда не видала кролика с жилетным карманом или часами.

Сгорая от любопытства, она побежала за ним через поле.
Она как раз успела увидеть, как он нырнул в большую кроличью нору под изгородью.
Мгновение спустя Алиса бросилась следом, ни разу не подумав, как она будет выбираться обратно.
Нора шла прямо, как туннель, некоторое время.
Потом внезапно обрывалась вниз так круто, что Алиса не успела и подумать об остановке.
"""


def _sent_paras(text: str) -> list[list[str]]:
    paras = split_paragraphs(text)
    out: list[list[str]] = []
    for p in paras:
        sents = [s.body.strip() for s in split_sentences(p.body) if s.body.strip()]
        if sents:
            out.append(sents)
    return out


def test_gale_church_chapter_ge_90() -> None:
    src = _sent_paras(EN)
    tgt = _sent_paras(RU)
    pairs = align_by_paragraphs(src, tgt)
    assert pairs, "expected pairs"
    aligned = sum(1 for p in pairs if p.status == "aligned" and p.original and p.translation)
    rate = aligned / len(pairs)
    assert rate >= 0.9, f"aligned {aligned}/{len(pairs)} = {rate:.2%} (<90%)"


def test_1to1_lengths_similar() -> None:
    pairs = gale_church_align(
        ["Short one.", "Another short line here."],
        ["Короткое.", "Ещё одна короткая строка."],
    )
    assert all(p.status == "aligned" for p in pairs)
