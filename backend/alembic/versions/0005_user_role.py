"""add explicit account role for extensible authorization

Revision ID: 0005_user_role
Revises: 0004_user_accounts
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_user_role"
down_revision: Union[str, None] = "0004_user_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=24), nullable=False, server_default="registered"))
    op.alter_column("users", "role", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "role")
