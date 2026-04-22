from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import TradeStatus


class Trade(Base):
    """
    Trade proposal / ledger row. Two or three teams are expressed via `trade_participants`;
    each movement of an asset is a `TradeItem`.
    """

    __tablename__ = "trades"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"),
        index=True,
    )
    status: Mapped[TradeStatus] = mapped_column(
        SAEnum(TradeStatus, name="trade_status", native_enum=False, length=40),
        default=TradeStatus.PROPOSED,
    )
    proposed_by_team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
    )
    message: Mapped[Optional[str]] = mapped_column(String(2000))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now().astimezone()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now().astimezone(),
        onupdate=lambda: datetime.now().astimezone(),
    )

    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    league = relationship("League", back_populates="trades")
    proposed_by = relationship("Team", foreign_keys=[proposed_by_team_id])
    participants = relationship(
        "TradeParticipant",
        back_populates="trade",
        cascade="all, delete-orphan",
    )
    items = relationship("TradeItem", back_populates="trade", cascade="all, delete-orphan")


class TradeParticipant(Base):
    """Exactly 2-3 rows per trade (enforced in app / DB migration)."""

    __tablename__ = "trade_participants"
    __table_args__ = (
        UniqueConstraint("trade_id", "team_id", name="uq_trade_participant_team"),
        CheckConstraint(
            "team_order BETWEEN 1 AND 3",
            name="ck_trade_participant_order_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    trade_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trades.id", ondelete="CASCADE"),
        index=True,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
        index=True,
    )
    team_order: Mapped[int] = mapped_column()

    trade = relationship("Trade", back_populates="participants")
    team = relationship("Team")


class TradeItem(Base):
    """One directed asset movement: `from_team` sends `asset` to `to_team`."""

    __tablename__ = "trade_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    trade_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trades.id", ondelete="CASCADE"),
        index=True,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"),
        index=True,
    )
    from_team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
    )
    to_team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
    )

    trade = relationship("Trade", back_populates="items")
    asset = relationship("Asset", back_populates="trade_lines")
    from_team = relationship("Team", foreign_keys=[from_team_id])
    to_team = relationship("Team", foreign_keys=[to_team_id])
