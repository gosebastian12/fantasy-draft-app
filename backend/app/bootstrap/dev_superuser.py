"""Optional local/dev bootstrap for a known login (see Settings.dev_superuser_*)."""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.core.config import Settings
from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models.user import User

logger = logging.getLogger(__name__)


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
