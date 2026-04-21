from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Player(Base):
    """NFL (or league) player catalog entry."""

    __tablename__ = "players"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    external_ref: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    position: Mapped[str] = mapped_column(String(8))
    nfl_team: Mapped[Optional[str]] = mapped_column(String(8))

    roster_entries = relationship("RosterEntry", back_populates="player")
