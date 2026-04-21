from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AssetKind


class Asset(Base):
    """Single-table polymorphic asset: draft picks, FAAB chunks, or roster players."""

    __tablename__ = "assets"
    __table_args__ = (
        CheckConstraint(
            """
            (asset_kind = 'draft_pick' AND season_year IS NOT NULL AND round_number IS NOT NULL)
            OR (asset_kind = 'faab' AND faab_amount_minor IS NOT NULL)
            OR (asset_kind = 'roster_player' AND roster_entry_id IS NOT NULL)
            """,
            name="ck_asset_payload_matches_kind",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leagues.id", ondelete="CASCADE"),
        index=True,
    )
    owner_team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
        index=True,
    )
    asset_kind: Mapped[AssetKind] = mapped_column(
        SAEnum(AssetKind, name="asset_kind", native_enum=False, length=32)
    )

    season_year: Mapped[Optional[int]] = mapped_column(Integer)
    round_number: Mapped[Optional[int]] = mapped_column(Integer)
    original_team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    )

    faab_amount_minor: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))

    roster_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("roster_entries.id", ondelete="CASCADE"),
        unique=True,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now().astimezone()
    )

    league = relationship("League", back_populates="assets")
    owner = relationship("Team", foreign_keys=[owner_team_id], back_populates="owned_assets")
    original_team = relationship("Team", foreign_keys=[original_team_id])
    roster_entry = relationship("RosterEntry", back_populates="asset")
    trade_lines = relationship("TradeItem", back_populates="asset")
