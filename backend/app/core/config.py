"""Application settings, loaded from environment variables and backend/.env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Anthropic (chat agent)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5-5"

    # Database
    database_url: str = "sqlite:///./mastercoffee.db"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_days: int = 7
    verification_code_minutes: int = 15
    verification_code_max_attempts: int = 5
    reset_session_token_minutes: int = 10

    # Email (Resend)
    # Set RESEND_API_KEY in backend/.env. Never put real keys in source code.
    resend_api_key: str = ""
    email_from: str = "MasterCoffe <onboarding@resend.dev>"
    frontend_url: str = "http://localhost:3000"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    # Rate limits, requests per minute per client IP
    rate_limit_auth_per_minute: int = 10
    rate_limit_chat_per_minute: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
