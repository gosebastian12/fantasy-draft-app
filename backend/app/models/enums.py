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

class PlayerPosition(str, enum.Enum):
    QB = "QB"
    RB = "RB"
    WR = "WR"
    TE = "TE"
    DST = "DST"

class NFLTeam(str, enum.Enum):
    ARI = "ARI"
    ATL = "ATL"
    BAL = "BAL"
    BUF = "BUF"
    CAR = "CAR"
    CHI = "CHI"
    CIN = "CIN"
    CLE = "CLE"
    DAL = "DAL"
    DEN = "DEN"
    DET = "DET"
    GB = "GB"
    HOU = "HOU"
    IND = "IND"
    JAX = "JAX"
    KC = "KC"
    LAR = "LAR"
    LAC = "LAC"
    LV = "LV"
    MIA = "MIA"
    MIN = "MIN"
    NE = "NE"
    NO = "NO"
    NYG = "NYG"
    NYJ = "NYJ"
    PHI = "PHI"
    PIT = "PIT"
    SF = "SF"
    SEA = "SEA"
    TB = "TB"
    TEN = "TEN"
    WSH = "WSH"