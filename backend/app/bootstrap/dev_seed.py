"""Local/dev bootstrap: superuser login + sandbox league (see Settings.dev_superuser_*)."""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.core.config import Settings
from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models.enums import LeagueRole
from app.models.league import League, LeagueMember
from app.models.team import Team
from app.models.user import User

logger = logging.getLogger(__name__)

DEV_SANDBOX_SLUG = "dev-sandbox-league"
DEV_SANDBOX_NAME = "Dev sandbox league"

# Placeholder owners so the commissioner is not required to own a team (unique per user per league).
_BOT_SPECS: tuple[tuple[str, str, str], ...] = (
    ("fantasy-draft-dev-bot-1@local.invalid", "Dev Bot One", "Dev Team One"),
    ("fantasy-draft-dev-bot-2@local.invalid", "Dev Bot Two", "Dev Team Two"),
)


async def _ensure_bot_user(session, email: str, display_name: str) -> User:
    email_l = email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email_l))
    if user is None:
        user = User(
            email=email_l,
            display_name=display_name,
            password_hash=hash_password("dev-bot-not-for-login"),
        )
        session.add(user)
        await session.flush()
    return user


async def ensure_dev_superuser(settings: Settings) -> None:
    email = (settings.dev_superuser_email or "").strip().lower()
    password = settings.dev_superuser_password or ""
    if not email or not password:
        return

    display = (settings.dev_superuser_display_name or "").strip() or None
    async with async_session_factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        pwd_hash = hash_password(password)
        if user is None:
            session.add(
                User(
                    email=email,
                    display_name=display,
                    password_hash=pwd_hash,
                )
            )
            logger.info("Dev superuser created (email=%s)", email)
        else:
            user.password_hash = pwd_hash
            if display is not None:
                user.display_name = display
            logger.info("Dev superuser password/display updated (email=%s)", email)
        await session.commit()


async def ensure_dev_sandbox_league(settings: Settings) -> None:
    if not (settings.dev_superuser_email or "").strip() or not settings.dev_superuser_password:
        return

    super_email = settings.dev_superuser_email.strip().lower()

    async with async_session_factory() as session:
        su = await session.scalar(select(User).where(User.email == super_email))
        if su is None:
            return

        league = await session.scalar(select(League).where(League.slug == DEV_SANDBOX_SLUG))
        if league is None:
            league = League(
                name=DEV_SANDBOX_NAME,
                slug=DEV_SANDBOX_SLUG,
                commissioner_user_id=su.id,
            )
            session.add(league)
            await session.flush()

            session.add(
                LeagueMember(league_id=league.id, user_id=su.id, role=LeagueRole.COMMISSIONER)
            )

            for idx, (bot_email, bot_display, team_name) in enumerate(_BOT_SPECS, start=1):
                bot = await _ensure_bot_user(session, bot_email, bot_display)
                session.add(
                    LeagueMember(league_id=league.id, user_id=bot.id, role=LeagueRole.MEMBER)
                )
                session.add(
                    Team(
                        league_id=league.id,
                        user_id=bot.id,
                        name=team_name,
                        draft_position=idx,
                    )
                )

            await session.commit()
            logger.info("Dev sandbox league created (slug=%s)", DEV_SANDBOX_SLUG)
            return

        changed = False
        if league.commissioner_user_id != su.id:
            league.commissioner_user_id = su.id
            changed = True

        mem = await session.scalar(
            select(LeagueMember).where(
                LeagueMember.league_id == league.id,
                LeagueMember.user_id == su.id,
            )
        )
        if mem is None:
            session.add(
                LeagueMember(league_id=league.id, user_id=su.id, role=LeagueRole.COMMISSIONER)
            )
            changed = True
        elif mem.role != LeagueRole.COMMISSIONER:
            mem.role = LeagueRole.COMMISSIONER
            changed = True

        teams = list((await session.scalars(select(Team).where(Team.league_id == league.id))).all())
        if len(teams) < 2:
            next_pos = len(teams) + 1
            for bot_email, bot_display, team_name in _BOT_SPECS:
                bot = await _ensure_bot_user(session, bot_email, bot_display)
                existing_team = await session.scalar(
                    select(Team).where(Team.league_id == league.id, Team.user_id == bot.id)
                )
                if existing_team is not None:
                    continue
                bot_member = await session.scalar(
                    select(LeagueMember).where(
                        LeagueMember.league_id == league.id,
                        LeagueMember.user_id == bot.id,
                    )
                )
                if bot_member is None:
                    session.add(
                        LeagueMember(league_id=league.id, user_id=bot.id, role=LeagueRole.MEMBER)
                    )
                session.add(
                    Team(
                        league_id=league.id,
                        user_id=bot.id,
                        name=team_name,
                        draft_position=next_pos,
                    )
                )
                next_pos += 1
                changed = True

        if changed:
            await session.commit()
            logger.info("Dev sandbox league repaired (slug=%s)", DEV_SANDBOX_SLUG)


async def ensure_dev_seed(settings: Settings) -> None:
    await ensure_dev_superuser(settings)
    await ensure_dev_sandbox_league(settings)
