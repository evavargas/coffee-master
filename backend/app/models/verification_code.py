"""Server-side state for 6-digit verification codes (email confirmation and password reset).

A 6-digit code is not self-verifying like a JWT (too small an entropy space to trust
alone), so each code needs a row tracking who it belongs to, how many wrong guesses
have been made, when it expires, and whether it has already been used.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.user import utc_now


def as_aware_utc(value: datetime) -> datetime:
    """SQLite drops tzinfo on round-trip, so a value read back may be naive.

    Normalize to an aware UTC datetime so it can be safely compared to `utc_now()`.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(20))
    code_hash: Mapped[str] = mapped_column(String(255))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
