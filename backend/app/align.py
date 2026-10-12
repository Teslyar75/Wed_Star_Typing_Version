"""Выравнивание предложений оригинал ↔ перевод (упрощённый Gale–Church по длине)."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass


@dataclass
class AlignedPair:
    original: str
    translation: str
    status: str  # aligned | unaligned
    para_idx: int = 0


def _norm_len(s: str) -> float:
    return float(max(1, len(re.sub(r"\s+", "", s))))


def gale_church_align(src: list[str], tgt: list[str], *, para_idx: int = 0) -> list[AlignedPair]:
    """Динамика по длинам: 1-1, 1-0, 0-1, 2-1, 1-2."""
    if not src and not tgt:
        return []
    if not src:
        return [AlignedPair("", t, "unaligned", para_idx) for t in tgt]
    if not tgt:
        return [AlignedPair(s, "", "unaligned", para_idx) for s in src]

    n, m = len(src), len(tgt)

    def cost(s_slice: list[str], t_slice: list[str]) -> float:
        if not s_slice and not t_slice:
            return 0.0
        if not s_slice or not t_slice:
            return 25.0
        ls = sum(_norm_len(x) for x in s_slice)
        lt = sum(_norm_len(x) for x in t_slice)
        ratio = ls / lt
        return abs(math.log(max(ratio, 1e-6))) * 10.0 + abs(len(s_slice) - len(t_slice)) * 2.0

    INF = 1e18
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    bt: list[list[tuple[int, int] | None]] = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    moves = [(1, 1), (1, 0), (0, 1), (2, 1), (1, 2)]

    for i in range(n + 1):
        for j in range(m + 1):
            if dp[i][j] >= INF:
                continue
            for di, dj in moves:
                ni, nj = i + di, j + dj
                if ni > n or nj > m:
                    continue
                c = cost(src[i:ni], tgt[j:nj])
                if dp[i][j] + c < dp[ni][nj]:
                    dp[ni][nj] = dp[i][j] + c
                    bt[ni][nj] = (di, dj)

    pairs_rev: list[AlignedPair] = []
    i, j = n, m
    while i > 0 or j > 0:
        move = bt[i][j]
        if move is None:
            while i > 0:
                i -= 1
                pairs_rev.append(AlignedPair(src[i], "", "unaligned", para_idx))
            while j > 0:
                j -= 1
                pairs_rev.append(AlignedPair("", tgt[j], "unaligned", para_idx))
            break
        di, dj = move
        s_part = " ".join(src[i - di:i]) if di else ""
        t_part = " ".join(tgt[j - dj:j]) if dj else ""
        status = "aligned" if di and dj else "unaligned"
        if status == "aligned":
            ls, lt = _norm_len(s_part), _norm_len(t_part)
            if max(ls, lt) / max(min(ls, lt), 1) > 4.0:
                status = "unaligned"
        pairs_rev.append(AlignedPair(s_part, t_part, status, para_idx))
        i -= di
        j -= dj

    pairs_rev.reverse()
    return pairs_rev


def align_by_paragraphs(
    src_paras: list[list[str]],
    tgt_paras: list[list[str]],
) -> list[AlignedPair]:
    n = max(len(src_paras), len(tgt_paras))
    out: list[AlignedPair] = []
    for i in range(n):
        s = src_paras[i] if i < len(src_paras) else []
        t = tgt_paras[i] if i < len(tgt_paras) else []
        out.extend(gale_church_align(s, t, para_idx=i))
    return out
