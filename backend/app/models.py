"""Единая модель текста: Text → Paragraph → Sentence → Segment (пары для 2 языков)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TextDoc(Base):
    __tablename__ = "texts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(512), default="")
    lang: Mapped[str] = mapped_column(String(16), default="und")
    source: Mapped[str] = mapped_column(String(64), default="upload")  # upload | pdf | bilingual
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    paragraphs: Mapped[list[Paragraph]] = relationship(
        back_populates="text", cascade="all, delete-orphan", order_by="Paragraph.idx"
    )
    sentences: Mapped[list[Sentence]] = relationship(
        back_populates="text", cascade="all, delete-orphan", order_by="Sentence.idx"
    )
    segments: Mapped[list[Segment]] = relationship(
        back_populates="text", cascade="all, delete-orphan", order_by="Segment.idx"
    )


class Paragraph(Base):
    __tablename__ = "paragraphs"
    __table_args__ = (UniqueConstraint("text_id", "idx", name="uq_para_text_idx"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    text_id: Mapped[int] = mapped_column(ForeignKey("texts.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    char_start: Mapped[int] = mapped_column(Integer, default=0)
    char_end: Mapped[int] = mapped_column(Integer, default=0)

    text: Mapped[TextDoc] = relationship(back_populates="paragraphs")
    sentences: Mapped[list[Sentence]] = relationship(back_populates="paragraph")


class Sentence(Base):
    __tablename__ = "sentences"
    __table_args__ = (UniqueConstraint("text_id", "idx", name="uq_sent_text_idx"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    text_id: Mapped[int] = mapped_column(ForeignKey("texts.id", ondelete="CASCADE"), index=True)
    paragraph_id: Mapped[int | None] = mapped_column(ForeignKey("paragraphs.id", ondelete="SET NULL"), nullable=True)
    idx: Mapped[int] = mapped_column(Integer)  # глобальный индекс в тексте
    para_idx: Mapped[int] = mapped_column(Integer, default=0)
    body: Mapped[str] = mapped_column(Text)
    char_start: Mapped[int] = mapped_column(Integer, default=0)
    char_end: Mapped[int] = mapped_column(Integer, default=0)

    text: Mapped[TextDoc] = relationship(back_populates="sentences")
    paragraph: Mapped[Paragraph | None] = relationship(back_populates="sentences")


class Segment(Base):
    """Выровненная пара оригинал ↔ перевод (или unaligned)."""

    __tablename__ = "segments"
    __table_args__ = (UniqueConstraint("text_id", "idx", name="uq_seg_text_idx"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    text_id: Mapped[int] = mapped_column(ForeignKey("texts.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    para_idx: Mapped[int] = mapped_column(Integer, default=0)
    original: Mapped[str] = mapped_column(Text, default="")
    translation: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="aligned")  # aligned | unaligned
    original_sentence_id: Mapped[int | None] = mapped_column(ForeignKey("sentences.id"), nullable=True)
    char_start: Mapped[int] = mapped_column(Integer, default=0)
    char_end: Mapped[int] = mapped_column(Integer, default=0)

    text: Mapped[TextDoc] = relationship(back_populates="segments")
