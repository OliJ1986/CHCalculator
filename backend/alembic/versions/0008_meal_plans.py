"""add profile-owned meal plan entries

Revision ID: 0008_meal_plans
Revises: 0007_recipes
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_meal_plans"
down_revision: Union[str, None] = "0007_recipes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "meal_plan_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("meal_category", sa.String(length=32), nullable=False),
        sa.Column("food_id", sa.String(length=36), nullable=True),
        sa.Column("custom_food_id", sa.String(length=36), nullable=True),
        sa.Column("recipe_id", sa.String(length=36), nullable=True),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("quantity_unit", sa.String(length=16), nullable=False),
        sa.Column("planned_carbs_g", sa.Numeric(14, 6), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["food_id"], ["foods.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["custom_food_id"], ["custom_foods.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_plan_profile_date", "meal_plan_entries", ["profile_id", "plan_date"])


def downgrade() -> None:
    op.drop_index("ix_meal_plan_profile_date", table_name="meal_plan_entries")
    op.drop_table("meal_plan_entries")
