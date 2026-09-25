"""add profile-owned recipes and ingredient snapshots

Revision ID: 0007_recipes
Revises: 0006_custom_foods
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_recipes"
down_revision: Union[str, None] = "0006_custom_foods"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recipes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("prep_minutes", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("servings", sa.Numeric(12, 3), nullable=False),
        sa.Column("total_weight_g", sa.Float(), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipes_profile_name", "recipes", ["profile_id", "name"])
    op.create_table(
        "recipe_ingredients",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("recipe_id", sa.String(length=36), nullable=False),
        sa.Column("food_id", sa.String(length=36), nullable=True),
        sa.Column("custom_food_id", sa.String(length=36), nullable=True),
        sa.Column("quantity_g", sa.Numeric(12, 3), nullable=False),
        sa.Column("calculated_carbs_g", sa.Numeric(14, 6), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["food_id"], ["foods.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["custom_food_id"], ["custom_foods.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipe_ingredients_recipe", "recipe_ingredients", ["recipe_id"])
    op.create_foreign_key("fk_meal_entries_recipe_id", "meal_entries", "recipes", ["recipe_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_meal_entries_recipe_id", "meal_entries", type_="foreignkey")
    op.drop_index("ix_recipe_ingredients_recipe", table_name="recipe_ingredients")
    op.drop_table("recipe_ingredients")
    op.drop_index("ix_recipes_profile_name", table_name="recipes")
    op.drop_table("recipes")
