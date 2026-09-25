"""add profile-owned custom foods and meal source fields

Revision ID: 0006_custom_foods
Revises: 0005_user_role
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_custom_foods"
down_revision: Union[str, None] = "0005_user_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "custom_foods",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("brand", sa.String(length=200), nullable=True),
        sa.Column("available_carbs_100g", sa.Float(), nullable=False),
        sa.Column("dietary_fiber_100g", sa.Float(), nullable=True),
        sa.Column("serving_size_g", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id", "name", "brand", name="uq_custom_foods_profile_name_brand"),
    )
    op.create_index("ix_custom_foods_profile_name", "custom_foods", ["profile_id", "name"])
    op.add_column("meal_entries", sa.Column("custom_food_id", sa.String(length=36), nullable=True))
    op.add_column("meal_entries", sa.Column("recipe_id", sa.String(length=36), nullable=True))
    op.add_column("meal_entries", sa.Column("quantity_unit", sa.String(length=16), nullable=False, server_default="g"))
    op.create_foreign_key("fk_meal_entries_custom_food_id", "meal_entries", "custom_foods", ["custom_food_id"], ["id"], ondelete="SET NULL")
    op.alter_column("meal_entries", "quantity_unit", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_meal_entries_custom_food_id", "meal_entries", type_="foreignkey")
    op.drop_column("meal_entries", "quantity_unit")
    op.drop_column("meal_entries", "recipe_id")
    op.drop_column("meal_entries", "custom_food_id")
    op.drop_index("ix_custom_foods_profile_name", table_name="custom_foods")
    op.drop_table("custom_foods")
