from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Fantasy Draft API"
    debug: bool = False

    database_url: str = Field(
        default="postgresql+asyncpg://draft:draft@localhost:5432/fantasy_draft",
        description="Async SQLAlchemy URL",
    )

    redis_url: str = Field(default="redis://localhost:6379/0")

    jwt_secret: str = Field(default="change-me-in-production", min_length=16)
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    resend_api_key: str = ""
    otp_email_from: str = "draft@example.com"

    # Redis key prefix for OTP codes
    otp_key_prefix: str = "otp:"


@lru_cache
def get_settings() -> Settings:
    return Settings()
