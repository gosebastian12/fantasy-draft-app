from __future__ import annotations

import enum


class AssetKind(str, enum.Enum):
    """Which payload columns are valid on `assets`."""

    DRAFT_PICK = "draft_pick"
    FAAB = "faab"
    ROSTER_PLAYER = "roster_player"


class TradeStatus(str, enum.Enum):
    PROPOSED = "proposed"
    PENDING_COUNTER = "pending_counter"
    PENDING_LEAGUE_VOTE = "pending_league_vote"
    ACCEPTED = "accepted"
    EXECUTED = "executed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    VETOED = "vetoed"
    COMMISSIONER_EXECUTED = "commissioner_executed"
    COMMISSIONER_CANCELLED = "commissioner_cancelled"


class LeagueRole(str, enum.Enum):
    MEMBER = "member"
    COMMISSIONER = "commissioner"
