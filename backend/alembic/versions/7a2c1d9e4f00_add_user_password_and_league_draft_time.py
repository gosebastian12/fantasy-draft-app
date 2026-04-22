"""Add user password hash and league draft scheduled time.

Revision ID: 7a2c1d9e4f00
Revises: 6f9b6675131f
Create Date: 2026-04-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7a2c1d9e4f00"
down_revision: Union[str, Sequence[str], None] = "6f9b6675131f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column(
        "leagues",
        sa.Column("draft_scheduled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leagues", "draft_scheduled_at")
    op.drop_column("users", "password_hash")
