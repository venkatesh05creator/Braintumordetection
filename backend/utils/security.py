"""
JWT authentication and bcrypt password hashing utilities.

Security properties:
  - Passwords: bcrypt with cost factor 12 (≈ 250ms per hash, brute-force resistant)
  - Access tokens: HS256 signed, 15-minute expiry
  - Refresh tokens: HS256 signed, 7-day expiry
  - Token claims include: sub (user_id), role, type (access|refresh)
"""

from datetime import datetime, timedelta, timezone
from typing import Literal

from jose import JWTError, jwt
# pyrefly: ignore [missing-import]
import bcrypt

from config import settings

# ── Password hashing ──────────────────────────────────────────────────────────


def hash_password(plain_password: str) -> str:
    """Return bcrypt hash of the given plain-text password."""
    password_bytes = plain_password.encode('utf-8')
    # Use rounds=12 as defined in the properties
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain-text password against stored bcrypt hash."""
    try:
        password_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False


# ── JWT token creation ────────────────────────────────────────────────────────

def create_access_token(user_id: int, role: str) -> str:
    """Create a short-lived JWT access token (15 minutes)."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: int, role: str) -> str:
    """Create a long-lived JWT refresh token (7 days)."""
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ── JWT token verification ────────────────────────────────────────────────────

def decode_token(token: str, expected_type: Literal["access", "refresh"] = "access") -> dict:
    """
    Decode and validate a JWT token.

    Raises:
        JWTError: If token is invalid, expired, or wrong type.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise JWTError("Invalid or expired token")

    token_type = payload.get("type")
    if token_type != expected_type:
        raise JWTError(f"Expected {expected_type} token, got {token_type}")

    return payload
