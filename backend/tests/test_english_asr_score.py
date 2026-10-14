"""Скоринг ASR — порт десктопа; статус модели без обязательного vosk в CI."""

from app.english_score import score_best, score_sentence


def test_score_sentence_exact():
    sc, marks = score_sentence("I learn English", "I learn English")
    assert sc == 100
    assert all(ok for _, ok in marks)


def test_score_best_picks_closest():
    sc, marks, heard = score_best(
        "the cat sat",
        ["the dog ran", "the cat sat on", "hello"],
    )
    assert heard.startswith("the cat")
    assert sc >= 66
    assert len(marks) == 3


def test_asr_status_shape():
    from app.english_asr import asr_status

    st = asr_status()
    assert "ok" in st
    assert "reason" in st
