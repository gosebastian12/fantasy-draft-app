from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import LeagueRole
from app.models.league import League, LeagueMember
from app.models.team import Team


async def user_has_league_access(session: AsyncSession, user_id: UUID, league_id: UUID) -> bool:
    member = await session.scalar(
        select(LeagueMember.id).where(
            LeagueMember.league_id == league_id,
            LeagueMember.user_id == user_id,
        )
    )
    if member is not None:
        return True
    owner_team = await session.scalar(
        select(Team.id).where(
            Team.league_id == league_id,
            Team.user_id == user_id,
        )
    )
    return owner_team is not None


async def user_is_league_commissioner(session: AsyncSession, user_id: UUID, league_id: UUID) -> bool:
    league = await session.get(League, league_id)
    if league is None:
        return False
    if league.commissioner_user_id == user_id:
        return True
    row = await session.scalar(
        select(LeagueMember.id).where(
            LeagueMember.league_id == league_id,
            LeagueMember.user_id == user_id,
            LeagueMember.role == LeagueRole.COMMISSIONER,
        )
    )
    return row is not None
