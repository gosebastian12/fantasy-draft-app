from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Team(Base):
    """Fantasy team within a league (owned by a user)."""

    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("league_id", "user_id", name="uq_team_league_owner"),)

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120))
    draft_position: Mapped[Optional[int]] = mapped_column(Integer)
    faab_budget_minor: Mapped[Decimal] = mapped_column(
        Numeric(precision=12, scale=2),
        default=Decimal("100.00"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now().astimezone()
    )

    league = relationship("League", back_populates="teams")
    owner = relationship("User", back_populates="teams")
    roster_entries = relationship("RosterEntry", back_populates="team", cascade="all, delete-orphan")
    draft_queue_entries = relationship(
        "DraftQueueEntry", back_populates="team", cascade="all, delete-orphan"
    )
    owned_assets = relationship(
        "Asset",
        foreign_keys="[Asset.owner_team_id]",
        back_populates="owner",
        cascade="all, delete-orphan",
    )
