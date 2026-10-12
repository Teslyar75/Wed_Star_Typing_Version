"""texts / paragraphs / sentences / segments

Revision ID: 001
Revises:
Create Date: 2026-04-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "texts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(512), server_default=""),
        sa.Column("lang", sa.String(16), server_default="und"),
        sa.Column("source", sa.String(64), server_default="upload"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "paragraphs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("text_id", sa.Integer(), sa.ForeignKey("texts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("char_start", sa.Integer(), server_default="0"),
        sa.Column("char_end", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("text_id", "idx", name="uq_para_text_idx"),
    )
    op.create_index("ix_paragraphs_text_id", "paragraphs", ["text_id"])
    op.create_table(
        "sentences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("text_id", sa.Integer(), sa.ForeignKey("texts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("paragraph_id", sa.Integer(), sa.ForeignKey("paragraphs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("para_idx", sa.Integer(), server_default="0"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("char_start", sa.Integer(), server_default="0"),
        sa.Column("char_end", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("text_id", "idx", name="uq_sent_text_idx"),
    )
    op.create_index("ix_sentences_text_id", "sentences", ["text_id"])
    op.create_table(
        "segments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("text_id", sa.Integer(), sa.ForeignKey("texts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("para_idx", sa.Integer(), server_default="0"),
        sa.Column("original", sa.Text(), server_default=""),
        sa.Column("translation", sa.Text(), server_default=""),
        sa.Column("status", sa.String(16), server_default="aligned"),
        sa.Column("original_sentence_id", sa.Integer(), sa.ForeignKey("sentences.id"), nullable=True),
        sa.Column("char_start", sa.Integer(), server_default="0"),
        sa.Column("char_end", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("text_id", "idx", name="uq_seg_text_idx"),
    )
    op.create_index("ix_segments_text_id", "segments", ["text_id"])


def downgrade() -> None:
    op.drop_table("segments")
    op.drop_table("sentences")
    op.drop_table("paragraphs")
    op.drop_table("texts")
