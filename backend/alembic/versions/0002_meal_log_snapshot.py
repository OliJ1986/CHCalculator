"""add profiles and meal snapshot log

Revision ID: 0002_meal_log_snapshot
Revises: 0001_initial_foods
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_meal_log_snapshot"
down_revision: Union[str, None] = "0001_initial_foods"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "meal_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("food_id", sa.String(length=36), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("amount_g", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("meal_category", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("calculated_carbs_g", sa.Numeric(precision=14, scale=6), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["food_id"], ["foods.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id", "idempotency_key", name="uq_meal_entries_profile_idempotency"),
    )
    op.create_index("ix_meal_entries_profile_local_date", "meal_entries", ["profile_id", "local_date"])


def downgrade() -> None:
    op.drop_index("ix_meal_entries_profile_local_date", table_name="meal_entries")
    op.drop_table("meal_entries")
    op.drop_table("profiles")
