"""Application settings, loaded from environment variables and backend/.env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Anthropic (chat agent)
    anthropic_api_key: str = ""
    # The cheapest current model, at low effort, to keep the cost per message down.
    anthropic_model: str = "claude-haiku-5-5"
    anthropic_effort: str = "low"
    anthropic_timeout_seconds: float = 120

    # Chat limits
    chat_daily_message_limit: int = 50
    chat_context_messages: int = 40

    # Database
    database_url: str = "sqlite:///./coffeemaster.db"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_days: int = 7
    verification_code_minutes: int = 15
    verification_code_max_attempts: int = 5
    # Per (user, purpose): minimum gap between codes and a rolling one-hour cap.
    # The hourly cap also bounds how many codes an attacker can try to guess.
    verification_code_cooldown_seconds: int = 60
    verification_code_max_per_hour: int = 5
    reset_session_token_minutes: int = 10

    # Email (Gmail SMTP, sent from the owner's own Gmail account)
    # Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in backend/.env. Never put real
    # credentials in source code. GMAIL_APP_PASSWORD is a Google "app password"
    # (myaccount.google.com/apppasswords), not the account's real password.
    gmail_address: str = ""
    gmail_app_password: str = ""
    email_from_name: str = "Coffee Master"
    # Send emails after responding. Set to false if the host stops the function once it responds.
    email_send_in_background: bool = True
    frontend_url: str = "http://localhost:3000"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    # Rate limits, requests per minute per client IP
    rate_limit_auth_per_minute: int = 10
    rate_limit_chat_per_minute: int = 20
    rate_limit_conversations_per_minute: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
