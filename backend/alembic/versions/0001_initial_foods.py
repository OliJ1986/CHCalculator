"""create the provider food cache

Revision ID: 0001_initial_foods
Revises:
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_foods"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "foods",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("original_name", sa.String(length=300), nullable=True),
        sa.Column("normalized_name", sa.String(length=600), nullable=False),
        sa.Column("brand", sa.String(length=200), nullable=True),
        sa.Column("barcode", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_id", sa.String(length=120), nullable=False),
        sa.Column("available_carbs_100g", sa.Float(), nullable=True),
        sa.Column("serving_size_g", sa.Float(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("language", sa.String(length=12), nullable=True),
        sa.Column("country", sa.String(length=120), nullable=True),
        sa.Column("is_generic", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("source_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "source_id", name="uq_food_source_source_id"),
    )
    op.create_index("ix_foods_normalized_name", "foods", ["normalized_name"], unique=False)
    op.create_index("ix_foods_barcode", "foods", ["barcode"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_foods_barcode", table_name="foods")
    op.drop_index("ix_foods_normalized_name", table_name="foods")
    op.drop_table("foods")
