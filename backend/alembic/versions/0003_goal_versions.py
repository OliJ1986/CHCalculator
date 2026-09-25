"""add effective-dated carbohydrate goals

Revision ID: 0003_goal_versions
Revises: 0002_meal_log_snapshot
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_goal_versions"
down_revision: Union[str, None] = "0002_meal_log_snapshot"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "goal_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("daily_target_g", sa.Numeric(precision=12, scale=3), nullable=True),
        sa.Column("meal_targets", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id", "effective_date", name="uq_goal_versions_profile_effective_date"),
    )
    op.create_index("ix_goal_versions_profile_effective_date", "goal_versions", ["profile_id", "effective_date"])


def downgrade() -> None:
    op.drop_index("ix_goal_versions_profile_effective_date", table_name="goal_versions")
    op.drop_table("goal_versions")
