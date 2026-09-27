"""add durable vision usage counters

Revision ID: 0010_vision_usage
Revises: 0009_shopping_list
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_vision_usage"
down_revision: Union[str, None] = "0009_shopping_list"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "vision_usage",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("bucket_date", sa.Date(), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("minute_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("minute_count", sa.Integer(), nullable=False),
        sa.Column("daily_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bucket_date", "scope", "subject", name="uq_vision_usage_bucket_scope_subject"),
    )
    op.create_index("ix_vision_usage_bucket", "vision_usage", ["bucket_date"])


def downgrade() -> None:
    op.drop_index("ix_vision_usage_bucket", table_name="vision_usage")
    op.drop_table("vision_usage")
