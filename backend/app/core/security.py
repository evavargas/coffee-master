"""Password hashing and JWT helpers.

Access tokens and email tokens share the same signing key but carry a
`purpose` claim, so a token issued for one flow cannot be used in another.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

PURPOSE_ACCESS = "access"
# PURPOSE_CONFIRM_EMAIL and PURPOSE_RESET_PASSWORD label rows of the VerificationCode
# table (the `purpose` column), not JWT purposes anymore.
PURPOSE_CONFIRM_EMAIL = "confirm_email"
PURPOSE_RESET_PASSWORD = "reset_password"
# JWT purpose for the short-lived session token issued after a reset code is verified.
PURPOSE_RESET_PASSWORD_VERIFIED = "reset_password_verified"

_password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hasher.verify(password, password_hash)


def generate_verification_code() -> str:
    """Cryptographically unpredictable 6-digit numeric code, zero-padded."""
    return f"{secrets.randbelow(1_000_000):06d}"


def password_fingerprint(password_hash: str) -> str:
    """Short, non-reversible tag of the current hash. Used to make reset tokens single-use."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_token(subject: str, purpose: str, expires_in: timedelta, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "purpose": purpose,
        "iat": now,
        "exp": now + expires_in,
        **(extra or {}),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_purpose: str) -> dict[str, Any]:
    """Return the claims of a valid token. Raises jwt.InvalidTokenError otherwise."""
    settings = get_settings()
    claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if claims.get("purpose") != expected_purpose:
        raise jwt.InvalidTokenError("Token purpose mismatch")
    return claims
