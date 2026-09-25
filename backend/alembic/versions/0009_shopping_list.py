"""add profile-owned shopping list

Revision ID: 0009_shopping_list
Revises: 0008_meal_plans
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_shopping_list"
down_revision: Union[str, None] = "0008_meal_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "shopping_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("checked", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shopping_items_profile", "shopping_items", ["profile_id"])


def downgrade() -> None:
    op.drop_index("ix_shopping_items_profile", table_name="shopping_items")
    op.drop_table("shopping_items")
