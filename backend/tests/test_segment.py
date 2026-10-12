"""10+ сложных случаев разбиения текста (фаза 1)."""

from __future__ import annotations

import unittest

from app.segment import join_hard_hyphens, segment_text, split_paragraphs, split_sentences


class SegmentTest(unittest.TestCase):
    def test_hard_hyphen_join(self) -> None:
        raw = "The won-\nderful world"
        self.assertEqual(join_hard_hyphens(raw), "The wonderful world")

    def test_paragraphs_blank_line(self) -> None:
        text = "First para.\n\nSecond para."
        paras = split_paragraphs(text)
        self.assertEqual(len(paras), 2)
        self.assertEqual(paras[0].body, "First para.")
        self.assertEqual(paras[1].body, "Second para.")

    def test_single_newline_inside_para(self) -> None:
        text = "Line one\nline two still same para."
        paras = split_paragraphs(text)
        self.assertEqual(len(paras), 1)
        self.assertIn("line two", paras[0].body)

    def test_abbrev_mr_not_split(self) -> None:
        sents = split_sentences("Mr. Smith went home. Then he slept.")
        self.assertEqual(len(sents), 2)
        self.assertTrue(sents[0].body.startswith("Mr."))

    def test_abbrev_eg(self) -> None:
        sents = split_sentences("Use tools, e.g. a hammer. Next.")
        self.assertEqual(len(sents), 2)

    def test_ellipsis(self) -> None:
        sents = split_sentences("Wait… What happened?")
        self.assertEqual(len(sents), 2)

    def test_quotes_after_period(self) -> None:
        sents = split_sentences('He said "Hello." Then left.')
        self.assertGreaterEqual(len(sents), 2)

    def test_question_exclaim(self) -> None:
        sents = split_sentences("Really?! Yes!")
        self.assertEqual(len(sents), 2)

    def test_cyrillic_abbrev(self) -> None:
        sents = split_sentences("См. рис. 1. Далее текст.")
        # см. / рис. — сокращения
        self.assertGreaterEqual(len(sents), 1)
        self.assertLessEqual(len(sents), 3)

    def test_offsets_monotonic(self) -> None:
        data = segment_text("Hello world. Second sentence.\n\nNew paragraph!")
        prev = -1
        for s in data["sentences"]:
            self.assertGreaterEqual(s["char_start"], prev)
            self.assertGreater(s["char_end"], s["char_start"])
            prev = s["char_end"]
        self.assertGreaterEqual(len(data["sentences"]), 3)
        self.assertEqual(len(data["paragraphs"]), 2)

    def test_empty(self) -> None:
        data = segment_text("   \n\n  ")
        self.assertEqual(data["paragraphs"], [])
        self.assertEqual(data["sentences"], [])


class AlignTest(unittest.TestCase):
    def test_simple_1to1(self) -> None:
        from app.align import gale_church_align

        pairs = gale_church_align(
            ["Hello world.", "Second."],
            ["Привет мир.", "Второе."],
        )
        aligned = [p for p in pairs if p.status == "aligned"]
        self.assertGreaterEqual(len(aligned) / max(len(pairs), 1), 0.9)

    def test_uneven_marks_unaligned(self) -> None:
        from app.align import gale_church_align

        pairs = gale_church_align(
            ["Only source."],
            ["A.", "B.", "C.", "D.", "E."],
        )
        self.assertTrue(any(p.status == "unaligned" for p in pairs))


if __name__ == "__main__":
    unittest.main()
