from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RosterEntry(Base):
    """A player on a team's roster; keepers are flagged before the draft."""

    __tablename__ = "roster_entries"
    __table_args__ = (UniqueConstraint("team_id", "player_id", name="uq_roster_team_player"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
        index=True,
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"),
        index=True,
    )
    is_keeper: Mapped[bool] = mapped_column(Boolean, default=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now().astimezone()
    )

    team = relationship("Team", back_populates="roster_entries")
    player = relationship("Player", back_populates="roster_entries")
    asset = relationship("Asset", back_populates="roster_entry", uselist=False)
